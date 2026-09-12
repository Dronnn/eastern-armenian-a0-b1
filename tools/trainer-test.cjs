/* ============================================================
   Тест-харнесс тренажёра слов (Фаза 5).
   Импортирует ЧИСТУЮ логику из assets/trainer.js (module.exports)
   и реальные данные из assets/vocab-data.js, прогоняет assert-ы.

   Запуск:  node tools/trainer-test.cjs
   ============================================================ */
"use strict";
const assert = require("assert");
const path = require("path");

// --- загрузить данные (vocab-data.js пишет в window.*) ---
global.window = {};
require(path.join(__dirname, "..", "assets", "vocab-data.js"));
const VOCAB = global.window.VOCAB;
const THEMES = global.window.VOCAB_THEMES;

// --- загрузить чистую логику (UI-блок не выполнится: нет document) ---
const L = require(path.join(__dirname, "..", "assets", "trainer.js"));

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); passed++; }

// детерминированный ГПСЧ для воспроизводимости
function makeRng(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

console.log("=== Тренажёр слов — тесты логики ===\n");

/* ---------- 0. Данные ---------- */
eq(VOCAB.length, 3060, "всего слов = 3060");
eq(THEMES.length, 75, "тем = 75");
const byLvl = { A1: 0, A2: 0, B1: 0 };
VOCAB.forEach(w => { byLvl[w.level]++; });
eq(byLvl.A1, 923, "A1 = 923");
eq(byLvl.A2, 1230, "A2 = 1230");
eq(byLvl.B1, 907, "B1 = 907");
eq(byLvl.A1 + byLvl.A2 + byLvl.B1, 3060, "сумма уровней = всего");
const ids = new Set(VOCAB.map(w => w.id));
eq(ids.size, VOCAB.length, "id уникальны");
const fs = require("fs");
const lessonsDir = path.join(__dirname, "..", "lessons");
for (const file of fs.readdirSync(lessonsDir).filter(name => name.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(lessonsDir, file), "utf8");
  for (const card of html.matchAll(/<button class="flash"[^>]*>[\s\S]*?<\/button>/g)) {
    ok(/^<button[^>]*data-learn=/.test(html.slice(card.index + card[0].length)), file + ": у флешкарты есть отметка");
  }
  for (const card of html.matchAll(/<div class="letter"><div class="pair hy">[^<]+<\/div><div class="name">[^<]*<\/div><a class="audio"[^>]*>[^<]*<\/a>([\s\S]*?)<\/div>/g)) {
    ok(card[1].includes("data-learn="), file + ": у карточки с озвучкой есть отметка");
  }
  for (const match of html.matchAll(/data-learn="([^"]+)"/g)) {
    ok(match[1].startsWith("card:") || ids.has(Number(match[1])), file + ": отметка связана со словарём или учебной карточкой");
  }
}
console.log("[0] данные: 3060 (A1=923 A2=1230 B1=907), 75 темы, id уникальны — OK");

/* ---------- 1. Нормализация ввода ---------- */
eq(L.normalize("  Привет!  "), "привет", "trim + lowercase + пунктуация");
eq(L.normalize("Բարև։"), "բարև", "армянская точка ։ снимается");
eq(L.normalize("ճա­նա  պարհ"), L.normalize("ճա­նա պարհ"), "схлоп пробелов");
eq(L.normalize(null), "", "null -> пусто");
eq(L.normalize("он,  она"), "он она", "запятая -> пробел, схлоп");
// варианты
const v1 = L.variants("он, она");
ok(v1.indexOf("он") !== -1 && v1.indexOf("она") !== -1, "variants по запятой");
const v2 = L.variants("идти / ходить");
ok(v2.indexOf("идти") !== -1 && v2.indexOf("ходить") !== -1, "variants по слешу");
// checkInput: многозначный перевод — принять любой
const wMulti = { hy: "նա", ru: "он, она", tr: "на" };
ok(L.checkInput("он", wMulti, "hy2ru"), "арм→рус: принят 1-й вариант");
ok(L.checkInput("она", wMulti, "hy2ru"), "арм→рус: принят 2-й вариант");
ok(L.checkInput("ОНА!", wMulti, "hy2ru"), "арм→рус: регистр+пунктуация терпимы");
ok(!L.checkInput("оно", wMulti, "hy2ru"), "арм→рус: неверный отклонён");
ok(!L.checkInput("", wMulti, "hy2ru"), "пустой ввод -> неверно");
// ru2hy: вводят hy
const wHy = { hy: "բարև", ru: "привет", tr: "барев" };
ok(L.checkInput("Բարև։", wHy, "ru2hy"), "рус→арм: hy с точкой принят");
ok(!L.checkInput(" привет", wHy, "ru2hy"), "рус→арм: русский текст не принят как hy");
console.log("[1] нормализация и проверка ввода — OK");

