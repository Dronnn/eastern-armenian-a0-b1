/* ============================================================
   Тренажёр слов — vocabulary.html
   Макет: Дашборд + Сессия + Свободный просмотр.
   Ванильный JS, офлайн, без зависимостей.

   Ключи localStorage:
     hy-vocab-v1       — выученные слова { [id]: 1 } (общий с уроками)
     hy-progress-v1    — прогресс уроков (для экспорта/импорта)
     hy-vocab-pick-v1  — «моя подборка» { [id]: 1 }

   Чистая логика (нормализация ответа, сбор колоды, шаг сессии,
   генерация 4-выбора, сопоставление) вынесена в TrainerLogic и
   экспортируется в module.exports для node-тестов (tools/trainer-test.cjs).
   ============================================================ */

/* ================= ЧИСТАЯ ЛОГИКА (тестируемая) ================= */
var TrainerLogic = (function () {
  "use strict";

  // --- Нормализация ответа (армянский / русский ввод) ---
  // снимаем армянскую пунктуацию (ՙ–՟ ։), латинскую/кир. пунктуацию,
  // lowercase, схлопываем пробелы.
  function normalize(s) {
    if (s == null) return "";
    var t = String(s).toLowerCase();
    // армянские пунктуационные знаки U+0559..U+055F и U+0589 (։), U+058A (֊)
    t = t.replace(/[ՙ-՟։֊]/g, " ");
    // обычная пунктуация
    t = t.replace(/[.,!?;:()«»"'`’‘“”\/\\\-—–…]/g, " ");
    // схлоп пробелов
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }

  // Разбить перевод на принимаемые варианты (по запятой и слешу).
  function variants(s) {
    if (s == null) return [];
    return String(s)
      .split(/[,/;]|\sили\s/)
      .map(function (x) { return normalize(x); })
      .filter(function (x) { return x.length > 0; });
  }

  // Проверка ввода. dir: "ru2hy" (вводят hy), "hy2ru" (вводят ru).
  // Возвращает true, если ввод совпал с любым допустимым вариантом.
  function checkInput(input, word, dir) {
    var target = dir === "hy2ru" ? word.ru : word.hy;
    var got = normalize(input);
    if (!got) return false;
    var accept = variants(target);
    for (var i = 0; i < accept.length; i++) {
      if (accept[i] === got) return true;
    }
    return false;
  }

  // --- Перемешивание (Fisher–Yates). rnd() -> [0,1) ---
  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // --- Сбор колоды по настройкам ---
  // cfg: { level, theme, pool:"new"|"all", source:"filters"|"pick"|"both",
  //        size:(number|"all"), pick:{id:1} }
  // learned: { id:1 }
  // Возвращает массив слов (порядок перемешан через rnd).
  function buildDeck(vocab, cfg, learned, rnd) {
    learned = learned || {};
    var pick = cfg.pick || {};
    var pool = [];

    function passesFilters(w) {
      if (cfg.level && cfg.level !== "all" && w.level !== cfg.level) return false;
      if (cfg.theme && cfg.theme !== "all" && w.theme !== cfg.theme) return false;
      return true;
    }

    if (cfg.source === "pick") {
      pool = vocab.filter(function (w) { return pick[w.id]; });
    } else if (cfg.source === "both") {
      pool = vocab.filter(function (w) { return pick[w.id] && passesFilters(w); });
    } else { // "filters"
      pool = vocab.filter(passesFilters);
    }

    if (cfg.pool === "new") {
      pool = pool.filter(function (w) { return !learned[w.id]; });
    }

    pool = shuffle(pool, rnd);

    if (cfg.size !== "all") {
      var n = parseInt(cfg.size, 10) || pool.length;
      pool = pool.slice(0, n);
    }
    return pool;
  }

  // --- Шаг сессии (применение одной из трёх кнопок) ---
  // Колода — массив id (или слов); action: "learn" | "again" | "skip".
  // "learn"/"skip" убирают элемент из колоды; "again" перемещает в конец.
  // Возвращает новую колоду (deck изменяется неразрушающе).
  // Гарантирует завершаемость: learn/skip монотонно уменьшают размер,
  // again лишь переставляет (но в реальной сессии комбинируется с learn/skip).
  function applyAction(deck, action) {
    if (!deck.length) return deck.slice();
    var rest = deck.slice(1);
    if (action === "again") {
      return rest.concat([deck[0]]);
    }
    // learn | skip
    return rest;
  }

  // --- Генерация выбора из 4 ---
  // word — верный; vocab — пул для дистракторов; dir определяет, что показываем
  // как варианты ответа: "ru2hy" -> варианты на hy; "hy2ru" -> на ru.
  // Возвращает { options:[{word,correct}], correctIndex }.
  // РОВНО один верный; дистракторы уникальны и не равны верному по тексту.
  function buildChoice(word, vocab, dir, rnd) {
    var field = dir === "hy2ru" ? "ru" : "hy";
    var correctText = word[field];

    // приоритет: тот же уровень/тема, затем тот же уровень, затем все.
    var sameTheme = [], sameLevel = [], others = [];
    for (var i = 0; i < vocab.length; i++) {
      var w = vocab[i];
      if (w.id === word.id) continue;
      if (w[field] === correctText) continue; // не равен верному по тексту
      if (w.theme === word.theme) sameTheme.push(w);
      else if (w.level === word.level) sameLevel.push(w);
      else others.push(w);
    }
    var ranked = shuffle(sameTheme, rnd)
      .concat(shuffle(sameLevel, rnd))
      .concat(shuffle(others, rnd));

    var distractors = [];
    var usedText = {};
    usedText[correctText] = 1;
    for (var k = 0; k < ranked.length && distractors.length < 3; k++) {
      var d = ranked[k];
      if (usedText[d[field]]) continue; // уникальность текста вариантов
      usedText[d[field]] = 1;
      distractors.push(d);
    }

    var opts = distractors.map(function (d) {
      return { word: d, text: d[field], correct: false };
    });
    opts.push({ word: word, text: correctText, correct: true });
    opts = shuffle(opts, rnd);

    var correctIndex = -1;
    for (var m = 0; m < opts.length; m++) if (opts[m].correct) correctIndex = m;

    return { options: opts, correctIndex: correctIndex };
  }

  // --- Сопоставление 4↔4 ---
  // group — массив до 4 слов; возвращает { left:[word], right:[{text,id}],
  // pairs:{ leftId: rightId } } — корректные пары.
  // Левая колонка — hy, правая — ru (перемешана отдельно).
  function buildMatch(group, rnd) {
    var n = Math.min(4, group.length);
    var sel = group.slice(0, n);
    var left = sel.map(function (w) {
      return { id: w.id, text: w.hy, word: w };
    });
    var right = shuffle(sel.map(function (w) {
      return { id: w.id, text: w.ru, word: w };
    }), rnd);
    var pairs = {};
    sel.forEach(function (w) { pairs[w.id] = w.id; });
    return { left: left, right: right, pairs: pairs };
  }

  return {
    normalize: normalize,
    variants: variants,
    checkInput: checkInput,
    shuffle: shuffle,
    buildDeck: buildDeck,
    applyAction: applyAction,
    buildChoice: buildChoice,
    buildMatch: buildMatch
  };
})();

/* node-экспорт чистой логики для тестов */
if (typeof module !== "undefined" && module.exports) {
  module.exports = TrainerLogic;
}

/* ================= UI (только в браузере) ================= */
if (typeof window !== "undefined" && typeof document !== "undefined") {
(function () {
  "use strict";

  var KEY = "hy-vocab-v1";
  var PICK_KEY = "hy-vocab-pick-v1";
  var LESSON_KEY = "hy-progress-v1";
  var L = TrainerLogic;

  var VOCAB = window.VOCAB || [];
  var THEMES = window.VOCAB_THEMES || null;
  var byId = {};
  VOCAB.forEach(function (w) { byId[w.id] = w; });

  // ---- storage helpers ----
  function loadMap(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function saveMap(key, m) { try { localStorage.setItem(key, JSON.stringify(m)); } catch (e) {} }
  var learned = loadMap(KEY);
  var pick = loadMap(PICK_KEY);

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  // ---- DOM refs ----
  function $(id) { return document.getElementById(id); }
  var browseState = { view: "list", cardMode: "single", level: "all", theme: "all",
                      q: "", onlyUnlearned: false, pos: 0, flipped: false, deck: [] };

  /* ============ ТЕМЫ / УРОВНИ ============ */
  function orderedThemes() {
    if (THEMES && THEMES.length) return THEMES.map(function (t) { return t.theme; });
    var seen = {}, out = [];
    VOCAB.forEach(function (w) { if (!seen[w.theme]) { seen[w.theme] = 1; out.push(w.theme); } });
    return out;
  }
  function levelOfTheme(theme) {
    if (THEMES) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].theme === theme) return THEMES[i].level; }
    var w = VOCAB.find(function (x) { return x.theme === theme; });
    return w ? w.level : "";
  }

  /* ============ ДАШБОРД ============ */
  var LEVELS = ["A1", "A2", "B1"];
  function dashCounts() {
    var total = VOCAB.length, done = 0;
    var lvl = { A1: { t: 0, d: 0 }, A2: { t: 0, d: 0 }, B1: { t: 0, d: 0 } };
    VOCAB.forEach(function (w) {
      var isDone = !!learned[w.id];
      if (isDone) done++;
      if (lvl[w.level]) { lvl[w.level].t++; if (isDone) lvl[w.level].d++; }
    });
    return { total: total, done: done, lvl: lvl };
  }
  function setMeter(barEl, txtEl, pctEl, d, t) {
    var pct = t ? Math.round(d / t * 100) : 0;
    if (barEl) barEl.style.width = pct + "%";
    if (txtEl) txtEl.textContent = d + " / " + t;
    if (pctEl) pctEl.textContent = pct + "%";
  }
  function renderDash() {
    var c = dashCounts();
    $("dash-total").textContent = "выучено " + c.done + " из " + c.total;
    setMeter($("m-all-bar"), $("m-all-txt"), $("m-all-pct"), c.done, c.total);
    LEVELS.forEach(function (lv) {
      setMeter($("m-" + lv + "-bar"), $("m-" + lv + "-txt"), null, c.lvl[lv].d, c.lvl[lv].t);
    });
    if (!$("dash-themes").hidden) renderDashThemes();
  }
  function renderDashThemes() {
    var html = "";
    orderedThemes().forEach(function (theme) {
      var t = 0, d = 0, lv = levelOfTheme(theme);
      VOCAB.forEach(function (w) { if (w.theme === theme) { t++; if (learned[w.id]) d++; } });
      if (!t) return;
      var pct = t ? Math.round(d / t * 100) : 0;
      html += '<div class="tmeter">' +
        '<div class="tmeter__top"><span class="badge badge--' + esc(lv.toLowerCase()) + '">' + esc(lv) + '</span>' +
          '<span class="tmeter__name">' + esc(theme) + '</span>' +
          '<span class="tmeter__num">' + d + ' / ' + t + '</span></div>' +
        '<div class="meter__track meter__track--sm"><div class="meter__bar meter__bar--all" style="width:' + pct + '%"></div></div>' +
        '</div>';
    });
    $("dash-themes").innerHTML = html;
  }
  $("lead-total") && ($("lead-total").textContent = VOCAB.length);

  $("dash-themes-toggle").addEventListener("click", function () {
    var box = $("dash-themes");
    var open = box.hidden;
    box.hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
    this.querySelector(".dash__toggle-ico").textContent = open ? "▾" : "▸";
    if (open) renderDashThemes();
  });

  /* ============ НАСТРОЙКА СЕССИИ ============ */
  var setupCfg = { size: "10", dir: "ru2hy", level: "all", theme: "all",
                   pool: "new", source: "filters", types: { flip: 1, input: 1, choice: 1, match: 1 } };

  // одиночный выбор в .optrow[data-single]
  function bindSingle(rowId, attr, onChange) {
    var row = $(rowId);
    row.addEventListener("click", function (e) {
      var opt = e.target.closest(".opt"); if (!opt) return;
      row.querySelectorAll(".opt").forEach(function (o) { o.classList.remove("is-active"); });
      opt.classList.add("is-active");
      onChange(opt.getAttribute(attr));
    });
  }
  bindSingle("opt-size", "data-size", function (v) { setupCfg.size = v; updateDeckInfo(); });
  bindSingle("opt-dir", "data-dir", function (v) { setupCfg.dir = v; });
  bindSingle("opt-level", "data-level", function (v) { setupCfg.level = v; updateDeckInfo(); });
  bindSingle("opt-pool", "data-pool", function (v) { setupCfg.pool = v; updateDeckInfo(); });
  bindSingle("opt-source", "data-source", function (v) { setupCfg.source = v; updateDeckInfo(); });

  // мультивыбор типов
  $("opt-types").addEventListener("click", function (e) {
    var opt = e.target.closest(".opt"); if (!opt) return;
    var type = opt.getAttribute("data-type");
    var on = opt.classList.toggle("is-active");
    if (on) setupCfg.types[type] = 1; else delete setupCfg.types[type];
    // не допускаем пустой выбор: если сняли последний — вернуть его
    if (!Object.keys(setupCfg.types).length) {
      opt.classList.add("is-active");
      setupCfg.types[type] = 1;
    }
  });

  // селект темы
  var optTheme = $("opt-theme");
  (function fillSetupThemes() {
    var opts = '<option value="all">Все темы</option>';
    orderedThemes().forEach(function (t) {
      opts += '<option value="' + esc(t) + '">' + esc(levelOfTheme(t)) + " · " + esc(t) + '</option>';
    });
    optTheme.innerHTML = opts;
  })();
  optTheme.addEventListener("change", function () { setupCfg.theme = optTheme.value; updateDeckInfo(); });

  function currentSetupCfg() {
    return { size: setupCfg.size, level: setupCfg.level, theme: setupCfg.theme,
             pool: setupCfg.pool, source: setupCfg.source, pick: pick };
  }
  function updateDeckInfo() {
    // оцениваем размер доступной колоды без перемешивания (size="all")
    var probe = currentSetupCfg(); probe.size = "all";
    var avail = L.buildDeck(VOCAB, probe, learned).length;
    var willTake = setupCfg.size === "all" ? avail : Math.min(avail, parseInt(setupCfg.size, 10));
    var info = $("setup-deck-info");
    if (!avail) {
      info.textContent = "Под эти настройки слов нет — измени фильтры или источник.";
      info.classList.add("is-empty");
    } else {
      info.textContent = "Доступно слов: " + avail + " · в сессию войдёт: " + willTake;
      info.classList.remove("is-empty");
    }
  }

  // ---- подборка ----
  function renderPick() {
    var ids = Object.keys(pick);
    $("pick-count").textContent = ids.length;
    var box = $("pick-chips");
    if (!ids.length) { box.innerHTML = '<span class="picker__empty">Подборка пуста. Добавляй слова поиском выше или кнопкой «+ в сессию» в списке.</span>'; return; }
    var html = "";
    ids.forEach(function (id) {
      var w = byId[id]; if (!w) return;
      html += '<span class="pchip" data-id="' + esc(id) + '">' + esc(w.hy) + ' <span class="pchip__ru">' + esc(w.ru) + '</span> <span class="pchip__x" data-act="rm">✕</span></span>';
    });
    box.innerHTML = html;
  }
  $("pick-chips").addEventListener("click", function (e) {
    var x = e.target.closest('[data-act="rm"]'); if (!x) return;
    var chip = e.target.closest(".pchip"); if (!chip) return;
    delete pick[chip.getAttribute("data-id")];
    saveMap(PICK_KEY, pick); renderPick(); updateDeckInfo();
  });
  $("pick-clear").addEventListener("click", function () {
    if (!Object.keys(pick).length) return;
    if (confirm("Очистить мою подборку?")) { pick = {}; saveMap(PICK_KEY, pick); renderPick(); updateDeckInfo(); }
  });
  var pickSearch = $("pick-search"), pickTimer = null;
  pickSearch.addEventListener("input", function () {
    clearTimeout(pickTimer);
    pickTimer = setTimeout(renderPickResults, 150);
  });
  function renderPickResults() {
    var q = pickSearch.value.trim().toLowerCase();
    var box = $("pick-results");
    if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    var hits = VOCAB.filter(function (w) {
      return (w.ru || "").toLowerCase().indexOf(q) !== -1 ||
             (w.hy || "").toLowerCase().indexOf(q) !== -1 ||
             (w.tr || "").toLowerCase().indexOf(q) !== -1;
    }).slice(0, 30);
    if (!hits.length) { box.hidden = false; box.innerHTML = '<div class="picker__none">Ничего не найдено</div>'; return; }
    var html = "";
    hits.forEach(function (w) {
      var inPick = pick[w.id];
      html += '<div class="picker__hit" data-id="' + esc(w.id) + '">' +
        '<span class="picker__hy">' + esc(w.hy) + '</span>' +
        '<span class="picker__hru">' + esc(w.ru) + '</span>' +
        '<span class="picker__add' + (inPick ? ' is-in' : '') + '">' + (inPick ? '✓ в подборке' : '+ добавить') + '</span></div>';
    });
    box.hidden = false; box.innerHTML = html;
  }
  $("pick-results").addEventListener("click", function (e) {
    var hit = e.target.closest(".picker__hit"); if (!hit) return;
    var id = hit.getAttribute("data-id");
    if (pick[id]) delete pick[id]; else pick[id] = 1;
    saveMap(PICK_KEY, pick);
    renderPickResults(); renderPick(); updateDeckInfo();
  });

  // ---- открыть/закрыть настройку ----
  function showOnly(sectionId) {
    ["setup", "session", "result"].forEach(function (id) {
      $(id).hidden = (id !== sectionId);
    });
  }
  $("open-setup").addEventListener("click", function () {
    showOnly("setup"); renderPick(); updateDeckInfo();
    $("setup").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("setup-close").addEventListener("click", function () {
    $("setup").hidden = true;
  });

  /* ============ СЕССИЯ ============ */
  // session.deck — массив id; session.types — массив включённых типов;
  // на каждом шаге выбираем тип по позиции (детерминированно-вперемешку через индекс).
  var session = null;

  function startSession() {
    var cfg = currentSetupCfg();
    var deckWords = L.buildDeck(VOCAB, cfg, learned);
    if (!deckWords.length) { updateDeckInfo(); return; }
    var types = Object.keys(setupCfg.types);
    session = {
      deck: deckWords.map(function (w) { return w.id; }),
      dir: setupCfg.dir,
      types: types,
      stats: { learned: 0, skipped: 0, total: deckWords.length },
      stepNo: 0,
      answered: false
    };
    showOnly("session");
    $("session").scrollIntoView({ behavior: "smooth", block: "start" });
    renderStep();
  }

  function pickType() {
    var t = session.types;
    if (t.length === 1) return t[0];
    return t[session.stepNo % t.length];
  }
  function pickDir() {
    if (session.dir !== "mix") return session.dir;
    return (session.stepNo % 2 === 0) ? "ru2hy" : "hy2ru";
  }

  function renderSessionBar() {
    var s = session.stats;
    var remaining = session.deck.length;
    $("session-counts").innerHTML =
      '<span class="sc sc--rem">осталось <b>' + remaining + '</b></span>' +
      '<span class="sc sc--learn">выучил <b>' + s.learned + '</b></span>' +
      '<span class="sc sc--skip">отложил <b>' + s.skipped + '</b></span>';
    var done = s.learned + s.skipped;
    var pct = s.total ? Math.round(done / s.total * 100) : 0;
    $("session-prog-bar").style.width = pct + "%";
  }

  // Кнопки результата шага (Выучил / Не выучил / Отложить)
  function actionButtonsHtml() {
    return '<div class="sx-actions">' +
      '<button class="btn btn--good sx-act" data-act="learn" type="button">✓ Выучил</button>' +
      '<button class="btn btn--ghost sx-act" data-act="again" type="button">↻ Не выучил</button>' +
      '<button class="btn btn--ghost sx-act" data-act="skip" type="button">⏭ Отложить</button>' +
      '</div>';
  }

  function renderStep() {
    if (!session) return;
    renderSessionBar();
    if (!session.deck.length) { finishSession(); return; }
    session.answered = false;
    var id = session.deck[0];
    var w = byId[id];
    var type = pickType();
    var dir = pickDir();
    session.curType = type;
    session.curDir = dir;
    session.curWord = w;

    var stage = $("session-stage");
    if (type === "flip") stage.innerHTML = renderFlip(w, dir);
    else if (type === "input") stage.innerHTML = renderInput(w, dir);
    else if (type === "choice") stage.innerHTML = renderChoice(w, dir);
    else if (type === "match") stage.innerHTML = renderMatch();
    else stage.innerHTML = renderFlip(w, dir);
  }

  function typeTag(type) {
    var map = { flip: "переворот", input: "ввод", choice: "выбор из 4", match: "сопоставление" };
    return '<span class="sx-tag">' + map[type] + '</span>';
  }
  function wordMeta(w) {
    return '<div class="sx-meta"><span class="badge badge--' + esc((w.level || "").toLowerCase()) + '">' +
      esc(w.level) + '</span><span class="sx-theme">' + esc(w.theme) + '</span></div>';
  }

  // ---- 1) карточка-переворот ----
  function renderFlip(w, dir) {
    var frontIsHy = (dir !== "hy2ru");
    var front = frontIsHy ? w.hy : w.ru;
    var backMain = frontIsHy ? w.ru : w.hy;
    var trLine = w.tr ? '<div class="sx-tr">' + esc(w.tr) + '</div>' : '';
    var formsLine = w.forms ? '<div class="sb-row"><div class="sb-label">Формы</div><div class="sb-forms">' + esc(w.forms) + '</div></div>' : '';
    var exLine = w.ex ? '<div class="sb-row"><div class="sb-label">Пример</div><div class="sb-ex">' + esc(w.ex) + '</div>' +
      (w.exru ? '<div class="sb-exru">' + esc(w.exru) + '</div>' : '') + '</div>' : '';
    return '<div class="sx sx--flip">' + typeTag("flip") + wordMeta(w) +
      '<div class="study"><div class="scard" id="sx-scard">' +
        '<div class="sface sface--front"><div class="sface__hy' + (frontIsHy ? '' : ' sface__hy--ru') + '">' + esc(front) + '</div>' +
          '<div class="sface__hint">нажми, чтобы перевернуть</div></div>' +
        '<div class="sface sface--back"><div class="sface__hy' + (frontIsHy ? ' sface__hy--ru' : '') + '">' + esc(backMain) + '</div>' +
          trLine + formsLine + exLine + '</div>' +
      '</div></div>' +
      actionButtonsHtml() + '</div>';
  }

  // ---- 2) ввод ответа ----
  function renderInput(w, dir) {
    var promptIsHy = (dir === "hy2ru");
    var prompt = promptIsHy ? w.hy : w.ru;
    var sub = promptIsHy && w.tr ? '<div class="sx-tr">' + esc(w.tr) + '</div>' : '';
    var ask = promptIsHy ? "Напиши по-русски" : "Напиши по-армянски";
    return '<div class="sx sx--input">' + typeTag("input") + wordMeta(w) +
      '<div class="sx-prompt' + (promptIsHy ? ' sx-prompt--hy' : '') + '">' + esc(prompt) + '</div>' + sub +
      '<div class="sx-ask">' + ask + '</div>' +
      '<form class="sx-form" id="sx-form" autocomplete="off">' +
        '<input class="sx-field" id="sx-input" placeholder="…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<button class="btn btn--primary" type="submit">Проверить</button>' +
      '</form>' +
      '<div class="sx-verdict" id="sx-verdict" hidden></div>' +
      '<div id="sx-after" hidden>' + actionButtonsHtml() + '</div>' +
      '</div>';
  }

  // ---- 3) выбор из 4 ----
  function renderChoice(w, dir) {
    var ch = L.buildChoice(w, VOCAB, dir);
    session.choice = ch;
    var promptIsHy = (dir === "hy2ru");
    var prompt = promptIsHy ? w.hy : w.ru;
    var sub = promptIsHy && w.tr ? '<div class="sx-tr">' + esc(w.tr) + '</div>' : '';
    var ask = promptIsHy ? "Выбери перевод" : "Выбери армянское слово";
    var opts = "";
    ch.options.forEach(function (o, i) {
      opts += '<button class="sx-opt' + (promptIsHy ? '' : ' sx-opt--hy') + '" data-i="' + i + '" type="button">' + esc(o.text) + '</button>';
    });
    return '<div class="sx sx--choice">' + typeTag("choice") + wordMeta(w) +
      '<div class="sx-prompt' + (promptIsHy ? ' sx-prompt--hy' : '') + '">' + esc(prompt) + '</div>' + sub +
      '<div class="sx-ask">' + ask + '</div>' +
      '<div class="sx-opts">' + opts + '</div>' +
      '<div id="sx-after" hidden>' + actionButtonsHtml() + '</div>' +
      '</div>';
  }

  // ---- 4) сопоставление 4↔4 ----
  function renderMatch() {
    // берём текущее слово + следующие из колоды (до 4 уникальных)
    var group = [];
    var seen = {};
    for (var i = 0; i < session.deck.length && group.length < 4; i++) {
      var id = session.deck[i];
      if (seen[id]) continue; seen[id] = 1;
      group.push(byId[id]);
    }
    var m = L.buildMatch(group);
    session.match = { data: m, picked: { left: null }, solved: {}, ids: group.map(function (w) { return w.id; }) };
    var leftHtml = m.left.map(function (it) {
      return '<button class="mtile mtile--left" data-side="left" data-id="' + esc(it.id) + '" type="button">' + esc(it.text) + '</button>';
    }).join("");
    var rightHtml = m.right.map(function (it) {
      return '<button class="mtile mtile--right" data-side="right" data-id="' + esc(it.id) + '" type="button">' + esc(it.text) + '</button>';
    }).join("");
    return '<div class="sx sx--match">' + typeTag("match") +
      '<div class="sx-ask">Сопоставь слово и перевод — кликни слева, затем справа</div>' +
      '<div class="mgrid"><div class="mcol mcol--left">' + leftHtml + '</div>' +
        '<div class="mcol mcol--right">' + rightHtml + '</div></div>' +
      '<div class="sx-verdict" id="sx-verdict" hidden></div>' +
      '<div class="sx-actions sx-actions--match" id="sx-match-after" hidden>' +
        '<button class="btn btn--primary sx-act" data-act="match-continue" type="button">Дальше →</button>' +
      '</div>' +
      '</div>';
  }

  /* ---- обработка действий внутри сцены ---- */
  $("session-stage").addEventListener("click", function (e) {
    if (!session) return;
    // переворот карточки
    if (e.target.closest("#sx-scard") && session.curType === "flip") {
      e.target.closest("#sx-scard").classList.toggle("is-flipped");
      return;
    }
    // выбор из 4
    var opt = e.target.closest(".sx-opt");
    if (opt && session.curType === "choice" && !session.answered) {
      handleChoice(parseInt(opt.getAttribute("data-i"), 10));
      return;
    }
    // сопоставление: клик по плитке
    var tile = e.target.closest(".mtile");
    if (tile && session.curType === "match") { handleMatchTile(tile); return; }
    // кнопки результата шага
    var act = e.target.closest(".sx-act");
    if (act) {
      var a = act.getAttribute("data-act");
      if (a === "match-continue") {
        if (session.curType === "match") advanceMatch();
        return;
      }
      // 3 кнопки (выучил/не выучил/отложить) — только для не-match шагов
      if (session.curType !== "match") applyStepAction(a);
    }
  });

  // ввод ответа: submit формы
  $("session-stage").addEventListener("submit", function (e) {
    var form = e.target.closest("#sx-form");
    if (!form || !session || session.curType !== "input") return;
    e.preventDefault();
    if (session.answered) return;
    handleInput();
  });

  function handleInput() {
    var inp = $("sx-input");
    var val = inp ? inp.value : "";
    var ok = L.checkInput(val, session.curWord, session.curDir);
    session.answered = true;
    var correct = session.curDir === "hy2ru" ? session.curWord.ru : session.curWord.hy;
    var v = $("sx-verdict");
    v.hidden = false;
    v.className = "sx-verdict " + (ok ? "is-ok" : "is-bad");
    v.innerHTML = ok
      ? '<b>Верно!</b> ' + esc(correct)
      : '<b>Не совсем.</b> Правильно: <span class="sx-correct">' + esc(correct) + '</span>' +
        (session.curWord.tr ? ' <span class="sx-tr-inline">[' + esc(session.curWord.tr) + ']</span>' : '');
    if (inp) inp.disabled = true;
    $("sx-after").hidden = false;
  }

  function handleChoice(i) {
    session.answered = true;
    var ch = session.choice;
    var btns = $("session-stage").querySelectorAll(".sx-opt");
    btns.forEach(function (b, idx) {
      b.disabled = true;
      if (idx === ch.correctIndex) b.classList.add("is-correct");
      if (idx === i && idx !== ch.correctIndex) b.classList.add("is-wrong");
    });
    $("sx-after").hidden = false;
  }

  function handleMatchTile(tile) {
    var side = tile.getAttribute("data-side");
    var id = tile.getAttribute("data-id");
    var st = session.match;
    if (st.solved[id] && side === "left") return; // уже решено
    if (side === "left") {
      // снять прежнее выделение слева
      $("session-stage").querySelectorAll(".mtile--left.is-picked").forEach(function (b) { b.classList.remove("is-picked"); });
      if (st.picked.left === id) { st.picked.left = null; return; }
      st.picked.left = id;
      tile.classList.add("is-picked");
      return;
    }
    // side === right
    if (!st.picked.left) return;
    var leftId = st.picked.left;
    var rightId = id;
    var leftBtn = $("session-stage").querySelector('.mtile--left[data-id="' + leftId + '"]');
    var rightBtn = tile;
    if (st.data.pairs[leftId] === rightId) {
      // верная пара
      st.solved[leftId] = 1;
      leftBtn.classList.remove("is-picked");
      leftBtn.classList.add("is-solved"); leftBtn.disabled = true;
      rightBtn.classList.add("is-solved"); rightBtn.disabled = true;
      st.picked.left = null;
      // все решены?
      if (Object.keys(st.solved).length >= st.ids.length) {
        var v = $("sx-verdict"); v.hidden = false; v.className = "sx-verdict is-ok";
        v.innerHTML = "<b>Все пары верны!</b>";
        $("sx-match-after").hidden = false;
      }
    } else {
      // неверно — мигнуть и сбросить
      leftBtn.classList.remove("is-picked");
      leftBtn.classList.add("is-shake");
      rightBtn.classList.add("is-shake");
      st.picked.left = null;
      setTimeout(function () {
        if (leftBtn) leftBtn.classList.remove("is-shake");
        if (rightBtn) rightBtn.classList.remove("is-shake");
      }, 400);
    }
  }

  // Завершение сопоставления: убрать ВСЕ слова группы из колоды как «пройденные»
  // (засчитываем выученными — это активная проверка узнавания).
  function advanceMatch() {
    if (!session || !session.match) return;
    var ids = session.match.ids;
    ids.forEach(function (id) { markLearned(id); removeFromDeck(id); session.stats.learned++; });
    session.stepNo++;
    renderDash();
    renderStep();
  }

  function markLearned(id) {
    if (!learned[id]) { learned[id] = 1; saveMap(KEY, learned); }
  }
  function removeFromDeck(id) {
    session.deck = session.deck.filter(function (x) { return String(x) !== String(id); });
  }

  function applyStepAction(action) {
    if (!session || !session.deck.length) return;
    var id = session.deck[0];
    if (action === "learn") {
      markLearned(id);
      session.stats.learned++;
      session.deck = L.applyAction(session.deck, "learn");
    } else if (action === "skip") {
      session.stats.skipped++;
      session.deck = L.applyAction(session.deck, "skip");
    } else { // again — в конец, вернётся
      session.deck = L.applyAction(session.deck, "again");
    }
    session.stepNo++;
    renderDash();
    renderStep();
  }

  $("session-end").addEventListener("click", finishSession);

  function finishSession() {
    if (!session) return;
    var s = session.stats;
    var processed = s.learned + s.skipped;
    var pct = s.total ? Math.round(processed / s.total * 100) : 0;
    $("result-stats").innerHTML =
      '<div class="rstat rstat--learn"><div class="rstat__n">' + s.learned + '</div><div class="rstat__l">выучил</div></div>' +
      '<div class="rstat rstat--skip"><div class="rstat__n">' + s.skipped + '</div><div class="rstat__l">отложил</div></div>' +
      '<div class="rstat rstat--rem"><div class="rstat__n">' + session.deck.length + '</div><div class="rstat__l">осталось</div></div>' +
      '<div class="rstat rstat--pct"><div class="rstat__n">' + pct + '%</div><div class="rstat__l">сессии пройдено</div></div>';
    session = null;
    showOnly("result");
    renderDash();
    refreshBrowse();
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("setup-go").addEventListener("click", startSession);
  $("result-again").addEventListener("click", function () { showOnly("setup"); renderPick(); updateDeckInfo(); $("setup").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("result-dash").addEventListener("click", function () {
    ["setup", "session", "result"].forEach(function (id) { $(id).hidden = true; });
    $("dash").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ============ СВОБОДНЫЙ ПРОСМОТР (Список / Карточки) ============ */
  var listEl = $("list"), cardsEl = $("cards"), studyEl = $("study"),
      studyNavEl = $("studynav"), gridEl = $("grid"), ccountEl = $("ccount");

  function matches(w) {
    if (browseState.level !== "all" && w.level !== browseState.level) return false;
    if (browseState.theme !== "all" && w.theme !== browseState.theme) return false;
    if (browseState.onlyUnlearned && learned[w.id]) return false;
    if (browseState.q) {
      var q = browseState.q.toLowerCase();
      if ((w.ru || "").toLowerCase().indexOf(q) === -1 &&
          (w.hy || "").toLowerCase().indexOf(q) === -1 &&
          (w.tr || "").toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  }

  function renderList() {
    if (!VOCAB.length) { listEl.innerHTML = '<div class="card vempty">Словарь не загружен.</div>'; return; }
    var html = "", any = false;
    orderedThemes().forEach(function (theme) {
      var words = VOCAB.filter(function (w) { return w.theme === theme && matches(w); });
      if (!words.length) return;
      any = true;
      var lvl = levelOfTheme(theme);
      var doneInTheme = VOCAB.filter(function (w) { return w.theme === theme && learned[w.id]; }).length;
      var totalInTheme = VOCAB.filter(function (w) { return w.theme === theme; }).length;
      html += '<div class="vtheme-head"><h3><span class="badge badge--' + lvl.toLowerCase() + '">' + lvl + '</span> ' + esc(theme) +
              '</h3><span class="vtheme-prog" data-theme-prog="' + esc(theme) + '">' + doneInTheme + ' / ' + totalInTheme + '</span></div>';
      html += '<div class="vlist">';
      words.forEach(function (w) {
        var on = learned[w.id] ? " is-learned" : "";
        var ck = learned[w.id] ? " checked" : "";
        var inPick = pick[w.id];
        var tr = w.tr ? '<span class="vru" style="color:var(--apricot);font-weight:600">' + esc(w.tr) + '</span>' : '';
        html += '<div class="vrow' + on + '" data-id="' + w.id + '">' +
                  '<label class="vrow__check"><input type="checkbox"' + ck + '></label>' +
                  '<span class="vword">' + esc(w.hy) + '</span>' + tr +
                  '<span class="vru">' + esc(w.ru) + '</span>' +
                  '<button class="vrow__pick' + (inPick ? ' is-in' : '') + '" data-act="pick" type="button" title="в подборку для сессии">' +
                    (inPick ? '✓' : '+') + '</button>' +
                '</div>';
      });
      html += '</div>';
    });
    listEl.innerHTML = any ? html : '<div class="card vempty">Ничего не найдено под этот фильтр.</div>';
  }

  function rebuildBrowseDeck() {
    browseState.deck = VOCAB.filter(matches);
    if (browseState.pos >= browseState.deck.length) browseState.pos = 0;
  }
  function backHtml(w) {
    var h = '<div class="sface__hy">' + esc(w.hy) + (w.tr ? '<span class="sb-tr">' + esc(w.tr) + '</span>' : '') + '</div>';
    h += '<div class="sb-ru">' + esc(w.ru) + '</div>';
    if (w.forms) h += '<div class="sb-row"><div class="sb-label">Формы</div><div class="sb-forms">' + esc(w.forms) + '</div></div>';
    if (w.ex) h += '<div class="sb-row"><div class="sb-label">Пример</div><div class="sb-ex">' + esc(w.ex) + '</div>' +
                   (w.exru ? '<div class="sb-exru">' + esc(w.exru) + '</div>' : '') + '</div>';
    return h;
  }
  function renderStudy() {
    if (!browseState.deck.length) { studyEl.innerHTML = '<div class="card vempty">Под этот фильтр слов нет.</div>'; studyNavEl.innerHTML = ""; return; }
    if (browseState.pos >= browseState.deck.length) browseState.pos = 0;
    var w = browseState.deck[browseState.pos], lvl = (w.level || ""), lo = learned[w.id];
    var top = '<div class="sface__top"><span class="badge badge--' + lvl.toLowerCase() + '">' + lvl + '</span><span>' + esc(w.theme) + '</span></div>';
    studyEl.innerHTML =
      '<div class="study"><div class="scard' + (browseState.flipped ? ' is-flipped' : '') + (lo ? ' is-learned' : '') + '" id="scard">' +
        '<div class="sface sface--front">' + top + '<div class="sface__hy">' + esc(w.hy) + '</div>' +
          '<div class="sface__hint">нажми, чтобы перевернуть</div></div>' +
        '<div class="sface sface--back">' + top + backHtml(w) + '</div>' +
      '</div></div>';
    studyNavEl.innerHTML =
      '<div class="studynav"><span class="chip" data-act="prev">← пред</span>' +
        '<span class="ccount">' + (browseState.pos + 1) + ' / ' + browseState.deck.length + '</span>' +
        '<span class="chip" data-act="next">след →</span><span class="nav-grow"></span>' +
        '<span class="chip' + (lo ? ' is-on' : '') + '" data-act="learn">✓ ' + (lo ? 'выучено' : 'выучил') + '</span></div>';
  }
  function toggleFlip() {
    var c = $("scard"); if (!c) return;
    browseState.flipped = !browseState.flipped; c.classList.toggle("is-flipped", browseState.flipped);
  }
  function step(d) {
    if (!browseState.deck.length) return;
    browseState.pos = (browseState.pos + d + browseState.deck.length) % browseState.deck.length;
    browseState.flipped = false; renderStudy();
  }
  function learnBrowseCurrent() {
    if (!browseState.deck.length) return;
    var w = browseState.deck[browseState.pos];
    if (learned[w.id]) delete learned[w.id]; else learned[w.id] = 1;
    saveMap(KEY, learned); renderDash();
    if (browseState.onlyUnlearned) { rebuildBrowseDeck(); renderStudy(); } else renderStudy();
  }
  function shuffleBrowseDeck() {
    browseState.deck = L.shuffle(browseState.deck);
    browseState.pos = 0; browseState.flipped = false; renderCards();
  }
  function renderGrid() {
    if (!browseState.deck.length) { gridEl.innerHTML = '<div class="card vempty">Под этот фильтр слов нет.</div>'; return; }
    var html = '<div class="cgrid">';
    browseState.deck.forEach(function (w) {
      var lo = learned[w.id];
      html += '<div class="gcard' + (lo ? ' is-learned' : '') + '" data-id="' + w.id + '">' +
        '<span class="gcard__chk" data-act="learn">' + (lo ? '✓' : '○') + '</span>' +
        '<div class="gcard__in">' +
          '<div class="gface gface--front">' + esc(w.hy) + '</div>' +
          '<div class="gface gface--back">' +
            (w.tr ? '<span class="gb-tr">' + esc(w.tr) + '</span>' : '') +
            '<span class="gb-ru">' + esc(w.ru) + '</span>' +
            (w.ex ? '<span class="gb-ex">' + esc(w.ex) + '</span>' : '') +
          '</div></div></div>';
    });
    gridEl.innerHTML = html + '</div>';
  }
  function renderCards() {
    ccountEl.textContent = "Карточек: " + browseState.deck.length;
    if (browseState.cardMode === "single") {
      studyEl.hidden = false; studyNavEl.hidden = false; gridEl.hidden = true; renderStudy();
    } else {
      studyEl.hidden = true; studyNavEl.hidden = true; gridEl.hidden = false; renderGrid();
    }
  }
  function refreshBrowse() {
    rebuildBrowseDeck();
    if (browseState.view === "list") renderList(); else renderCards();
  }

  // ---- события списка ----
  listEl.addEventListener("change", function (e) {
    if (e.target.tagName !== "INPUT") return;
    var row = e.target.closest(".vrow"); if (!row) return;
    var id = row.getAttribute("data-id");
    if (e.target.checked) learned[id] = 1; else delete learned[id];
    saveMap(KEY, learned);
    row.classList.toggle("is-learned", !!e.target.checked);
    renderDash();
    if (browseState.onlyUnlearned && e.target.checked) { renderList(); return; }
    var w = byId[id];
    if (w) {
      var el = listEl.querySelector('[data-theme-prog="' + w.theme.replace(/"/g, '\\"') + '"]');
      if (el) {
        var dn = VOCAB.filter(function (x) { return x.theme === w.theme && learned[x.id]; }).length;
        var tt = VOCAB.filter(function (x) { return x.theme === w.theme; }).length;
        el.textContent = dn + " / " + tt;
      }
    }
  });
  listEl.addEventListener("click", function (e) {
    var pk = e.target.closest('[data-act="pick"]'); if (!pk) return;
    var row = e.target.closest(".vrow"); if (!row) return;
    var id = row.getAttribute("data-id");
    if (pick[id]) { delete pick[id]; pk.classList.remove("is-in"); pk.textContent = "+"; }
    else { pick[id] = 1; pk.classList.add("is-in"); pk.textContent = "✓"; }
    saveMap(PICK_KEY, pick);
  });

  studyEl.addEventListener("click", function (e) { if (e.target.closest(".scard")) toggleFlip(); });
  studyNavEl.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]"); if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "prev") step(-1); else if (act === "next") step(1); else if (act === "learn") learnBrowseCurrent();
  });
  gridEl.addEventListener("click", function (e) {
    var chk = e.target.closest('[data-act="learn"]');
    var card = e.target.closest(".gcard"); if (!card) return;
    var id = card.getAttribute("data-id");
    if (chk) {
      if (learned[id]) delete learned[id]; else learned[id] = 1;
      saveMap(KEY, learned); renderDash();
      card.classList.toggle("is-learned", !!learned[id]);
      chk.textContent = learned[id] ? "✓" : "○";
      if (browseState.onlyUnlearned && learned[id]) { rebuildBrowseDeck(); renderGrid(); }
      return;
    }
    card.classList.toggle("is-flipped");
  });

  document.querySelectorAll(".vmode .chip[data-view]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll(".vmode .chip").forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      browseState.view = chip.getAttribute("data-view");
      var cards = browseState.view === "cards";
      listEl.hidden = cards; cardsEl.hidden = !cards;
      refreshBrowse();
    });
  });
  document.querySelectorAll(".cardbar .chip[data-cardmode]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll(".cardbar .chip[data-cardmode]").forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      browseState.cardMode = chip.getAttribute("data-cardmode");
      browseState.flipped = false; renderCards();
    });
  });
  $("shuffle").addEventListener("click", shuffleBrowseDeck);

  document.querySelectorAll(".vbar .chip[data-level]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll(".vbar .chip[data-level]").forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      browseState.level = chip.getAttribute("data-level");
      browseState.pos = 0; browseState.flipped = false; refreshBrowse();
    });
  });
  var themeSel = $("theme");
  (function fillThemes() {
    var opts = '<option value="all">Все темы</option>';
    orderedThemes().forEach(function (t) { opts += '<option value="' + esc(t) + '">' + esc(levelOfTheme(t)) + " · " + esc(t) + '</option>'; });
    themeSel.innerHTML = opts;
  })();
  themeSel.addEventListener("change", function () { browseState.theme = themeSel.value; browseState.pos = 0; browseState.flipped = false; refreshBrowse(); });
  var tu = $("toggle-unlearned");
  tu.addEventListener("click", function () {
    browseState.onlyUnlearned = !browseState.onlyUnlearned;
    tu.classList.toggle("is-active", browseState.onlyUnlearned);
    browseState.pos = 0; browseState.flipped = false; refreshBrowse();
  });
  var search = $("search"), timer = null;
  search.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { browseState.q = search.value.trim(); browseState.pos = 0; browseState.flipped = false; refreshBrowse(); }, 180);
  });
  $("reset").addEventListener("click", function () {
    if (confirm("Сбросить весь прогресс по словам? Отметки «выучено» исчезнут.")) {
      learned = {}; saveMap(KEY, learned); renderDash(); refreshBrowse();
    }
  });

  // клавиатура (только карточки «по одной» в свободном просмотре)
  document.addEventListener("keydown", function (e) {
    if (!$("session").hidden) return; // в сессии — не мешаем
    if (browseState.view !== "cards" || browseState.cardMode !== "single") return;
    var tag = (document.activeElement || {}).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); toggleFlip(); }
    else if (e.code === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.code === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "l" || e.key === "L" || e.key === "в" || e.key === "В") { learnBrowseCurrent(); }
    else if (e.key === "s" || e.key === "S" || e.key === "ы") { shuffleBrowseDeck(); }
  });

  /* ============ ЭКСПОРТ / ИМПОРТ ============ */
  function lessonsGet() { try { return JSON.parse(localStorage.getItem(LESSON_KEY)) || {}; } catch (e) { return {}; } }
  function lessonsSet(o) { try { localStorage.setItem(LESSON_KEY, JSON.stringify(o)); } catch (e) {} }
  function download(name, text) {
    var b = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }
  $("export").addEventListener("click", function () {
    var stores = {};
    window.HYProgress.keys.forEach(function (key) { stores[key] = window.HYProgress.read(key); });
    var data = { app: "hy-course", version: 2, exportedAt: new Date().toISOString(), stores: stores };
    download("armenian-progress-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data, null, 2));
  });
  $("import").addEventListener("click", function () { $("importfile").click(); });
  $("importfile").addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    if (file.size > 5000000) { alert("Файл слишком большой."); e.target.value = ""; return; }
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (data.app !== "hy-course" || [1, 2].indexOf(data.version) === -1) throw Error("Это не файл прогресса курса.");
        var stores = data.version === 2 ? data.stores : { "hy-vocab-v1": data.vocab, "hy-progress-v1": data.lessons, "hy-vocab-pick-v1": data.pick };
        if (!stores || typeof stores !== "object" || Array.isArray(stores)) throw Error("Некорректные данные.");
        var pending = [];
        window.HYProgress.keys.forEach(function (key) {
          var value = stores[key];
          if (value === undefined) return;
          if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Некорректный раздел прогресса.");
          pending.push([key, Object.assign({}, window.HYProgress.read(key), value)]);
        });
        var saved = true;
        pending.forEach(function (entry) { if (!window.HYProgress.write(entry[0], entry[1])) saved = false; });
        if (!saved) throw Error("Не всё удалось сохранить: проверь свободное место в браузере.");
        learned = loadMap(KEY); pick = loadMap(PICK_KEY); var lp = lessonsGet();
        renderDash(); refreshBrowse(); renderPick();
        alert("Прогресс загружен. Слов: " + Object.keys(learned).length + ", уроков: " + Object.keys(lp).length + ". (объединено, ничего не стёрто)");
      } catch (err) { alert("Не удалось прочитать файл: " + err.message); }
      e.target.value = "";
    };
    r.readAsText(file);
  });

  /* ============ СТАРТ ============ */
  renderDash();
  refreshBrowse();
})();
}
