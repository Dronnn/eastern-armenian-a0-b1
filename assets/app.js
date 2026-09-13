/* ============================================================
   Հայերեն — интерактив курса
   Квизы (выбор + ввод), флешкарты, reveal, прогресс (localStorage).
   Подключается на всех страницах: <script src="../assets/app.js" defer></script>
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     ТЕМА (тёмная / светлая) — идемпотентно, применяется как можно
     раньше (до DOMContentLoaded), чтобы не было вспышки светлого.
     localStorage 'hy-theme': 'light' | 'dark'. Нет ключа => авто
     по системе (matchMedia), без записи в storage.
     ============================================================ */
  var THEME_KEY = "hy-theme";
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function storedTheme() {
    try {
      var v = localStorage.getItem(THEME_KEY);
      return v === "dark" || v === "light" ? v : null;
    } catch (e) { return null; }
  }
  function systemTheme() { return mql && mql.matches ? "dark" : "light"; }
  function activeTheme() { return storedTheme() || systemTheme(); }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    updateToggle();
  }

  function updateToggle() {
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    var dark = document.documentElement.dataset.theme === "dark";
    btn.textContent = dark ? "☀️" : "🌙";
    var label = dark ? "Светлая тема" : "Тёмная тема";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  // Применяем тему немедленно (на <html>, который уже доступен).
  applyTheme(activeTheme());

  // В авто-режиме (нет явного выбора) следуем за системной темой.
  if (mql) {
    var onSystem = function () { if (!storedTheme()) applyTheme(systemTheme()); };
    if (mql.addEventListener) mql.addEventListener("change", onSystem);
    else if (mql.addListener) mql.addListener(onSystem);
  }

  function initThemeToggle() {
    // Идемпотентность: если кнопка уже есть — выходим.
    if (document.querySelector("[data-theme-toggle]")) { updateToggle(); return; }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("data-theme-toggle", "");
    btn.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next);
    });

    var bar = document.querySelector(".topbar__in");
    if (bar) {
      bar.appendChild(btn);
    } else {
      btn.classList.add("theme-toggle--float");
      document.body.appendChild(btn);
    }
    updateToggle();
  }

  /* --- нормализация армянского ввода --- */
  function norm(s) {
    return (s || "")
      .normalize("NFC")
      .trim()
      .toLowerCase()
      .replace(/և/g, "եւ")
      .replace(/[ՙ՚՛՜՝՞՟։．.,!?¡՛]/g, "")
      .replace(/\s+/g, " ");
  }

  /* --- Квизы с выбором варианта --- */
  function initChoiceQuizzes() {
    document.querySelectorAll('[data-quiz]:not([data-quiz="type"])').forEach(function (q) {
      var opts = q.querySelectorAll(".opt");
      var fb = q.querySelector("[data-fb]");
      opts.forEach(function (opt) {
        opt.addEventListener("click", function () {
          if (q.dataset.done) return;
          q.dataset.done = "1";
          var ok = opt.dataset.correct === "true";
          opts.forEach(function (o) {
            o.setAttribute("data-done", "1");
            if (o.dataset.correct === "true") o.classList.add("opt--reveal");
          });
          opt.classList.remove("opt--reveal");
          opt.classList.add(ok ? "opt--correct" : "opt--wrong");
          if (fb) {
            fb.textContent = ok
              ? (q.dataset.good || "Верно! 🎉")
              : (q.dataset.bad || "Не совсем — правильный вариант подсвечен зелёным.");
            fb.className = "quiz__fb " + (ok ? "is-good" : "is-bad");
          }
          bumpScore(ok);
        });
      });
    });
  }

  /* --- Квизы с вводом ответа --- */
  function initTypeQuizzes() {
    document.querySelectorAll('[data-quiz="type"]').forEach(function (q) {
      var input = q.querySelector("[data-input]");
      var btn = q.querySelector("[data-check]");
      var fb = q.querySelector("[data-fb]");
      var answers = (q.dataset.answer || "").split("|").map(norm);
      var tries = 0;
      var scored = false;
      if (!btn || !input) return;
      function check() {
        if (q.dataset.done) return;
        if (!norm(input.value)) {
          fb.textContent = "Сначала введи ответ.";
          fb.className = "quiz__fb";
          return;
        }
        var ok = answers.indexOf(norm(input.value)) !== -1;
        tries++;
        if (ok) {
          q.dataset.done = "1";
          input.style.borderColor = "var(--good)";
          fb.textContent = q.dataset.good || "Верно! 🎉";
          fb.className = "quiz__fb is-good";
          if (!scored) { bumpScore(true); scored = true; }
        } else if (tries >= 2) {
          input.style.borderColor = "var(--bad)";
          fb.textContent = "Образец ответа: " + q.dataset.answer.split("|")[0] + " Исправь свой ответ и нажми «Проверить» ещё раз.";
          fb.className = "quiz__fb is-bad";
          if (!scored) { bumpScore(false); scored = true; }
        } else {
          input.style.borderColor = "var(--bad)";
          fb.textContent = q.dataset.hint || "Почти — попробуй ещё раз.";
          fb.className = "quiz__fb is-bad";
        }
      }
      btn.addEventListener("click", check);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") check(); });
    });
  }

  /* --- Флешкарты --- */
  function initFlashcards() {
    document.querySelectorAll("[data-flip]").forEach(function (c) {
      c.addEventListener("click", function () { c.classList.toggle("is-flipped"); });
    });
  }

  /* --- Reveal --- */
  function initReveals() {
    document.querySelectorAll("[data-reveal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var t = document.querySelector(btn.dataset.reveal);
        if (!t) return;
        var show = t.hasAttribute("hidden");
        if (show) { t.removeAttribute("hidden"); btn.textContent = btn.dataset.hide || "Скрыть"; }
        else { t.setAttribute("hidden", ""); btn.textContent = btn.dataset.show || "Показать"; }
      });
    });
  }

  /* --- Счётчик очков на странице --- */
  var score = { ok: 0, total: 0 };
  function bumpScore(ok) {
    score.total++; if (ok) score.ok++;
    var el = document.querySelector("[data-score]");
    if (el) el.textContent = score.ok + " / " + score.total;
    document.dispatchEvent(new CustomEvent("hy:score", { detail: { ok: score.ok, total: score.total } }));
  }
  document.addEventListener("hy:answer", function (event) { bumpScore(event.detail.ok); });

  /* --- Прогресс по урокам (localStorage) --- */
  var KEY = "hy-progress-v1";
  function getDone() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function setDone(map) { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {} }

  function initCompleteButtons() {
    document.querySelectorAll("[data-complete]").forEach(function (btn) {
      var id = btn.dataset.complete;
      var done = getDone();
      function paint() {
        if (done[id]) { btn.textContent = "✓ Урок пройден"; btn.classList.remove("btn--primary"); btn.classList.add("btn--ghost"); }
        else { btn.textContent = btn.dataset.label || "Отметить урок пройденным ✓"; btn.classList.add("btn--primary"); btn.classList.remove("btn--ghost"); }
      }
      paint();
      btn.addEventListener("click", function () {
        done = getDone();
        if (done[id]) { delete done[id]; } else { done[id] = Date.now(); }
        setDone(done); paint();
      });
    });
  }

  /* --- Отметки прогресса в оглавлении (index) --- */
  function initIndexProgress() {
    var done = getDone();
    var lessons = document.querySelectorAll("[data-lesson]");
    if (!lessons.length) return;
    var completed = 0;
    lessons.forEach(function (el) {
      var id = el.dataset.lesson;
      var mark = el.querySelector("[data-check-slot]");
      if (done[id]) {
        completed++;
        if (mark) mark.innerHTML = '<span class="tile__done">✓</span>';
      }
    });
    var bar = document.querySelector("[data-progress-bar]");
    var lbl = document.querySelector("[data-progress-label]");
    var pct = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
    if (bar) bar.style.width = pct + "%";
    if (lbl) lbl.textContent = completed + " из " + lessons.length + " · " + pct + "%";
  }

  /* ============================================================
     Синхронизация «выучил ✓» урок <-> тренажёр (vocabulary.html).
     Общий ключ localStorage 'hy-vocab-v1' = { [id]: 1 } — ровно тот
     формат, что пишет тренажёр (ключи — строковые числа).
     В уроках контрол: <button class="flearn" data-learn="ID" ...>.
     Тренажёр: строки .vrow[data-id] и карточки .gcard[data-id].
     Живая кросс-вкладочная синхронизация — через событие 'storage'
     (срабатывает в ДРУГИХ вкладках при записи). Внутри одной вкладки
     достаточно чтения при загрузке.
     ============================================================ */
  var VOCAB_KEY = "hy-vocab-v1";
  var vocabBound = false; // защита от двойной привязки обработчиков

  function vocabLoad() {
    try { return JSON.parse(localStorage.getItem(VOCAB_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function vocabSave(map) {
    try { localStorage.setItem(VOCAB_KEY, JSON.stringify(map)); } catch (e) {}
  }

  // Перекрасить один контрол [data-learn] по текущему состоянию.
  function paintLearn(btn, learned) {
    var id = btn.getAttribute("data-learn");
    var on = !!learned[id];
    var cell = btn.closest(".flashcell") || btn.parentNode;
    if (cell && cell.classList) cell.classList.toggle("is-learned", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "✓ выучено" : "выучил";
  }

  // Перекрасить ВСЕ контролы/строки на странице по storage (живая синхр.).
  function repaintAllVocab() {
    var learned = vocabLoad();
    document.querySelectorAll("[data-learn]").forEach(function (btn) {
      paintLearn(btn, learned);
    });
    // Если открыт тренажёр (vocabulary.html) — синхронизируем и его DOM.
    document.querySelectorAll(".vrow[data-id]").forEach(function (row) {
      var on = !!learned[row.getAttribute("data-id")];
      row.classList.toggle("is-learned", on);
      var cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = on;
    });
    document.querySelectorAll(".gcard[data-id]").forEach(function (card) {
      var on = !!learned[card.getAttribute("data-id")];
      card.classList.toggle("is-learned", on);
      var chk = card.querySelector('[data-act="learn"]');
      if (chk) chk.textContent = on ? "✓" : "○";
    });
  }

  function initVocabSync() {
    var controls = document.querySelectorAll("[data-learn]");
    // Начальное состояние контролов урока всегда красим при загрузке.
    var learned = vocabLoad();
    controls.forEach(function (btn) { paintLearn(btn, learned); });

    // Обработчики вешаем один раз на документ (делегирование) — не дублируем.
    if (vocabBound) return;
    vocabBound = true;

    // Клик по контролу урока — toggle id в общем ключе.
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-learn]") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-learn");
      var map = vocabLoad();
      if (map[id]) delete map[id]; else map[id] = 1;
      vocabSave(map);
      repaintAllVocab();
    });

    // Живая синхронизация между вкладками: тренажёр пишет в тот же ключ.
    window.addEventListener("storage", function (e) {
      if (e.key && e.key !== VOCAB_KEY) return;
      repaintAllVocab();
    });
    window.addEventListener("pageshow", repaintAllVocab);
  }

  function initAll() {
    initThemeToggle();
    initChoiceQuizzes();
    initTypeQuizzes();
    initFlashcards();
    initReveals();
    initCompleteButtons();
    initIndexProgress();
    initVocabSync();
  }

  // defer => DOM обычно готов; но если скрипт подгружен позже — initAll сразу.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