/* ---------- 2. Сбор колоды ---------- */
const learnedNone = {};
// все слова, размер 10
let deck = L.buildDeck(VOCAB, { level: "all", theme: "all", pool: "all", source: "filters", size: "10", pick: {} }, learnedNone, makeRng(1));
eq(deck.length, 10, "колода размером 10");
// уровень A1, size all
deck = L.buildDeck(VOCAB, { level: "A1", theme: "all", pool: "all", source: "filters", size: "all", pick: {} }, learnedNone, makeRng(2));
eq(deck.length, 923, "A1 целиком = 923");
ok(deck.every(w => w.level === "A1"), "в колоде только A1");
// pool=new исключает выученные
const learnedSome = {};
VOCAB.filter(w => w.level === "A1").slice(0, 100).forEach(w => { learnedSome[w.id] = 1; });
deck = L.buildDeck(VOCAB, { level: "A1", theme: "all", pool: "new", source: "filters", size: "all", pick: {} }, learnedSome, makeRng(3));
eq(deck.length, 823, "A1 только новые = 923-100=823");
ok(deck.every(w => !learnedSome[w.id]), "выученные исключены");
// тема
const someTheme = THEMES[0].theme;
const themeCount = VOCAB.filter(w => w.theme === someTheme).length;
deck = L.buildDeck(VOCAB, { level: "all", theme: someTheme, pool: "all", source: "filters", size: "all", pick: {} }, learnedNone, makeRng(4));
eq(deck.length, themeCount, "колода по теме = число слов темы");
ok(deck.every(w => w.theme === someTheme), "в колоде только эта тема");
// источник pick
const pick = {}; VOCAB.slice(0, 7).forEach(w => { pick[w.id] = 1; });
deck = L.buildDeck(VOCAB, { level: "all", theme: "all", pool: "all", source: "pick", size: "all", pick: pick }, learnedNone, makeRng(5));
eq(deck.length, 7, "источник pick: 7 слов");
ok(deck.every(w => pick[w.id]), "все из подборки");
// источник both (pick ∩ A1) — берём pick из B1, фильтр A1 => 0
const pickB1 = {}; VOCAB.filter(w => w.level === "B1").slice(0, 5).forEach(w => { pickB1[w.id] = 1; });
deck = L.buildDeck(VOCAB, { level: "A1", theme: "all", pool: "all", source: "both", size: "all", pick: pickB1 }, learnedNone, makeRng(6));
eq(deck.length, 0, "both: B1-подборка ∩ A1-фильтр = пусто");
// size > доступно -> усечение до доступного
deck = L.buildDeck(VOCAB, { level: "all", theme: "all", pool: "all", source: "pick", size: "50", pick: pick }, learnedNone, makeRng(7));
eq(deck.length, 7, "size 50, но в подборке 7 -> 7");
console.log("[2] сбор колоды (фильтры/уровень/тема/pick/both/size) — OK");

/* ---------- 3. Завершаемость сессии (3 кнопки) ---------- */
// Симулируем сессию: на каждом шаге случайно выбираем learn/again/skip,
// но гарантируем, что "again" не выбирается бесконечно для одного слова.
// Проверяем: за конечное число шагов колода ОПУСТЕЕТ при любой стратегии,
// где learn/skip выбираются с положительной вероятностью.
function simulate(initDeck, strategy, maxSteps) {
  let d = initDeck.slice();
  let steps = 0;
  while (d.length > 0) {
    steps++;
    if (steps > maxSteps) return { done: false, steps: steps };
    const action = strategy(d, steps);
    d = L.applyAction(d, action);
  }
  return { done: true, steps: steps };
}
const start = VOCAB.slice(0, 20).map(w => w.id);
// стратегия А: всегда learn -> ровно N шагов
let r = simulate(start, () => "learn", 1000);
ok(r.done && r.steps === 20, "всегда learn: 20 шагов, опустела");
// стратегия Б: всегда skip -> ровно N шагов
r = simulate(start, () => "skip", 1000);
ok(r.done && r.steps === 20, "всегда skip: 20 шагов, опустела");
// стратегия В: «again» 2 раза для каждого, потом learn — завершается
const againCount = {};
r = simulate(start, (d) => {
  const id = d[0];
  againCount[id] = (againCount[id] || 0) + 1;
  return againCount[id] <= 2 ? "again" : "learn";
}, 1000);
ok(r.done, "again×2 затем learn: колода завершается");
ok(r.steps === 60, "again×2 затем learn: 20*3=60 шагов");
// стратегия Г: рандом, но learn/skip с вероятностью -> завершается почти всегда; проверим инвариант
// applyAction: learn/skip уменьшают длину на 1; again сохраняет длину. Значит
// число learn+skip == исходная длина в момент опустошения.
const rng = makeRng(42);
let learnSkip = 0;
r = simulate(start, () => {
  const x = rng();
  if (x < 0.34) { learnSkip++; return "learn"; }
  if (x < 0.67) { learnSkip++; return "skip"; }
  return "again";
}, 100000);
ok(r.done, "рандом 3 кнопок: завершается");
eq(learnSkip, 20, "learn+skip ровно 20 (= размер колоды)");
// инвариант applyAction
eq(L.applyAction([1, 2, 3], "learn").length, 2, "learn уменьшает на 1");
eq(L.applyAction([1, 2, 3], "skip").length, 2, "skip уменьшает на 1");
const ag = L.applyAction([1, 2, 3], "again");
eq(ag.length, 3, "again сохраняет длину");
eq(ag[ag.length - 1], 1, "again перемещает голову в конец");
eq(ag[0], 2, "again: следующий становится головой");
console.log("[3] завершаемость колоды (3 кнопки, любые стратегии) — OK");

