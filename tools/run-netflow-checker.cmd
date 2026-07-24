@echo off
setlocal EnableExtensions
chcp 65001 >nul
set PYTHONUTF8=1
title Night Shift NOC - NetFlow Graph Checker

set "APP_DIR=%LOCALAPPDATA%\NightShiftNOC\NetFlowGraphChecker"
set "SCRIPT_PATH=%APP_DIR%\netflow_graph_checker.py"
set "SCRIPT_URL=https://raw.githubusercontent.com/Riptwosec-collab/Night-D1/main/tools/netflow_graph_checker.py"

echo ============================================================
echo NIGHT SHIFT NOC - NETFLOW GRAPH CHECKER
echo ============================================================
echo.

if not exist "%APP_DIR%" mkdir "%APP_DIR%"
if errorlevel 1 (
  echo [ERROR] ไม่สามารถสร้างโฟลเดอร์ %APP_DIR% ได้
  pause
  exit /b 1
)

echo [1/4] กำลังดาวน์โหลดสคริปต์เวอร์ชันล่าสุด...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%SCRIPT_URL%' -OutFile '%SCRIPT_PATH%'"
if errorlevel 1 (
  echo [ERROR] ดาวน์โหลดสคริปต์ไม่สำเร็จ กรุณาตรวจสอบ Internet หรือ GitHub
  pause
  exit /b 1
)

set "PYTHON_CMD="
where py >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"

if not defined PYTHON_CMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
  echo [ERROR] ไม่พบ Python ในเครื่อง
  echo กรุณาติดตั้ง Python 3 และเลือก Add Python to PATH จากนั้นเปิดไฟล์นี้อีกครั้ง
  pause
  exit /b 1
)

echo [2/4] ตรวจสอบ Python...
%PYTHON_CMD% --version
if errorlevel 1 (
  echo [ERROR] เรียกใช้งาน Python ไม่สำเร็จ
  pause
  exit /b 1
)

echo [3/4] ตรวจสอบ Selenium...
%PYTHON_CMD% -c "import selenium" >nul 2>nul
if errorlevel 1 (
  echo กำลังติดตั้ง Selenium สำหรับผู้ใช้ปัจจุบัน...
  %PYTHON_CMD% -m pip install --user --disable-pip-version-check selenium
  if errorlevel 1 (
    echo [ERROR] ติดตั้ง Selenium ไม่สำเร็จ
    pause
    exit /b 1
  )
)

echo [4/4] กำลังเปิด Chrome เพื่อตรวจสอบ NetFlow...
echo เมื่อ Chrome เปิด ให้ Login SolarWinds และกลับมากด Enter ในหน้าต่างนี้
echo.
%PYTHON_CMD% "%SCRIPT_PATH%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] ตัวตรวจสอบจบการทำงานด้วยรหัส %EXIT_CODE%
) else (
  echo.
  echo ตรวจสอบเสร็จเรียบร้อย รายงานถูกบันทึกไว้บน Desktop
)

pause
exit /b %EXIT_CODE%
