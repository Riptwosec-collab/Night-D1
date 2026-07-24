const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const root = __dirname;
const partsDir = path.join(root, 'build-parts');
const outputDir = path.join(root, 'dist');
const outputFile = path.join(outputDir, 'index.html');

const partFiles = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort((a, b) => a.localeCompare(b, 'en'));

if (partFiles.length !== 7) {
  throw new Error(`Expected 7 dashboard parts, found ${partFiles.length}`);
}

const encoded = partFiles
  .map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8'))
  .join('')
  .replace(/\s/g, '');

let html = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');

if (!html.includes('<!doctype html>') || !html.includes('Night Shift')) {
  throw new Error('Rebuilt dashboard is incomplete');
}

const dailyReportPathPatch = String.raw`<script>
(()=>{
  'use strict';

  const DAILY_REPORT_PATH = '\\\\10.1.1.94\\share noc\\รายงานประจำวัน';
  const DAILY_REPORT_PATH_PATTERN = /\\{1,2}10\\.1\\.1\\.94\\?share noc\\?รายงานประจำวัน/g;

  function normalizeDailyReportPath(value){
    if (typeof value !== 'string' || !value) return value;
    return value.replace(DAILY_REPORT_PATH_PATTERN, DAILY_REPORT_PATH);
  }

  function normalizeStoredData(value){
    if (typeof value === 'string') return normalizeDailyReportPath(value);
    if (Array.isArray(value)) return value.map(normalizeStoredData);
    if (!value || typeof value !== 'object') return value;

    Object.keys(value).forEach((key) => {
      value[key] = normalizeStoredData(value[key]);
    });
    return value;
  }

  function normalizeNightShiftStorage(){
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.toLowerCase().includes('nightshift')) continue;

        const raw = localStorage.getItem(key);
        if (!raw) continue;

        let next = raw;
        try {
          next = JSON.stringify(normalizeStoredData(JSON.parse(raw)));
        } catch {
          next = normalizeDailyReportPath(raw);
        }

        if (next !== raw) localStorage.setItem(key, next);
      }
    } catch (error) {
      console.warn('Unable to normalize Night Shift storage:', error);
    }
  }

  function normalizeElement(element){
    if (!(element instanceof Element)) return;

    if ('value' in element && typeof element.value === 'string') {
      const nextValue = normalizeDailyReportPath(element.value);
      if (nextValue !== element.value) element.value = nextValue;
    }

    ['title', 'aria-label', 'data-copy', 'data-value'].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute);
      const next = normalizeDailyReportPath(current);
      if (next !== current) element.setAttribute(attribute, next);
    });
  }

  function normalizeNode(root){
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      const nextText = normalizeDailyReportPath(root.nodeValue);
      if (nextText !== root.nodeValue) root.nodeValue = nextText;
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    if (root.nodeType === Node.ELEMENT_NODE) normalizeElement(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      const nextText = normalizeDailyReportPath(textNode.nodeValue);
      if (nextText !== textNode.nodeValue) textNode.nodeValue = nextText;
      textNode = walker.nextNode();
    }

    if ('querySelectorAll' in root) {
      root.querySelectorAll('input, textarea, option, [title], [aria-label], [data-copy], [data-value]')
        .forEach(normalizeElement);
    }
  }

  function patchClipboard(){
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = (text) => originalWriteText(normalizeDailyReportPath(String(text)));
      }
    } catch (error) {
      console.warn('Unable to patch Clipboard API:', error);
    }

    ['copyText', 'copyToClipboard', 'copyTemplate'].forEach((functionName) => {
      const original = window[functionName];
      if (typeof original !== 'function') return;

      window[functionName] = function patchedCopyFunction(text, ...args){
        return original.call(this, normalizeDailyReportPath(text), ...args);
      };
    });
  }

  function initializeDailyReportPathFix(){
    normalizeNightShiftStorage();
    normalizeNode(document.body);
    patchClipboard();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') normalizeNode(mutation.target);
        mutation.addedNodes.forEach(normalizeNode);
        if (mutation.type === 'attributes') normalizeElement(mutation.target);
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['value', 'title', 'aria-label', 'data-copy', 'data-value']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDailyReportPathFix, { once: true });
  } else {
    initializeDailyReportPathFix();
  }
})();
</script>`;

