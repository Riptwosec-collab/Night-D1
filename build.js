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

  const DAILY_REPORT_PATH = String.raw\`\\\\10.1.1.94\\share noc\\รายงานประจำวัน\`;
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

html = html.replace('</body>', dailyReportPathPatch + todoDeletePatch + '</body>');

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, html, 'utf8');

const sha256 = crypto.createHash('sha256').update(html).digest('hex');
console.log(`Built ${outputFile}`);
console.log(`Size: ${Buffer.byteLength(html)} bytes`);
console.log(`SHA-256: ${sha256}`);
