/* Offline word comparison. A lexical practice score, not a semantic grade. */
(function () {
  'use strict';
  function words(text) {
    return text.normalize('NFC').replace(/ԵՎ/g, 'և').toLowerCase().replace(/և/g, 'եւ')
      .replace(/[ՙ՚՛՜՝՞՟]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
  }
  function oneEdit(a, b) {
    if (a === b || Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
    return edits + (a.length - i) + (b.length - j) === 1;
  }
  function score(answer, reference) {
    const input = words(answer), expected = words(reference), used = new Set();
    const marks = input.map(word => {
      const match = expected.findIndex((target, i) => !used.has(i) && target === word);
      if (match < 0) return { word, kind: 'wrong' };
      used.add(match);
      return { word, kind: 'exact' };
    });
    // Maximum bipartite matching prevents a typo from taking another typo's only match.
    const owners = new Map();
    function matchTypo(index, visited) {
      for (let i = 0; i < expected.length; i++) {
        if (used.has(i) || visited.has(i) || !oneEdit(input[index], expected[i])) continue;
        visited.add(i);
        if (!owners.has(i) || matchTypo(owners.get(i), visited)) {
          owners.set(i, index); return true;
        }
      }
      return false;
    }
    marks.forEach((mark, index) => { if (mark.kind === 'wrong') matchTypo(index, new Set()); });
    owners.forEach((index, target) => { marks[index].kind = 'typo'; used.add(target); });
    const exact = marks.filter(m => m.kind === 'exact').length;
    const typo = owners.size, denominator = Math.max(input.length, expected.length);
    return { percent: denominator ? Math.round(100 * (exact + typo * 0.5) / denominator) : 0,
      exact, typo, wrong: input.length - exact - typo, missing: expected.length - used.size,
      total: expected.length, marks };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { words, oneEdit, score };
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-writing]').forEach(box => {
    const input = box.querySelector('[data-writing-input]');
    const feedback = box.querySelector('[data-writing-feedback]');
    const display = box.querySelector('[data-writing-words]');
    const sample = box.querySelector('[data-writing-sample]');
    const show = box.querySelector('[data-writing-show]');
    const key = box.dataset.writingKey + ':result';
    const store = window.HYProgress;
    const saved = store ? store.read('hy-skills-v1')[key] : null;
    let lastResult = null;
    let peeked = !!(saved && saved.peeked);
    const persist = result => {
      if (!store) return;
      const data = store.read('hy-skills-v1');
      data[key] = { answer: input.value, peeked, percent: result ? result.percent : null };
      if (!store.write('hy-skills-v1', data)) feedback.textContent += ' Результат не сохранён: хранилище браузера недоступно.';
    };
    function render(result) {
      lastResult = result;
      feedback.textContent = `${result.percent}% совпадения с образцом. Точно: ${result.exact}; с опечаткой: ${result.typo}; не совпали: ${result.wrong}; не хватает: ${result.missing}.` + (peeked ? ' С подсказкой.' : ' Без просмотра образца.');
      display.replaceChildren();
      result.marks.forEach(mark => {
        const chip = document.createElement('span');
        chip.className = 'writing-word writing-word--' + mark.kind;
        chip.lang = 'hy';
        const label = { exact: 'совпало', typo: 'возможная опечатка, полбалла', wrong: 'нет совпадения' }[mark.kind];
        chip.textContent = mark.word + (mark.kind === 'exact' ? ' ✓' : mark.kind === 'typo' ? ' ≈' : ' ×');
        chip.title = label; chip.setAttribute('aria-label', mark.word + ': ' + label);
        display.appendChild(chip);
      });
    }
    box.querySelector('[data-writing-check]').addEventListener('click', () => {
      if (!words(input.value).length) { feedback.textContent = 'Сначала напиши перевод.'; return; }
      const result = score(input.value, box.dataset.answer);
      render(result); persist(result);
    });
    input.addEventListener('input', () => {
      lastResult = null;
      display.replaceChildren();
      feedback.textContent = 'Ответ изменён. Нажми «Проверить».' + (peeked ? ' Образец уже просмотрен.' : '');
      persist(null);
    });
    show.addEventListener('click', () => {
      sample.hidden = !sample.hidden;
      show.setAttribute('aria-expanded', String(!sample.hidden));
      show.textContent = sample.hidden ? 'Подглядеть ответ' : 'Скрыть ответ';
      if (!sample.hidden) {
        peeked = true;
        if (lastResult) render(lastResult);
        else feedback.textContent = 'Образец открыт. Следующая проверка будет отмечена «С подсказкой».';
        persist(lastResult);
      }
    });
    const support = box.closest('.writing-practice').querySelector('[data-writing-support]');
    if (support) support.addEventListener('toggle', () => {
      if (support.open) {
        peeked = true;
        if (lastResult) render(lastResult);
        else feedback.textContent = 'Опора просмотрена. Работа с подсказкой.';
        persist(lastResult);
      }
    });
    if (saved && saved.percent !== null && saved.answer === input.value) render(score(input.value, box.dataset.answer));
    else if (peeked) feedback.textContent = 'Образец уже просмотрен. Работа с подсказкой.';
  });
})();
