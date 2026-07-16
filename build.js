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

html = html.replace('</body>', todoDeletePatch + '</body>');

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, html, 'utf8');

const sha256 = crypto.createHash('sha256').update(html).digest('hex');
console.log(`Built ${outputFile}`);
console.log(`Size: ${Buffer.byteLength(html)} bytes`);
console.log(`SHA-256: ${sha256}`);