const todoDeletePatch = String.raw`<script>
(()=>{
  'use strict';
  const TODO_DELETE_KEY = 'nightShiftV9:todoDeleted';

  function deletedTodoIds(){
    return new Set(readStorage(TODO_DELETE_KEY, []));
  }

  function saveDeletedTodoIds(ids){
    writeStorage(TODO_DELETE_KEY, Array.from(ids));
  }

  allTodoItems = function(){
    const deleted = deletedTodoIds();
    const defaults = DEFAULT_TODO.filter((item) => !deleted.has(item.id));
    const custom = readStorage(STORAGE.customTodo, []);
    return defaults.concat(custom);
  };

  deleteTodoItem = function(id){
    const custom = readStorage(STORAGE.customTodo, []);
    const isCustom = custom.some((item) => item.id === id);

    if (isCustom) {
      writeStorage(STORAGE.customTodo, custom.filter((item) => item.id !== id));
    } else {
      const deleted = deletedTodoIds();
      deleted.add(id);
      saveDeletedTodoIds(deleted);
    }

    renderTodoList();
    updateAllProgress();
    showToast('ลบรายการงานแล้ว', 'success');
  };

  renderTodoList = function(){
    const list = document.querySelector('#todoList');
    if (!list) return;

    list.replaceChildren();
    const items = allTodoItems();

    if (!items.length) {
      const empty = create('article', { class: 'card todo-item v6-todo' });
      const text = create('div');
      text.append(
        create('h3', {}, 'ยังไม่มีรายการสิ่งที่ต้องทำ'),
        create('p', {}, 'เพิ่มรายการใหม่จากแบบฟอร์มด้านขวา')
      );
      empty.append(create('div', { class: 'todo-state' }, '0'), text);
      list.append(empty);
      updateTodoProgress();
      return;
    }

    items.forEach((item, index) => {
      const row = create('article', {
        class: 'card todo-item v6-todo has-action',
        dataset: { todoId: item.id }
      });

      row.append(create('div', { class: 'todo-state' }, String(index + 1)));

      const copy = create('div');
      copy.append(
        create('h3', {}, item.title),
        create('p', {}, item.detail || 'ไม่มีรายละเอียด')
      );
      row.append(copy);

      const actions = create('div', { class: 'todo-actions' });
      const remove = create('button', { type: 'button', class: 'btn danger' }, 'ลบ');
      remove.addEventListener('click', () => {
        confirmAction(
          'ลบรายการงาน',
          'ต้องการลบ “' + item.title + '” หรือไม่',
          () => deleteTodoItem(item.id)
        );
      });
      actions.append(remove);
      row.append(actions);
      list.append(row);
    });

    updateTodoProgress();
  };
})();
</script>`;