/* ---------- 4. Выбор из 4 ---------- */
for (let t = 0; t < 200; t++) {
  const w = VOCAB[(t * 13) % VOCAB.length];
  const dir = t % 2 === 0 ? "ru2hy" : "hy2ru";
  const ch = L.buildChoice(w, VOCAB, dir, makeRng(t + 1));
  // ровно 4 варианта
  eq(ch.options.length, 4, "4 варианта (итерация " + t + ")");
  // ровно один верный
  const correctCount = ch.options.filter(o => o.correct).length;
  eq(correctCount, 1, "ровно один верный (итерация " + t + ")");
  // correctIndex указывает на верный
  ok(ch.options[ch.correctIndex].correct, "correctIndex -> верный");
  // верный = слову
  ok(ch.options[ch.correctIndex].word.id === w.id, "верный вариант — это слово");
  const field = dir === "hy2ru" ? "ru" : "hy";
  eq(ch.options[ch.correctIndex].text, w[field], "текст верного = поле слова");
  // тексты вариантов уникальны
  const texts = ch.options.map(o => o.text);
  eq(new Set(texts).size, 4, "тексты 4 вариантов уникальны (итерация " + t + ")");
  // дистракторы не равны верному по тексту
  ch.options.forEach(o => {
    if (!o.correct) ok(o.text !== w[field], "дистрактор != верный текст");
  });
}
console.log("[4] выбор из 4 (×200): ровно 1 верный, 4 уникальных, дистракторы != верный — OK");

/* ---------- 5. Сопоставление 4↔4 ---------- */
for (let t = 0; t < 100; t++) {
  const group = [];
  for (let i = 0; i < 4; i++) group.push(VOCAB[(t * 7 + i) % VOCAB.length]);
  // гарантируем уникальность id в группе
  const uniq = [];
  const seen = {};
  group.forEach(w => { if (!seen[w.id]) { seen[w.id] = 1; uniq.push(w); } });
  const m = L.buildMatch(uniq, makeRng(t + 100));
  eq(m.left.length, uniq.length, "левая колонка = размер группы");
  eq(m.right.length, uniq.length, "правая колонка = размер группы");
  // pairs: каждой левой соответствует ровно одна правая с тем же id
  m.left.forEach(l => {
    eq(m.pairs[l.id], l.id, "пара left.id -> тот же id");
    const rightMatch = m.right.filter(r => r.id === m.pairs[l.id]);
    eq(rightMatch.length, 1, "ровно одна правая плитка для пары");
  });
  // тексты: left = hy, right = ru
  m.left.forEach(l => { eq(l.text, l.word.hy, "left = hy"); });
  m.right.forEach(r => { eq(r.text, r.word.ru, "right = ru"); });
  // правая колонка — перестановка id левой
  const leftIds = m.left.map(l => l.id).sort();
  const rightIds = m.right.map(r => r.id).sort();
  assert.deepStrictEqual(leftIds, rightIds, "right — перестановка left по id"); passed++;
}
// группа меньше 4 (3 слова) — корректно
const m3 = L.buildMatch(VOCAB.slice(0, 3), makeRng(999));
eq(m3.left.length, 3, "группа из 3 -> 3 пары");
console.log("[5] сопоставление 4↔4 (×100): корректные пары, left=hy right=ru, перестановка — OK");

/* ---------- 6. Дашборд-числа ---------- */
// проверим, что подсчёт «по уровню» совпадает с buildDeck(size=all,pool=all)
["A1", "A2", "B1"].forEach(lv => {
  const d = L.buildDeck(VOCAB, { level: lv, theme: "all", pool: "all", source: "filters", size: "all", pick: {} }, {}, makeRng(1));
  eq(d.length, byLvl[lv], "дашборд: число " + lv + " = " + byLvl[lv]);
});
console.log("[6] дашборд-числа совпадают с buildDeck — OK");

console.log("\n=== ВСЕ ТЕСТЫ ЗЕЛЁНЫЕ ===");
console.log("Пройдено assert-ов: " + passed);
