from __future__ import annotations

import csv
import html
import re
import time
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
    WebDriverException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import WebDriverWait


SITES = [
    ("สำนักงานใหญ่ (HQ)", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3677"),
    ("ศูนย์คอมพิวเตอร์จังหวัดนนทบุรี (DR)", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3723"),
    ("PAK 1", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:7163"),
    ("PAK 2", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3843"),
    ("PAK 3", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3841"),
    ("PAK 4", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:2597"),
    ("PAK 5", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3853"),
    ("PAK 6", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3854"),
    ("PAK 7", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3855"),
    ("PAK 8", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3856"),
    ("PAK 9", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3861"),
    ("PAK 10", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3863"),
    ("PAK 11", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3865"),
    ("PAK 12", "https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3866"),
]

REQUIRED_WIDGETS = [
    ("Protocols", "top 10 protocols"),
    ("Endpoints", "top 10 endpoints"),
    ("Conversations", "top 10 conversations"),
    ("Applications", "top 10 applications"),
    ("Receivers", "top 5 receivers"),
]

ERROR_PATTERNS = [
    r"\bno data\b",
    r"no data available",
    r"data unavailable",
    r"no flow data",
    r"there was an error",
    r"unexpected error",
    r"internal server error",
    r"service unavailable",
    r"request timed out",
    r"unable to load",
    r"failed to load",
    r"ไม่พบข้อมูล",
    r"ไม่มีข้อมูล",
    r"เกิดข้อผิดพลาด",
]

CHART_SELECTORS = [
    "canvas",
    "svg",
    ".highcharts-container",
    ".highcharts-root",
    ".chart",
    ".graph",
    "[class*='chart']",
    "[class*='graph']",
    "img",
]

NORMAL_STATUS = "NORMAL"
ABNORMAL_STATUSES = {
    "LOGIN_REQUIRED",
    "NO_DATA_OR_ERROR",
    "INCOMPLETE_WIDGETS",
    "TIMEOUT",
    "BROWSER_ERROR",
    "SCRIPT_ERROR",
}


def safe_filename(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]+', "_", name).strip()


def compact_text(value: str, limit: int = 500) -> str:
    return re.sub(r"\s+", " ", value or "").strip()[:limit]


def get_page_text(driver: webdriver.Chrome) -> str:
    try:
        return driver.find_element(By.TAG_NAME, "body").text.lower()
    except Exception:
        return ""


def detect_login(driver: webdriver.Chrome, page_text: str) -> bool:
    current_url = driver.current_url.lower()
    password_fields = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")

    login_markers = [
        "login",
        "signin",
        "log in",
        "sign in",
        "username",
        "password",
        "ชื่อผู้ใช้",
        "รหัสผ่าน",
    ]

    return (
        "login" in current_url
        or "signin" in current_url
        or bool(password_fields)
        or any(marker in page_text for marker in login_markers)
    )


def element_is_visible_graph(element: WebElement) -> bool:
    try:
        size = element.size
        tag_name = element.tag_name.lower()
        width = float(size.get("width", 0))
        height = float(size.get("height", 0))

        minimum_width = 180 if tag_name == "img" else 100
        minimum_height = 90 if tag_name == "img" else 50

        return element.is_displayed() and width >= minimum_width and height >= minimum_height
    except (StaleElementReferenceException, WebDriverException):
        return False


def count_visible_charts(root: Any) -> int:
    unique_ids: set[str] = set()

    for selector in CHART_SELECTORS:
        try:
            for element in root.find_elements(By.CSS_SELECTOR, selector):
                if element_is_visible_graph(element):
                    unique_ids.add(element.id)
        except (StaleElementReferenceException, WebDriverException):
            continue

    return len(unique_ids)


def find_widget_heading(driver: webdriver.Chrome, widget_name: str) -> WebElement | None:
    uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    lowercase = "abcdefghijklmnopqrstuvwxyz"
    xpath = (
        "//*[self::h1 or self::h2 or self::h3 or self::h4 or self::h5 "
        "or self::h6 or self::span or self::a or self::strong or self::td or self::th "
        f"or self::div][contains(translate(normalize-space(.), '{uppercase}', "
        f"'{lowercase}'), '{widget_name}')]"
    )

    try:
        candidates = driver.find_elements(By.XPATH, xpath)
    except WebDriverException:
        return None

    ranked: list[tuple[int, int, WebElement]] = []

    for element in candidates:
        try:
            if not element.is_displayed():
                continue

            text = compact_text(element.text.lower(), 250)
            if widget_name not in text:
                continue

            tag_name = element.tag_name.lower()
            tag_score = 0 if tag_name in {"h1", "h2", "h3", "h4", "h5", "h6"} else 1
            ranked.append((tag_score, len(text), element))
        except (StaleElementReferenceException, WebDriverException):
            continue

    if not ranked:
        return None

    ranked.sort(key=lambda item: (item[0], item[1]))
    return ranked[0][2]


def resolve_widget_container(driver: webdriver.Chrome, heading: WebElement) -> WebElement:
    try:
        viewport_width = int(driver.execute_script("return window.innerWidth || 0"))
        viewport_height = int(driver.execute_script("return window.innerHeight || 0"))
    except WebDriverException:
        viewport_width = 0
        viewport_height = 0

    candidates: list[dict[str, Any]] = []
    current = heading

    for depth in range(1, 10):
        try:
            current = current.find_element(By.XPATH, "..")
            tag_name = current.tag_name.lower()
            if tag_name in {"body", "html"}:
                break

            size = current.size
            width = int(size.get("width", 0))
            height = int(size.get("height", 0))
            if width < 220 or height < 140:
                continue

            descriptor = (
                f"{current.get_attribute('id') or ''} "
                f"{current.get_attribute('class') or ''}"
            ).lower()
            is_named_panel = any(
                token in descriptor
                for token in ("widget", "resource", "panel", "card", "chart", "view")
            )
            is_page_sized = (
                bool(viewport_width and width >= viewport_width * 0.92)
                or bool(viewport_height and height >= viewport_height * 0.90)
            )

            candidates.append(
                {
                    "element": current,
                    "depth": depth,
                    "area": width * height,
                    "is_named_panel": is_named_panel,
                    "is_page_sized": is_page_sized,
                }
            )
        except (NoSuchElementException, StaleElementReferenceException, WebDriverException):
            break

    if not candidates:
        return heading

    named_panels = [
        candidate
        for candidate in candidates
        if candidate["is_named_panel"] and not candidate["is_page_sized"]
    ]
    if named_panels:
        named_panels.sort(key=lambda item: (item["area"], item["depth"]))
        return named_panels[0]["element"]

    local_candidates = [
        candidate for candidate in candidates if not candidate["is_page_sized"]
    ]
    if local_candidates:
        local_candidates.sort(key=lambda item: (item["area"], item["depth"]))
        return local_candidates[0]["element"]

    candidates.sort(key=lambda item: item["depth"])
    return candidates[0]["element"]


def inspect_widget(driver: webdriver.Chrome, widget_name: str) -> dict[str, Any]:
    heading = find_widget_heading(driver, widget_name)

    if heading is None:
        return {
            "status": "MISSING",
            "detail": "ไม่พบหัวข้อ Widget",
            "chart_count": 0,
        }

    container = resolve_widget_container(driver, heading)

    try:
        container_text = compact_text(container.text.lower(), 4000)
    except (StaleElementReferenceException, WebDriverException):
        container_text = ""

    matched_errors = [
        pattern
        for pattern in ERROR_PATTERNS
        if re.search(pattern, container_text, flags=re.IGNORECASE)
    ]
    chart_count = count_visible_charts(container)
    rate_markers = len(
        re.findall(r"\b\d+(?:\.\d+)?\s*(?:bps|kbps|mbps|gbps)\b", container_text)
    )

    if matched_errors:
        return {
            "status": "ERROR_TEXT",
            "detail": "พบข้อความ No Data/Error",
            "chart_count": chart_count,
        }

    if chart_count > 0 or rate_markers >= 2:
        return {
            "status": "OK",
            "detail": f"พบกราฟที่มองเห็นได้ {chart_count} จุด",
            "chart_count": chart_count,
        }

    return {
        "status": "NO_GRAPH",
        "detail": "พบหัวข้อ แต่ไม่พบพื้นที่กราฟที่มองเห็นได้",
        "chart_count": chart_count,
    }


def build_widget_summary(widget_results: dict[str, dict[str, Any]]) -> str:
    return " | ".join(
        f"{label}: {data['status']}"
        for label, data in widget_results.items()
    )


def save_screenshot(driver: webdriver.Chrome, path: Path) -> str:
    try:
        driver.save_screenshot(str(path))
        return str(path)
    except WebDriverException:
        return ""


def check_site(
    driver: webdriver.Chrome,
    name: str,
    url: str,
    screenshot_dir: Path,
) -> dict[str, Any]:
    started = time.time()

    result: dict[str, Any] = {
        "Site": name,
        "Status": "UNKNOWN",
        "Detail": "",
        "AbnormalWidgets": "",
        "WidgetSummary": "",
        "VisibleCharts": 0,
        "Protocols": "",
        "Endpoints": "",
        "Conversations": "",
        "Applications": "",
        "Receivers": "",
        "PageTitle": "",
        "FinalURL": "",
        "ResponseTimeSeconds": 0,
        "Screenshot": "",
        "CheckedAt": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
    }

    screenshot_path = screenshot_dir / f"{safe_filename(name)}.png"

    try:
        driver.get(url)

        WebDriverWait(driver, 40).until(
            lambda browser: browser.execute_script("return document.readyState")
            in ("interactive", "complete")
        )

        time.sleep(12)

        result["PageTitle"] = driver.title
        result["FinalURL"] = driver.current_url

        page_text = get_page_text(driver)
        result["Screenshot"] = save_screenshot(driver, screenshot_path)

        if detect_login(driver, page_text):
            result["Status"] = "LOGIN_REQUIRED"
            result["Detail"] = "พบหน้า Login หรือ Session หมดอายุ"
            return result

        page_errors = [
            pattern
            for pattern in ERROR_PATTERNS
            if re.search(pattern, page_text, flags=re.IGNORECASE)
        ]

        widget_results: dict[str, dict[str, Any]] = {}
        for key, widget_name in REQUIRED_WIDGETS:
            widget_results[key] = inspect_widget(driver, widget_name)
            result[key] = widget_results[key]["status"]

        result["WidgetSummary"] = build_widget_summary(widget_results)
        result["VisibleCharts"] = sum(
            int(data["chart_count"]) for data in widget_results.values()
        )

        abnormal_widgets = [
            label
            for label, data in widget_results.items()
            if data["status"] != "OK"
        ]
        result["AbnormalWidgets"] = ", ".join(abnormal_widgets)

        if page_errors:
            result["Status"] = "NO_DATA_OR_ERROR"
            result["Detail"] = "พบข้อความผิดปกติบนหน้าเว็บ"

        elif not abnormal_widgets:
            result["Status"] = NORMAL_STATUS
            result["Detail"] = (
                "พบครบทั้ง 5 Widget และตรวจพบกราฟที่มองเห็นได้ทุก Widget"
            )

        else:
            result["Status"] = "INCOMPLETE_WIDGETS"
            result["Detail"] = (
                "กราฟผิดปกติหรือไม่ครบ: " + ", ".join(abnormal_widgets)
            )

    except TimeoutException:
        result["Status"] = "TIMEOUT"
        result["Detail"] = "หน้าเว็บโหลดเกินเวลาที่กำหนด"
        result["Screenshot"] = save_screenshot(driver, screenshot_path)

    except WebDriverException as error:
        result["Status"] = "BROWSER_ERROR"
        result["Detail"] = compact_text(str(error), 500)
        result["Screenshot"] = save_screenshot(driver, screenshot_path)

    except Exception as error:
        result["Status"] = "SCRIPT_ERROR"
        result["Detail"] = compact_text(str(error), 500)
        result["Screenshot"] = save_screenshot(driver, screenshot_path)

    finally:
        result["ResponseTimeSeconds"] = round(time.time() - started, 2)

    return result


def write_csv(results: list[dict[str, Any]], csv_path: Path) -> None:
    fieldnames = [
        "Site",
        "Status",
        "Detail",
        "AbnormalWidgets",
        "WidgetSummary",
        "VisibleCharts",
        "Protocols",
        "Endpoints",
        "Conversations",
        "Applications",
        "Receivers",
        "PageTitle",
        "FinalURL",
        "ResponseTimeSeconds",
        "Screenshot",
        "CheckedAt",
    ]

    with csv_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)


def write_html_report(results: list[dict[str, Any]], report_path: Path) -> None:
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    normal_count = sum(result["Status"] == NORMAL_STATUS for result in results)
    abnormal_count = len(results) - normal_count

    rows = []
    for result in results:
        status_class = "normal" if result["Status"] == NORMAL_STATUS else "abnormal"
        screenshot = result.get("Screenshot", "")
        screenshot_link = (
            f'<a href="{html.escape(Path(screenshot).resolve().as_uri())}" '
            'target="_blank" rel="noopener noreferrer">ดูภาพ</a>'
            if screenshot
            else "-"
        )

        rows.append(
            "<tr>"
            f"<td>{html.escape(str(result['Site']))}</td>"
            f"<td><span class=\"status {status_class}\">"
            f"{html.escape(str(result['Status']))}</span></td>"
            f"<td>{html.escape(str(result['Detail']))}</td>"
            f"<td>{html.escape(str(result['AbnormalWidgets'] or '-'))}</td>"
            f"<td>{html.escape(str(result['WidgetSummary'] or '-'))}</td>"
            f"<td>{html.escape(str(result['ResponseTimeSeconds']))}</td>"
            f"<td>{screenshot_link}</td>"
            "</tr>"
        )

    report_html = f"""<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>รายงานตรวจสอบกราฟ NetFlow</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #020817;
      --panel: #071a35;
      --line: #15477e;
      --text: #f4f8ff;
      --muted: #9fc8ee;
      --ok: #35e59d;
      --bad: #ff6b7a;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Tahoma, "Noto Sans Thai", sans-serif;
    }}
    main {{ width: min(1500px, 96vw); margin: 28px auto; }}
    h1 {{ margin: 0 0 8px; }}
    .meta {{ color: var(--muted); margin-bottom: 18px; }}
    .summary {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }}
    .card {{
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
    }}
    .value {{ display: block; margin-top: 6px; font-size: 28px; font-weight: 800; }}
    .table-wrap {{ overflow: auto; border: 1px solid var(--line); border-radius: 14px; }}
    table {{ width: 100%; border-collapse: collapse; min-width: 1100px; background: var(--panel); }}
    th, td {{ padding: 11px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ position: sticky; top: 0; background: #09264f; }}
    .status {{ font-weight: 800; }}
    .normal {{ color: var(--ok); }}
    .abnormal {{ color: var(--bad); }}
    a {{ color: #66d9ff; }}
    @media (max-width: 760px) {{
      .summary {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main>
    <h1>รายงานตรวจสอบกราฟ NetFlow</h1>
    <div class="meta">ตรวจเมื่อ {html.escape(generated_at)}</div>
    <section class="summary" aria-label="สรุปผล">
      <article class="card">จำนวนทั้งหมด<span class="value">{len(results)}</span></article>
      <article class="card">ปกติ<span class="value normal">{normal_count}</span></article>
      <article class="card">ผิดปกติ<span class="value abnormal">{abnormal_count}</span></article>
    </section>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ไซต์</th>
            <th>สถานะ</th>
            <th>รายละเอียด</th>
            <th>Widget ผิดปกติ</th>
            <th>ผลแต่ละ Widget</th>
            <th>เวลา (วินาที)</th>
            <th>Screenshot</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows)}
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>
"""

    report_path.write_text(report_html, encoding="utf-8")


def output_base_directory() -> Path:
    desktop = Path.home() / "Desktop"
    return desktop if desktop.exists() else Path.cwd()


def main() -> None:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = output_base_directory() / f"NetFlow-Check-{timestamp}"
    screenshot_dir = output_dir / "Screenshots"

    output_dir.mkdir(parents=True, exist_ok=True)
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    chrome_options = Options()
    chrome_options.add_argument("--start-maximized")
    chrome_options.add_argument("--disable-notifications")
    chrome_options.add_argument("--disable-popup-blocking")
    chrome_options.add_argument("--ignore-certificate-errors")

    profile_dir = Path.home() / "NetFlow-Chrome-Profile"
    chrome_options.add_argument(f"--user-data-dir={profile_dir.resolve()}")

    driver = webdriver.Chrome(options=chrome_options)
    driver.set_page_load_timeout(60)

    results: list[dict[str, Any]] = []

    try:
        print("=" * 76)
        print("NETFLOW GRAPH CHECKER")
        print("=" * 76)
        print("เงื่อนไขปกติ: ต้องพบครบทั้ง 5 Widget และมีกราฟแสดงในทุก Widget")
        for _, widget_name in REQUIRED_WIDGETS:
            print("-", widget_name)
        print()

        driver.get(SITES[0][1])

        input(
            "Login SolarWinds ให้เรียบร้อย รอให้หน้า NetFlow แสดงกราฟ "
            "แล้วกด Enter เพื่อเริ่มตรวจทั้งหมด..."
        )

        total = len(SITES)

        for index, (name, url) in enumerate(SITES, start=1):
            print(f"[{index}/{total}] กำลังตรวจ {name} ...")

            result = check_site(driver, name, url, screenshot_dir)
            results.append(result)

            print(f"    {result['Status']} | {result['Detail']}")

        csv_path = output_dir / "NetFlow-Check-Result.csv"
        report_path = output_dir / "NetFlow-Check-Report.html"

        write_csv(results, csv_path)
        write_html_report(results, report_path)

        print()
        print("=" * 76)
        print("สรุปผล")
        print("=" * 76)

        for result in results:
            marker = "ปกติ" if result["Status"] == NORMAL_STATUS else "ผิดปกติ"
            print(f"{result['Site']:<42} {marker:<10} {result['Status']}")

        abnormal_sites = [
            result for result in results if result["Status"] in ABNORMAL_STATUSES
        ]

        print()
        print(f"ไซต์ปกติ: {len(results) - len(abnormal_sites)}")
        print(f"ไซต์ผิดปกติ: {len(abnormal_sites)}")
        print(f"ไฟล์ CSV: {csv_path}")
        print(f"รายงาน HTML: {report_path}")
        print(f"โฟลเดอร์ Screenshot: {screenshot_dir}")

        try:
            webbrowser.open(report_path.resolve().as_uri())
        except Exception:
            pass

        input("\nกด Enter เพื่อปิด Chrome...")

    finally:
        driver.quit()


if __name__ == "__main__":
    main()
