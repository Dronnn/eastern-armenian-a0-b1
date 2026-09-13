const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {score, words} = require('../assets/writing.js');
const ten = 'մեկ երկու երեք չորս հինգ վեց յոթ ութ ինը տաս';
assert.equal(score('մեկ երկու երեք չորս հինգ', ten).percent, 50);
assert.equal(score('մեկ երկու երեք չորս հինգ վեց յոթ ութ ինը տաս', ten).percent, 100);
assert.equal(score('մեկ երկու երեք չորս հինգ վեց յոթ ութ ինը տաս ավել', ten).percent, 91);
assert.equal(score('գիրք', 'գիրք գիրք').percent, 50);
assert.equal(score('գիրք գիրք', 'գիրք').percent, 50);
assert.equal(score('գիրք', 'գիրկ').percent, 50);
assert.equal(score('ես', 'եմ').percent, 0);
assert.equal(score('', ten).percent, 0);
assert.equal(score('HELLO', ten).percent, 0);
assert.equal(score('ԵՎ, բարև։', 'եւ բարեւ').percent, 100);
assert.equal(score('Արա՛մ', 'Արամ').percent, 100);
assert.equal(score('գիրք ջուր', 'ջուր գիրք').percent, 100);
assert.equal(score('մեկ երկու երեք չորս հինգ երեգ բարե', 'մեկ երկու երեք չորս հինգ երեկ բարև տուն ջուր հաց').percent, 60);
const rows = fs.readFileSync(path.join(__dirname, '../assets/writing-texts.tsv'), 'utf8').trim().split('\n').map(row=>row.split('\t'));
assert.equal(rows.length, 58);
for (const [id, ru1, hy1, ru2, hy2] of rows) {
  assert.ok(ru1 && ru2 && hy1 && hy2);
  assert.equal(score(hy1, hy1).percent,100);
  assert.equal(score(hy2, hy2).percent,100);
  const file = fs.readdirSync(path.join(__dirname,'../lessons')).find(f=>f.startsWith(id.padStart(4,'0')+'-'));
  const html = fs.readFileSync(path.join(__dirname,'../lessons',file),'utf8');
  assert.equal((html.match(/data-writing data-answer/g)||[]).length,2);
  assert.ok(html.includes(ru1) && html.includes(ru2));
  assert.ok(html.indexOf('writing.js') > html.indexOf('course.js'));
}
console.log('Scoring cases and all 58 lessons passed.');
for (const [a,b] of [[1,3],[4,16],[17,34],[35,58]]) {
 const sizes=rows.slice(a-1,b).map(r=>words(r[2]+' '+r[4]).length);
 console.log(`${a}–${b}: ${Math.min(...sizes)}–${Math.max(...sizes)} Armenian words per full text`);
}
