/* Offline A4 card editor. Draft files contain text and settings, never HTML. */
(function () {
  'use strict';
  const KEY = 'hy-print-cards-v1';
  const FORMAT = 'hy-print-cards';
  const MAX_CARDS = 4800;
  const fonts = {
    sans: 'Arial, "Noto Sans Armenian", "Mshtakan", sans-serif',
    serif: 'Georgia, "Sylfaen", "Noto Serif Armenian", serif',
    mono: '"Courier New", "Noto Sans Armenian", "Mshtakan", monospace'
  };
  const defaults = { count: 8, columns: 'auto', mainFont: 'sans', mainSize: 32, mainBold: true,
    noteFont: 'sans', noteSize: 7, noteBold: false };
  const $ = id => document.getElementById(id);
  const blank = () => ({ word: '', note: '' });
  const normalize = text => String(text).normalize('NFC').toLowerCase().replace(/և/g, 'եւ')
    .replace(/ё/g, 'е').replace(/h/g, 'х').replace(/[ՙ-՟։֊\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
  const vocab = (window.VOCAB || []).map(word => ({ ...word,
    search: normalize([word.hy, word.ru, word.tr].join(' ')) }));
  let state = { format: FORMAT, version: 1, settings: { ...defaults }, cards: Array.from({ length: 8 }, blank), page: 0 };
  let selected = 0;
  let resultLimit = 30;
  let saveTimer;
  let fitFrame;
  let loadWarning = '';

  function validInteger(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }
  function readDocument(data) {
    if (!data || data.format !== FORMAT || data.version !== 1 || !data.settings ||
        !Array.isArray(data.cards) || !data.cards.length || data.cards.length > MAX_CARDS) {
      throw new Error('Это не файл карточек этого редактора.');
    }
    const s = data.settings;
    if (!validInteger(s.count, 1, 48) || !(s.columns === 'auto' || validInteger(s.columns, 1, 6)) ||
        !Object.hasOwn(fonts, s.mainFont) || !Object.hasOwn(fonts, s.noteFont) ||
        !validInteger(s.mainSize, 8, 96) || !validInteger(s.noteSize, 4, 36) ||
        typeof s.mainBold !== 'boolean' || typeof s.noteBold !== 'boolean' ||
        data.cards.some(c => !c || typeof c.word !== 'string' || typeof c.note !== 'string' ||
          c.word.length > 10000 || c.note.length > 10000)) {
      throw new Error('В файле повреждены настройки или текст карточек.');
    }
    const cards = data.cards.map(c => ({ word: c.word, note: c.note }));
    while (cards.length % s.count) cards.push(blank());
    if (cards.length > MAX_CARDS) throw new Error("В файле слишком много карточек.");
    return { format: FORMAT, version: 1, settings: Object.fromEntries(Object.keys(defaults).map(k => [k, s[k]])),
      cards, page: validInteger(data.page, 0, cards.length / s.count - 1) ? data.page : 0 };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = readDocument(JSON.parse(raw));
  } catch (error) { loadWarning = 'Не удалось открыть черновик. Можно загрузить сохранённый файл.'; }
  selected = state.page * state.settings.count;

  function status(text) { $('pc-save-status').textContent = text; }
  function save() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      status('Черновик сохранён в этом браузере.');
    } catch (error) { status('Браузер не сохранил черновик. Скачайте файл, чтобы не потерять карточки.'); }
  }
  function changed() {
    status('Сохраняем…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(className, text, action) {
    const el = node('button', className, text);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  }
  function columnCount() {
    const { count, columns } = state.settings;
    if (columns !== 'auto') return Math.min(columns, count);
    let best = 1, score = Infinity;
    for (let c = 1; c <= Math.min(6, count); c++) {
      const rows = Math.ceil(count / c);
      const next = Math.abs(Math.log((190 / c) / (277 / rows) / 1.5)) + (rows * c - count) / count * 0.15;
      if (next < score) { best = c; score = next; }
    }
    return best;
  }
  const pageCount = () => state.cards.length / state.settings.count;
  function syncSettings() {
    Object.keys(defaults).forEach(key => {
      const id = 'pc-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      if ($(id).type === 'checkbox') $(id).checked = state.settings[key];
      else $(id).value = state.settings[key];
    });
  }
  function selectCard(index) {
    const previous = document.querySelector('.pc-card.is-selected');
    if (previous) previous.classList.remove('is-selected');
    selected = index;
    const card = document.querySelector('[data-card="' + index + '"]');
    if (card) card.classList.add('is-selected');
    $('pc-selection').textContent = 'Карточка ' + (index % state.settings.count + 1) + ' · лист ' + (state.page + 1);
    $('pc-clear-card').disabled = !state.cards[index].word && !state.cards[index].note;
  }
  function editor(field, index) {
    const el = node('div', field === 'word' ? 'pc-word' : 'pc-note', state.cards[index][field]);
    el.contentEditable = 'plaintext-only';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('aria-label', (field === 'word' ? 'Слово' : 'Перевод') + ', карточка ' + (index % state.settings.count + 1));
    el.dataset.field = field;
    el.dataset.placeholder = field === 'word' ? 'Слово' : 'перевод';
    el.spellcheck = false;
    el.addEventListener('focus', () => {
      if (selected !== index) {
        selectCard(index);
        $('pc-search').value = '';
        resultLimit = 30;
        renderResults();
      }
    });
    el.addEventListener('input', () => {
      // innerText preserves line breaks inserted by contenteditable.
      state.cards[index][field] = el.innerText.replace(/\r/g, '');
      if (!el.innerText.trim() && !el.textContent) el.replaceChildren();
      if (field === 'word') {
        $('pc-search').value = state.cards[index].word.trim();
        resultLimit = 30;
        renderResults();
      }
      selectCard(index);
      scheduleFit();
      changed();
    });
    el.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) event.preventDefault();
    });
    return el;
  }
  function renderPages() {
    const count = state.settings.count, columns = columnCount();
    const fragment = document.createDocumentFragment();
    for (let p = 0; p < pageCount(); p++) {
      const block = node('section', 'pc-page-block');
      block.dataset.page = p;
      block.setAttribute('aria-label', 'Лист ' + (p + 1));
      const heading = node('div', 'pc-page-heading pc-no-print');
      heading.append(node('span', 'pc-page-label', 'Лист ' + (p + 1) + ' · A4 · 210 × 297 мм'));
      const remove = button('pc-remove-page', 'Удалить лист', () => {
        const start = p * count;
        if (state.cards.slice(start, start + count).some(c => c.word || c.note) &&
            !window.confirm('Удалить лист ' + (p + 1) + ' вместе с его карточками?')) return;
        state.cards.splice(start, count);
        if (!state.cards.length) state.cards = Array.from({ length: count }, blank);
        state.page = Math.min(p, pageCount() - 1);
        selected = state.page * count;
        renderPages();
        changed();
      });
      heading.append(remove);
      const wrap = node('div', 'pc-sheet-wrap');
      const sheet = node('div', 'pc-sheet');
      const grid = node('div', 'pc-grid');
      for (let start = 0; start < count; start += columns) {
        const row = node('div', 'pc-row');
        for (let i = start; i < Math.min(start + columns, count); i++) {
          const index = p * count + i;
          const card = node('div', 'pc-card');
          card.dataset.card = index;
          const wordArea = node('div', 'pc-word-area');
          const word = editor('word', index);
          wordArea.append(word);
          const noteArea = node('div', 'pc-note-area');
          const note = editor('note', index);
          noteArea.append(note);
          card.append(wordArea, noteArea);
          card.addEventListener('click', event => {
            if (event.target.closest('[contenteditable]')) return;
            if (event.target === noteArea) note.focus();
            else word.focus();
          });
          row.append(card);
        }
        grid.append(row);
      }
      sheet.append(grid); wrap.append(sheet); block.append(heading, wrap); fragment.append(block);
    }
    $('pc-pages').replaceChildren(fragment);
    $('pc-page-select').replaceChildren(...Array.from({ length: pageCount() }, (_, p) => {
      const option = node('option', '', 'Лист ' + (p + 1) + ' из ' + pageCount());
      option.value = p;
      return option;
    }));
    $('pc-layout-info').textContent = count + ' карточек · ' + columns + ' столбц. · ' + Math.ceil(count / columns) + ' ряд.' +
      (count % columns ? ' Последний ряд заполняет ширину листа.' : '');
    showPage();
  }
  function showPage() {
    document.querySelectorAll('.pc-page-block').forEach((block, i) => {
      block.classList.toggle('pc-page-inactive', i !== state.page);
    });
    $('pc-page-select').value = state.page;
    $('pc-prev-page').disabled = state.page === 0;
    $('pc-next-page').disabled = state.page === pageCount() - 1;
    $('pc-add-page').disabled = state.cards.length + state.settings.count > MAX_CARDS;
    if (Math.floor(selected / state.settings.count) !== state.page) selected = state.page * state.settings.count;
    selectCard(selected);
    $('pc-search').value = '';
    resultLimit = 30;
    renderResults();
    resizeSheets();
  }
  function goToPage(page) {
    state.page = Math.max(0, Math.min(pageCount() - 1, page));
    showPage(); changed();
  }

  // Measure in unscaled CSS pixels: screen zoom never changes the printed font size.
  function fitText(el, area, size, family, bold) {
    el.style.fontFamily = fonts[family];
    el.style.fontWeight = bold ? '700' : '400';
    el.style.fontSize = size + 'pt';
    const fits = () => el.scrollHeight <= area.clientHeight && el.scrollWidth <= area.clientWidth &&
      el.getBoundingClientRect().height <= area.getBoundingClientRect().height;
    if (!fits()) {
      let lo = 0.5, hi = size;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = mid + 'pt';
        if (fits()) lo = mid; else hi = mid;
      }
      el.style.fontSize = lo + 'pt';
    }
  }
  function fitAll() {
    const s = state.settings;
    document.querySelectorAll('.pc-card').forEach(card => {
      if (!card.offsetWidth) return;
      fitText(card.querySelector('.pc-word'), card.querySelector('.pc-word-area'), s.mainSize, s.mainFont, s.mainBold);
      fitText(card.querySelector('.pc-note'), card.querySelector('.pc-note-area'), s.noteSize, s.noteFont, s.noteBold);
    });
  }
  function scheduleFit() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitAll);
  }
  function resizeSheets() {
    document.querySelectorAll('.pc-sheet-wrap').forEach(wrap => {
      if (!wrap.offsetWidth) return;
      const sheet = wrap.firstElementChild;
      const available = wrap.parentElement.clientWidth;
      const scale = Math.min(1, available / sheet.offsetWidth, Math.max(300, window.innerHeight - Math.max(76, $('pc-preview').getBoundingClientRect().top) - 140) / sheet.offsetHeight);
      wrap.style.width = sheet.offsetWidth * scale + 'px';
      wrap.style.height = sheet.offsetHeight * scale + 'px';
      sheet.style.transform = 'scale(' + scale + ')';
    });
    fitAll();
  }
  function renderResults() {
    const query = normalize($('pc-search').value);
    const tokens = query.split(' ').filter(Boolean);
    const matches = vocab.filter(w => tokens.every(t => w.search.includes(t)));
    $('pc-search-count').textContent = 'Найдено: ' + matches.length + '. Показано: ' + Math.min(matches.length, resultLimit) + '.';
    const results = $('pc-results');
    results.replaceChildren();
    matches.slice(0, resultLimit).forEach(word => {
      const result = button('pc-result', undefined, () => {
        state.cards[selected] = { word: word.hy, note: word.ru };
        const card = document.querySelector('[data-card="' + selected + '"]');
        card.querySelector('.pc-word').textContent = word.hy;
        card.querySelector('.pc-note').textContent = word.ru;
        fitAll(); selectCard(selected); changed();
        const target = card.querySelector('.pc-word');
        target.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(target); range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
      });
      result.dataset.wordId = word.id;
      const hy = node('span', 'pc-result-word', word.hy); hy.lang = 'hy';
      result.append(hy, node('span', 'pc-result-translation', word.ru), node('span', 'pc-result-transcription', word.tr));
      results.append(result);
    });
    if (!matches.length) results.append(node('p', 'pc-empty', 'Слово не найдено. Можно написать его и перевод прямо на карточке.'));
    if (matches.length > resultLimit) results.append(button('pc-result pc-more', 'Показать ещё', () => {
      const top = results.scrollTop;
      resultLimit += 30; renderResults(); results.scrollTop = top;
      results.querySelectorAll('.pc-result')[resultLimit - 30].focus({ preventScroll: true });
    }));
  }

  Object.keys(defaults).forEach(key => {
    const input = $('pc-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
    input.addEventListener('input', () => {
      if (!input.checkValidity() || input.value === '') return;
      const value = input.type === 'checkbox' ? input.checked :
        input.type === 'number' || key === 'columns' && input.value !== 'auto' ? Number(input.value) : input.value;
      if (input.type === 'number' && !Number.isInteger(value)) return;
      state.settings[key] = value;
      if (key === 'count') {
        let last = state.cards.length - 1;
        while (last >= 0 && !state.cards[last].word && !state.cards[last].note) last--;
        // Reflow without losing any filled card, including gaps between cards.
        const length = Math.max(value, Math.ceil((last + 1) / value) * value);
        state.cards.length = Math.min(state.cards.length, length);
        while (state.cards.length < length) state.cards.push(blank());
        selected = Math.min(selected, state.cards.length - 1);
        state.page = Math.floor(selected / value);
      }
      if (key === 'count' || key === 'columns') renderPages(); else fitAll();
      changed();
    });
    input.addEventListener('blur', () => { if (!input.checkValidity() || input.value === '') syncSettings(); });
  });
  $('pc-search').addEventListener('input', () => { resultLimit = 30; renderResults(); $('pc-results').scrollTop = 0; });
  $('pc-clear-card').addEventListener('click', () => {
    state.cards[selected] = blank();
    const card = document.querySelector('[data-card="' + selected + '"]');
    card.querySelector('.pc-word').textContent = '';
    card.querySelector('.pc-note').textContent = '';
    $('pc-search').value = ''; renderResults(); selectCard(selected); fitAll(); changed();
    card.querySelector('.pc-word').focus();
  });
  $('pc-add-page').addEventListener('click', () => {
    if (state.cards.length + state.settings.count > MAX_CARDS) return;
    state.cards.push(...Array.from({ length: state.settings.count }, blank));
    state.page = pageCount() - 1; selected = state.page * state.settings.count;
    renderPages(); changed();
  });
  $('pc-prev-page').addEventListener('click', () => goToPage(state.page - 1));
  $('pc-next-page').addEventListener('click', () => goToPage(state.page + 1));
  $('pc-page-select').addEventListener('change', event => goToPage(Number(event.target.value)));
  $('pc-download').addEventListener('click', () => {
    save();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url; link.download = 'armenian-cards-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Файл карточек подготовлен для скачивания. Его можно открыть в этом редакторе.');
  });
  $('pc-open-file').addEventListener('click', () => $('pc-upload').click());
  $('pc-upload').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Файл слишком большой (больше 20 МБ).');
      const imported = readDocument(JSON.parse(await file.text()));
      if (state.cards.some(c => c.word || c.note) && !window.confirm('Заменить текущие листы содержимым файла? Сначала скачайте текущие листы, если хотите их сохранить.')) return;
      state = imported; selected = state.page * state.settings.count;
      syncSettings(); renderPages(); save();
    } catch (error) { status('Не удалось загрузить файл. ' + (error instanceof SyntaxError ? 'Неверный формат JSON.' : error.message)); }
    finally { event.target.value = ''; }
  });
  function preparePrint() {
    document.body.classList.add('pc-printing');
    fitAll(); save();
  }
  $('pc-print').addEventListener('click', () => {
    preparePrint(); window.print();
    document.body.classList.remove('pc-printing');
    resizeSheets();
  });
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', () => { document.body.classList.remove('pc-printing'); resizeSheets(); });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', resizeSheets);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeSheets).observe($('pc-preview'));
  syncSettings(); renderPages();
  if (document.fonts) document.fonts.ready.then(fitAll);
  if (loadWarning) status(loadWarning);
})();
