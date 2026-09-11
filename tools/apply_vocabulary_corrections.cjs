'use strict';
// Keep numeric word IDs: browser progress is keyed by them.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'assets/vocab-data.js');
const source = fs.readFileSync(file, 'utf8'), context = { window: {} };
vm.runInNewContext(source, context);
const words = context.window.VOCAB;
const corrections = JSON.parse(fs.readFileSync(path.join(root, 'content/vocabulary-corrections.json'), 'utf8'));
for (const [id, patch] of Object.entries(corrections)) {
  const word = words.find(word => String(word.id) === id);
  if (!word || Object.hasOwn(patch, 'id')) throw new Error('Invalid correction ID: ' + id);
  Object.assign(word, patch);
}
const start = source.search(/window\.VOCAB\s*=/);
if (start < 0 || !/;\s*$/.test(source)) throw new Error('Unknown dictionary format');
fs.writeFileSync(file, source.slice(0, start) + 'window.VOCAB=' + JSON.stringify(words) + ';\n');
console.log('Applied corrections:', Object.keys(corrections).length, '; preserved word IDs:', words.length);