const netflowCheckerPatch = String.raw`<style id="netflow-checker-style">
  .netflow-checker-action{
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    gap:10px;
    margin-top:12px;
    padding-top:12px;
    border-top:1px solid rgba(59,130,246,.28);
  }
  .netflow-checker-button{
    min-height:42px;
    padding:9px 15px;
    border:1px solid #38bdf8;
    border-radius:10px;
    background:#082e61;
    color:#fff;
    font:700 14px Tahoma,"Noto Sans Thai",sans-serif;
    cursor:pointer;
    transition:transform .18s ease,background .18s ease,box-shadow .18s ease;
  }
  .netflow-checker-button:hover{
    background:#0b4287;
    box-shadow:0 0 20px rgba(56,189,248,.24);
    transform:translateY(-1px);
  }
  .netflow-checker-button:focus-visible{
    outline:3px solid rgba(56,189,248,.48);
    outline-offset:3px;
  }
  .netflow-checker-button:disabled{
    cursor:wait;
    opacity:.68;
    transform:none;
  }
  .netflow-checker-status{
    flex:1 1 260px;
    margin:0;
    color:#a9caef;
    font-size:13px;
    line-height:1.55;
  }
  .netflow-checker-status[data-state="success"]{color:#63e6be}
  .netflow-checker-status[data-state="error"]{color:#ff8e9b}
  @media (max-width:640px){
    .netflow-checker-button{width:100%}
    .netflow-checker-status{flex-basis:100%}
  }
</style>
<script>
(()=>{
  'use strict';

  const TARGET_TEXT = 'ตรวจสอบกราฟ netflow';
  const RUNNER_URL = 'https://raw.githubusercontent.com/Riptwosec-collab/Night-D1/main/tools/run-netflow-checker.cmd';
  const RUNNER_PAGE = 'https://github.com/Riptwosec-collab/Night-D1/blob/main/tools/run-netflow-checker.cmd';
  const ACTION_CLASS = 'netflow-checker-action';
  let renderQueued = false;

  function normalizeText(value){
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findNetFlowTarget(){
    const selectors = 'h1,h2,h3,h4,h5,h6,p,span,strong,label,a,td,th';
    return Array.from(document.querySelectorAll(selectors)).find((element) => {
      return normalizeText(element.textContent).includes(TARGET_TEXT);
    }) || null;
  }

  function findTargetContainer(target){
    return target.closest(
      'article,.card,.link-card,.task-card,.work-link-item,.panel,li,[class*="card"],[class*="task"],[class*="link-item"]'
    ) || target.parentElement;
  }

  function notify(message, type){
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'success');
    }
  }

  function setStatus(statusElement, message, state){
    statusElement.textContent = message;
    statusElement.dataset.state = state || '';
  }

  async function downloadRunner(button, statusElement){
    if (button.disabled) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    setStatus(statusElement, 'กำลังเตรียมไฟล์ตัวตรวจสอบ...', '');

    try {
      const response = await fetch(RUNNER_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');

      downloadLink.href = objectUrl;
      downloadLink.download = 'run-netflow-checker.cmd';
      downloadLink.hidden = true;
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);

      setStatus(
        statusElement,
        'ดาวน์โหลดแล้ว ให้เปิดไฟล์ run-netflow-checker.cmd จาก Downloads เพื่อเริ่มตรวจทุกลิงก์',
        'success'
      );
      notify('ดาวน์โหลดตัวตรวจสอบ NetFlow แล้ว', 'success');
    } catch (error) {
      console.error('Unable to download NetFlow checker:', error);
      setStatus(
        statusElement,
        'ดาวน์โหลดอัตโนมัติไม่สำเร็จ ระบบกำลังเปิดหน้าไฟล์สำรอง',
        'error'
      );

      const fallback = window.open(RUNNER_PAGE, '_blank', 'noopener,noreferrer');
      if (fallback) fallback.opener = null;
      notify('เปิดหน้าไฟล์ตัวตรวจสอบแทน', 'error');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function addNetFlowButton(){
    if (document.querySelector('.' + ACTION_CLASS)) return;

    const target = findNetFlowTarget();
    if (!target) return;

    const container = findTargetContainer(target);
    if (!container || container.querySelector('.' + ACTION_CLASS)) return;

    const action = document.createElement('div');
    action.className = ACTION_CLASS;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'netflow-checker-button';
    button.textContent = 'ดาวน์โหลดตัวตรวจสอบทุกลิงก์';
    button.setAttribute('aria-label', 'ดาวน์โหลดโปรแกรมตรวจสอบกราฟ NetFlow ทุกลิงก์');

    const status = document.createElement('p');
    status.className = 'netflow-checker-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'ใช้ Chrome และ Selenium ตรวจครบ 14 ลิงก์ พร้อมรายงานไซต์ที่กราฟผิดปกติ';

    button.addEventListener('click', () => downloadRunner(button, status));

    action.append(button, status);
    container.append(action);
  }

  function scheduleRender(){
    if (renderQueued) return;
    renderQueued = true;

    window.requestAnimationFrame(() => {
      renderQueued = false;
      addNetFlowButton();
    });
  }

  function initializeNetFlowCheckerButton(){
    addNetFlowButton();

    const observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, {
      subtree: true,
      childList: true
    });

    window.addEventListener('hashchange', scheduleRender);
    window.addEventListener('popstate', scheduleRender);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNetFlowCheckerButton, { once: true });
  } else {
    initializeNetFlowCheckerButton();
  }
})();
</script>`;

html = html.replace(
  '</body>',
  dailyReportPathPatch + todoDeletePatch + netflowCheckerPatch + '</body>'
);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, html, 'utf8');

const sha256 = crypto.createHash('sha256').update(html).digest('hex');
console.log(`Built ${outputFile}`);
console.log(`Size: ${Buffer.byteLength(html)} bytes`);
console.log(`SHA-256: ${sha256}`);
