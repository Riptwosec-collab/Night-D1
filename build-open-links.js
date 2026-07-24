const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('./build.js');

const outputFile = path.join(__dirname, 'dist', 'index.html');
let html = fs.readFileSync(outputFile, 'utf8');

const netflowOpenLinksOverride = String.raw`<script id="netflow-open-links-override">
(()=>{
  'use strict';

  const NETFLOW_LINKS = Object.freeze([
    { name: 'สำนักงานใหญ่ (HQ)', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3677' },
    { name: 'ศูนย์คอมพิวเตอร์จังหวัดนนทบุรี (DR)', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3723' },
    { name: 'PAK 1', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:7163' },
    { name: 'PAK 2', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3843' },
    { name: 'PAK 3', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3841' },
    { name: 'PAK 4', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:2597' },
    { name: 'PAK 5', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3853' },
    { name: 'PAK 6', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3854' },
    { name: 'PAK 7', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3855' },
    { name: 'PAK 8', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3856' },
    { name: 'PAK 9', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3861' },
    { name: 'PAK 10', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3863' },
    { name: 'PAK 11', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3865' },
    { name: 'PAK 12', url: 'https://nocorion.rd.go.th/Orion/TrafficAnalysis/NetflowNodeDetails.aspx?NetObject=NN:3866' }
  ]);

  const ACTION_SELECTOR = '.netflow-checker-action';
  const BUTTON_SELECTOR = '.netflow-checker-button';
  const STATUS_SELECTOR = '.netflow-checker-status';
  let renderQueued = false;

  function notify(message, type){
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'success');
    }
  }

  function openAllNetFlowLinks(button, status){
    if (button.disabled) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.dataset.state = '';
    status.textContent = 'กำลังเปิดลิงก์ NetFlow ทั้ง 14 รายการ...';

    NETFLOW_LINKS.forEach((site) => {
      const link = document.createElement('a');
      link.href = site.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.hidden = true;
      link.setAttribute('aria-label', 'เปิด ' + site.name);
      document.body.append(link);
      link.click();
      link.remove();
    });

    status.dataset.state = 'success';
    status.textContent = 'ส่งคำสั่งเปิดครบ 14 ลิงก์แล้ว หากแท็บขึ้นไม่ครบ ให้ Chrome อนุญาต Pop-ups สำหรับเว็บไซต์นี้ แล้วกดอีกครั้ง';
    notify('เปิดลิงก์ NetFlow ทั้งหมดแล้ว', 'success');

    window.setTimeout(() => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }, 900);
  }

  function upgradeNetFlowButton(){
    const action = document.querySelector(ACTION_SELECTOR);
    if (!action) return;

    const currentButton = action.querySelector(BUTTON_SELECTOR);
    if (!currentButton || currentButton.dataset.openLinksReady === 'true') return;

    const button = currentButton.cloneNode(true);
    button.disabled = false;
    button.dataset.openLinksReady = 'true';
    button.textContent = 'เปิดลิงก์ NetFlow ทั้งหมด (14)';
    button.setAttribute('aria-label', 'เปิดลิงก์ตรวจสอบกราฟ NetFlow ทั้ง 14 รายการในแท็บใหม่');
    button.removeAttribute('aria-busy');
    currentButton.replaceWith(button);

    let status = action.querySelector(STATUS_SELECTOR);
    if (!status) {
      status = document.createElement('p');
      status.className = 'netflow-checker-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      action.append(status);
    }

    status.dataset.state = '';
    status.textContent = 'กดครั้งเดียวเพื่อเปิด HQ, DR และ PAK 1–12 พร้อมกันในแท็บใหม่';
    button.addEventListener('click', () => openAllNetFlowLinks(button, status));
  }

  function scheduleUpgrade(){
    if (renderQueued) return;
    renderQueued = true;

    window.requestAnimationFrame(() => {
      renderQueued = false;
      upgradeNetFlowButton();
    });
  }

  function initialize(){
    upgradeNetFlowButton();

    const observer = new MutationObserver(scheduleUpgrade);
    observer.observe(document.body, {
      subtree: true,
      childList: true
    });

    window.addEventListener('hashchange', scheduleUpgrade);
    window.addEventListener('popstate', scheduleUpgrade);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
</script>`;

html = html.replace('</body>', netflowOpenLinksOverride + '</body>');
fs.writeFileSync(outputFile, html, 'utf8');

const sha256 = crypto.createHash('sha256').update(html).digest('hex');
console.log('Applied direct NetFlow multi-tab launcher');
console.log(`Final size: ${Buffer.byteLength(html)} bytes`);
console.log(`Final SHA-256: ${sha256}`);
