/* Ellenial Party games — family version.
   Plain JavaScript, no build step, no server, no tracking.
   Everything a family types (names, own packs) stays on this phone. */
(function () {
  'use strict';

  // ---------- Storage (only on this phone; fails quietly in private mode) ----------
  var store = {
    get: function (k, fallback) {
      try { var v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: game still works */ }
    }
  };

  var LANGS = ['sv', 'en'];
  var GAMES = ['pannben', 'imposter', 'charades'];

  var S = {
    lang: store.get('ep.lang', null) || ((navigator.language || 'en').toLowerCase().indexOf('sv') === 0 ? 'sv' : 'en'),
    copy: {},
    packs: {},
    own: store.get('ep.ownPacks', []),
    view: { name: 'home' },
    setup: { game: null, packId: 'animals', ownId: null, level: 'easy', seconds: 60, players: 4, names: [] },
    deck: [], deckKey: '',
    imp: null,
    round: null,
    groupTotal: 0,
    motion: 'unknown', // 'on' | 'off' | 'unknown'
    focusAdd: false
  };
  if (LANGS.indexOf(S.lang) < 0) S.lang = 'en';
  if (!Array.isArray(S.own)) S.own = [];

  var app = document.getElementById('app');

  // ---------- Helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function t(path, vars) {
    var v = path.split('.').reduce(function (o, k) { return o && o[k] !== undefined ? o[k] : undefined; }, S.copy);
    if (v === undefined) return path;
    v = String(v);
    if (vars) Object.keys(vars).forEach(function (k) { v = v.split('{' + k + '}').join(vars[k]); });
    return v;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function saveOwn() { store.set('ep.ownPacks', S.own); }

  var I = {
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    pause: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 5v14"/><path d="M15 5v14"/></svg>',
    minus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
    eye: '<svg class="big" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    chat: '<svg class="big" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01"/><path d="M12 11h.01"/><path d="M15.5 11h.01"/></svg>',
    phone: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 3l4 3 4-3"/></svg>',
    phoneSmall: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>',
    up: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
    down: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
    users: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/></svg>',
    game: {
      pannben: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="14" r="7"/><rect x="8" y="2.5" width="8" height="6" rx="1.5"/><path d="M9.5 15.5c.8.8 1.6 1.1 2.5 1.1s1.7-.3 2.5-1.1"/></svg>',
      imposter: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/><path d="M8.6 8.8a2 2 0 1 1 2.6 1.9c-.5.2-.7.6-.7 1.1"/><path d="M10.5 13.6h.01"/></svg>',
      charades: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="2"/><path d="M12 7.5v7"/><path d="M12 9.5l-5-3"/><path d="M12 9.5l4.5-4"/><path d="M12 14.5l-3.5 6"/><path d="M12 14.5l3.5 6"/></svg>',
      packs: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/><path d="M8 11h4"/><path d="M8 15h4"/></svg>'
    }
  };

  function backBtn(act, label) {
    return '<button type="button" class="round-btn" data-act="' + act + '" aria-label="' + esc(label || t('back')) + '">' + I.back + '</button>';
  }

  // ---------- Words ----------
  function builtIn() { return (S.packs[S.lang] && S.packs[S.lang].packs) || []; }
  function packsFor(game) { return builtIn().filter(function (p) { return p.games.indexOf(game) >= 0; }); }
  function ownPack(id) { return S.own.filter(function (p) { return p.id === id; })[0] || null; }

  function wordPool() {
    var st = S.setup;
    if (st.ownId) {
      var op = ownPack(st.ownId);
      return op ? op.words.map(function (w) { return { word: w, cat: op.name }; }) : [];
    }
    var list = st.packId === 'mix' ? packsFor(st.game) : builtIn().filter(function (p) { return p.id === st.packId; });
    var out = [];
    list.forEach(function (p) {
      (p.levels[st.level] || []).forEach(function (w) { out.push({ word: w, cat: p.name }); });
    });
    return out;
  }
  function draw() {
    var st = S.setup;
    var key = [S.lang, st.game, st.packId, st.ownId, st.level].join('|');
    if (key !== S.deckKey || S.deck.length === 0) {
      var last = S.lastWord;
      S.deck = shuffle(wordPool());
      // Avoid showing the same word twice in a row after reshuffling.
      if (S.deck.length > 1 && last && S.deck[S.deck.length - 1].word === last) S.deck.unshift(S.deck.pop());
      S.deckKey = key;
    }
    var item = S.deck.pop() || { word: '—', cat: '' };
    S.lastWord = item.word;
    return item;
  }
  function selectionValid() {
    var st = S.setup;
    if (st.ownId) { var op = ownPack(st.ownId); return !!op && op.words.length >= 3; }
    return wordPool().length > 0;
  }

  // ---------- Timer, wake lock, motion ----------
  var timerId = null;
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function startTimer(onEnd) {
    stopTimer();
    var r = S.round;
    r.endsAt = Date.now() + r.seconds * 1000;
    timerId = setInterval(function () {
      var left = Math.max(0, Math.ceil((r.endsAt - Date.now()) / 1000));
      if (left !== r.left) { r.left = left; paintTimer(); }
      if (left <= 0) { stopTimer(); onEnd(); }
    }, 200);
  }
  function fmt(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function paintTimer() {
    var r = S.round; if (!r) return;
    var els = app.querySelectorAll('[data-timer]');
    for (var i = 0; i < els.length; i++) els[i].textContent = fmt(r.left);
    var ring = app.querySelector('.ring');
    if (ring) {
      var c = 2 * Math.PI * 56;
      ring.querySelector('.fill').style.strokeDashoffset = String(c * (1 - r.left / r.seconds));
      ring.classList.toggle('low', r.left <= 10);
      ring.querySelector('svg').setAttribute('aria-label', r.left + ' s');
    }
  }

  var wakeLock = null;
  function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
      } else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not supported: fine */ }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.round && S.round.stage === 'play') keepAwake(true);
  });

  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // Ask for motion access (iPhone needs a tap first). Resolves to true when tilt can work.
  function askMotion() {
    var D = window.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    if (typeof D.requestPermission === 'function') {
      return D.requestPermission().then(function (r) { return r === 'granted'; }).catch(function () { return false; });
    }
    return Promise.resolve(true);
  }
  // Tilt detection. Phone held sideways and upright on the forehead: |gamma| is near 90.
  // Tilting the screen towards the floor or the ceiling brings |gamma| towards 0;
  // |beta| tells which way: near 180 = screen facing the floor (correct), near 0 = facing up (pass).
  var tilt = { armed: false, seen: false };
  function onOrient(e) {
    if (e.gamma === null || e.beta === null) return;
    tilt.seen = true;
    var r = S.round;
    if (!r || r.game !== 'pannben' || r.stage !== 'play') return;
    var g = Math.abs(e.gamma), b = Math.abs(e.beta);
    if (g > 65) { tilt.armed = true; return; }
    if (!tilt.armed || g > 35 || Date.now() < r.lockUntil) return;
    tilt.armed = false;
    pbAnswer(b > 90);
  }
  function listenTilt(on) {
    window.removeEventListener('deviceorientation', onOrient);
    if (on) { tilt.armed = false; window.addEventListener('deviceorientation', onOrient); }
  }

  function goFull(on) {
    try {
      if (on) {
        var el = document.documentElement;
        var req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (req && !document.fullscreenElement) {
          var p = req.call(el);
          if (p && p.then) p.then(function () {
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
          }).catch(function () {});
        }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    } catch (e) { /* iPhone Safari: no fullscreen for pages, that's fine */ }
  }

  function endRound() {
    stopTimer(); keepAwake(false); listenTilt(false);
    if (S.round && S.round.game === 'pannben') goFull(false);
  }

  // ---------- Views ----------
  function viewHome() {
    var draft = S.packs[S.lang] && S.packs[S.lang].draft;
    var h = '<div class="home-head"><div><h1>' + esc(t('appName')) + '</h1><p>' + esc(t('tagline')) + '</p></div>' +
      '<button type="button" class="chip-btn" data-act="lang" aria-label="' + esc(t('langSwitchLabel')) + '" lang="' + (S.lang === 'sv' ? 'en' : 'sv') + '">' + esc(t('langSwitch')) + '</button></div>';
    if (draft) h += '<p class="draft">' + esc(t('draftBanner')) + '</p>';
    h += '<div class="cards">';
    GAMES.forEach(function (g) {
      var sub = t('games.' + g + '.sub');
      h += '<button type="button" class="game-card" data-act="open" data-arg="' + g + '">' +
        '<span class="game-icon gi-' + g + '">' + I.game[g] + '</span>' +
        '<span class="game-text"><span class="game-name">' + esc(t('games.' + g + '.name')) +
        (sub ? '<span class="game-sub">' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="game-desc">' + esc(t('games.' + g + '.desc')) + '</span>' +
        '<span class="game-meta">' + esc(t('games.' + g + '.meta')) + '</span></span></button>';
    });
    h += '<button type="button" class="game-card" data-act="packs">' +
      '<span class="game-icon gi-packs">' + I.game.packs + '</span>' +
      '<span class="game-text"><span class="game-name">' + esc(t('yourPacks')) + '</span>' +
      '<span class="game-desc">' + esc(t('yourPacksDesc')) + '</span></span></button>';
    h += '</div><p class="foot">' + esc(t('footer')) + '</p>';
    return h;
  }

  function viewSetup() {
    var st = S.setup, g = st.game;
    var h = '<div class="bar">' + backBtn('home') + '<h1 class="bar-title">' + esc(t('games.' + g + '.name')) + '</h1></div>';

    if (g === 'imposter') {
      h += '<section class="group"><h2 class="label">' + esc(t('setup.players')) + '</h2>' +
        '<div class="stepper"><button type="button" class="step-btn" data-act="fewer" aria-label="' + esc(t('setup.fewer')) + '"' + (st.players <= 3 ? ' disabled' : '') + '>' + I.minus + '</button>' +
        '<span class="step-num" aria-live="polite">' + st.players + '</span>' +
        '<button type="button" class="step-btn plus" data-act="more" aria-label="' + esc(t('setup.more')) + '"' + (st.players >= 12 ? ' disabled' : '') + '>' + I.plus + '</button></div>' +
        '<p class="help">' + esc(t('setup.playersHelp')) + '</p></section>';
      h += '<section class="group"><h2 class="label">' + esc(t('setup.names')) + '</h2><div class="names">';
      for (var i = 0; i < st.players; i++) {
        var ph = t('setup.playerN', { n: i + 1 });
        h += '<input type="text" maxlength="20" autocomplete="off" data-name="' + i + '" aria-label="' + esc(ph) + '" placeholder="' + esc(ph) + '" value="' + esc(st.names[i] || '') + '">';
      }
      h += '</div><p class="help">' + esc(t('setup.namesHelp')) + '</p></section>';
    }

    h += '<section class="group"><h2 class="label">' + esc(t('setup.pack')) + '</h2><div class="chips">';
    packsFor(g).forEach(function (p) {
      var on = !st.ownId && st.packId === p.id;
      h += '<button type="button" class="chip" data-act="pack" data-arg="' + esc(p.id) + '" aria-pressed="' + on + '">' + esc(p.name) + '</button>';
    });
    h += '<button type="button" class="chip" data-act="pack" data-arg="mix" aria-pressed="' + (!st.ownId && st.packId === 'mix') + '">' + esc(t('setup.mix')) + '</button></div>';
    if (S.own.length) {
      h += '<div class="chips"><span class="help">' + esc(t('setup.ownPacks')) + '</span>';
      S.own.forEach(function (p) {
        h += '<button type="button" class="chip own" data-act="own" data-arg="' + esc(p.id) + '" aria-pressed="' + (st.ownId === p.id) + '">' + esc(p.name) + ' · ' + p.words.length + '</button>';
      });
      h += '</div>';
    }
    h += '</section>';

    h += '<section class="group"><h2 class="label">' + esc(t('setup.level')) + '</h2><div class="seg" role="group" aria-label="' + esc(t('setup.level')) + '">';
    ['easy', 'medium', 'hard'].forEach(function (l) {
      h += '<button type="button" data-act="level" data-arg="' + l + '" aria-pressed="' + (!st.ownId && st.level === l) + '"' + (st.ownId ? ' disabled' : '') + '>' + esc(t('setup.levels.' + l)) + '</button>';
    });
    h += '</div><p class="help">' + esc(st.ownId ? t('setup.ownLevel') : t('setup.levelHelp.' + st.level)) + '</p></section>';

    if (g !== 'imposter') {
      h += '<section class="group"><h2 class="label">' + esc(t('setup.round')) + '</h2><div class="seg" role="group" aria-label="' + esc(t('setup.round')) + '">';
      [45, 60, 90].forEach(function (s) {
        h += '<button type="button" data-act="secs" data-arg="' + s + '" aria-pressed="' + (st.seconds === s) + '">' + esc(t('setup.seconds', { n: s })) + '</button>';
      });
      h += '</div></section>';
    }

    var ok = selectionValid();
    h += '<div class="bottom">';
    if (g === 'pannben') h += '<div class="tip">' + I.phone + '<p>' + esc(t('setup.pannbenTip')) + '</p></div>';
    if (g === 'charades') h += '<div class="tip">' + I.users + '<p>' + esc(t('setup.charadesTip')) + '</p></div>';
    if (!ok) h += '<p class="center-text">' + esc(st.ownId ? t('packs.needWords') : t('setup.emptyPack')) + '</p>';
    h += '<button type="button" class="btn btn-primary" data-act="begin"' + (ok ? '' : ' disabled') + '>' + esc(t('start')) + '</button></div>';
    return h;
  }

  // ----- Imposter -----
  function impName(i) {
    var n = (S.setup.names[i] || '').trim();
    return n || t('setup.playerN', { n: i + 1 });
  }
  function impNew() {
    var n = S.setup.players, item = draw();
    S.imp = { n: n, word: item.word, cat: item.cat, imposter: Math.floor(Math.random() * n), starter: Math.floor(Math.random() * n), i: 0, open: false, stage: 'pass' };
  }
  function viewImposter() {
    var m = S.imp;
    var h = '<div class="bar center">' + backBtn('setup') + '<span class="bar-title">' + esc(t('games.imposter.name')) + '</span><span class="spacer"></span></div>';
    if (m.stage === 'pass') {
      h += '<div class="progress"><p>' + esc(t('imposter.playerOf', { i: m.i + 1, n: m.n })) + '</p><div class="dots" aria-hidden="true">';
      for (var d = 0; d < m.n; d++) h += '<span class="dot' + (d < m.i ? ' done' : d === m.i ? ' now' : '') + '"></span>';
      h += '</div></div>';
      if (!m.open) {
        h += '<button type="button" class="stage" data-act="peek">' + I.eye +
          '<span class="stage-text soft">' + esc(t('imposter.passTo', { name: impName(m.i) })) + '</span>' +
          '<span class="stage-title">' + esc(t('imposter.tapToSee')) + '</span>' +
          '<span class="stage-text soft">' + esc(t('imposter.noPeeking')) + '</span></button>';
      } else if (m.i === m.imposter) {
        h += '<div class="stage night" aria-live="polite"><span class="big-word">' + esc(t('imposter.youAreImposter')) + '</span>' +
          '<span class="stage-text">' + esc(t('imposter.imposterHint', { cat: m.cat })) + '</span></div>';
      } else {
        h += '<div class="stage teal" aria-live="polite"><span class="kicker">' + esc(t('imposter.yourWord')) + '</span>' +
          '<span class="big-word">' + esc(m.word) + '</span><span class="stage-text">' + esc(m.cat) + '</span></div>';
      }
      if (m.open) h += '<button type="button" class="btn btn-primary" data-act="hide">' + esc(m.i === m.n - 1 ? t('imposter.hideLast') : t('imposter.hideAndPass')) + '</button>';
    } else if (m.stage === 'talk') {
      h += '<div class="stage">' + I.chat + '<span class="stage-title">' + esc(t('imposter.allSeen')) + '</span>' +
        '<span class="stage-text soft">' + esc(t('imposter.takeTurns', { name: impName(m.starter) })) + '</span>' +
        '<span class="stage-title" style="margin-top:12px">' + esc(t('imposter.talkIt')) + '</span>' +
        '<span class="stage-text soft">' + esc(t('imposter.talkItDesc')) + '</span></div>' +
        '<button type="button" class="btn btn-primary" data-act="impwho">' + esc(t('imposter.reveal')) + '</button>';
    } else if (m.stage === 'who') {
      h += '<div class="stage night" aria-live="polite"><span class="kicker">' + esc(t('imposter.wasImposter')) + '</span>' +
        '<span class="big-word">' + esc(impName(m.imposter)) + '</span>' +
        '<span class="stage-text">' + esc(t('imposter.lastGuess', { name: impName(m.imposter) })) + '</span></div>' +
        '<button type="button" class="btn btn-primary" data-act="impword">' + esc(t('imposter.showWord')) + '</button>';
    } else {
      h += '<div class="stage teal" aria-live="polite"><span class="kicker">' + esc(t('imposter.wordWas')) + '</span>' +
        '<span class="big-word">' + esc(m.word) + '</span><span class="stage-text">' + esc(m.cat) + '</span>' +
        '<span class="stage-text" style="margin-top:8px">' + esc(t('imposter.guessedIt')) + '</span></div>' +
        '<div class="btn-row"><button type="button" class="btn btn-secondary" data-act="home">' + esc(t('done')) + '</button>' +
        '<button type="button" class="btn btn-primary" data-act="impagain">' + esc(t('imposter.newWord')) + '</button></div>' +
        '<p class="center-text">' + esc(t('imposter.newWordHelp')) + '</p>';
    }
    return h;
  }

  // ----- Charades & PANNBEN shared -----
  function newRound(game) {
    S.round = { game: game, stage: 'ready', seconds: S.setup.seconds, left: S.setup.seconds, turn: 0, item: null, lockUntil: 0, flash: '' };
  }
  function nextWord() { S.round.item = draw(); S.round.lockUntil = Date.now() + 700; }
  function viewTimesUp() {
    var g = S.round.game;
    return '<div class="bar center">' + backBtn('setup') + '<span class="bar-title">' + esc(t('games.' + g + '.name')) + '</span><span class="spacer"></span></div>' +
      '<div class="stage yellow" aria-live="polite"><span class="stage-title">' + esc(t('timesUp')) + '</span>' +
      '<span class="kicker" style="margin-top:20px">' + esc(t('groupSoFar')) + '</span>' +
      '<span class="total">' + S.groupTotal + '</span>' +
      '<span class="stage-text" style="font-weight:700">' + esc(t('wordsTogether')) + '</span></div>' +
      '<p class="center-text">' + esc(t('handOn')) + '</p>' +
      '<div class="bottom" style="margin-top:0"><button type="button" class="btn btn-primary" data-act="nextturn">' + esc(t('nextTurn')) + '</button>' +
      '<button type="button" class="btn btn-secondary" data-act="home">' + esc(t('doneForNow')) + '</button></div>';
  }

  function viewCharades() {
    var r = S.round;
    if (r.stage === 'end') return viewTimesUp();
    if (r.stage === 'ready') {
      return '<div class="bar center">' + backBtn('setup') + '<span class="bar-title">' + esc(t('games.charades.name')) + '</span><span class="spacer"></span></div>' +
        '<div class="stage">' + I.eye + '<span class="stage-title">' + esc(t('charades.nextActor')) + '</span>' +
        '<span class="stage-text soft">' + esc(t('charades.nextActorDesc')) + '</span></div>' +
        '<button type="button" class="btn btn-primary" data-act="chgo">' + esc(t('charades.ready')) + '</button>';
    }
    var c = 2 * Math.PI * 56;
    return '<div class="bar center"><button type="button" class="round-btn" data-act="stopround" aria-label="' + esc(t('pause')) + '">' + I.pause + '</button>' +
      '<span class="pill">' + esc(t('groupSoFar')) + ': ' + S.groupTotal + '</span></div>' +
      '<div class="ring"><svg viewBox="0 0 132 132" role="img" aria-label="' + r.left + ' s"><circle class="track" cx="66" cy="66" r="56" fill="none" stroke-width="10"/>' +
      '<circle class="fill" cx="66" cy="66" r="56" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - r.left / r.seconds)).toFixed(1) + '"/></svg>' +
      '<span data-timer>' + fmt(r.left) + '</span></div>' +
      '<div class="stage"><span class="kicker" style="color:var(--muted)">' + esc(t('charades.actThis')) + '</span>' +
      '<span class="big-word">' + esc(r.item.word) + '</span>' +
      (S.setup.ownId ? '' : '<span class="pill">' + esc(t('setup.levels.' + S.setup.level)) + '</span>') + '</div>' +
      '<p class="center-text">' + esc(t('charades.rules')) + '</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-secondary" data-act="chskip">' + esc(t('charades.skip')) + '</button>' +
      '<button type="button" class="btn btn-primary" data-act="chgot">' + esc(t('charades.gotIt')) + '</button></div>';
  }

  function viewPannben() {
    var r = S.round;
    if (r.stage === 'end') return viewTimesUp();
    if (r.stage === 'ready') {
      return '<div class="bar center">' + backBtn('setup') + '<span class="bar-title">' + esc(t('games.pannben.name')) + '</span><span class="spacer"></span></div>' +
        '<div class="stage yellow"><span class="stage-title">' + esc(t('pannben.getReady')) + '</span>' +
        '<span class="stage-text">' + esc(t('pannben.howTo')) + '</span>' +
        '<span class="stage-text" style="font-weight:700">' + esc(t('pannben.tiltHow')) + '</span></div>' +
        '<p class="center-text">' + esc(S.motion === 'off' ? t('pannben.noMotion') : t('pannben.motionNote')) + '</p>' +
        '<button type="button" class="btn btn-primary" data-act="pbgo">' + esc(t('start')) + '</button>';
    }
    if (r.stage === 'count') {
      return '<div class="pb"><div class="pb-mid"><span class="pb-count" aria-live="assertive">' + r.count + '</span></div></div>';
    }
    var flash = r.flash ? ' ' + r.flash : '';
    var label = r.flash === 'ok' ? t('pannben.correct') : r.flash === 'skip' ? t('pannben.passed') : r.item.word;
    return '<div class="pb' + flash + '">' +
      '<div class="pb-top"><button type="button" class="round-btn" data-act="stopround" aria-label="' + esc(t('pause')) + '">' + I.pause + '</button>' +
      '<span class="pb-badge">' + esc(t('groupSoFar')) + ': ' + S.groupTotal + '</span>' +
      '<span class="pb-time" data-timer>' + fmt(r.left) + '</span></div>' +
      '<div class="pb-mid" aria-live="polite"><span class="pb-word">' + esc(label) + '</span>' +
      (r.flash ? '' : '<span class="pb-cat">' + esc(r.item.cat) + (S.setup.ownId ? '' : ' · ' + esc(t('setup.levels.' + S.setup.level))) + '</span>') + '</div>' +
      '<div class="pb-bottom"><button type="button" class="pb-btn pb-pass" data-act="pbpass">' + I.up + esc(t('pannben.pass')) + '</button>' +
      '<span class="pb-hint">' + esc(t('pannben.tiltHow')) + '</span>' +
      '<button type="button" class="pb-btn pb-got" data-act="pbgot">' + esc(t('pannben.gotIt')) + I.down + '</button></div></div>';
  }
  function pbAnswer(correct) {
    var r = S.round;
    if (!r || r.stage !== 'play' || r.flash) return;
    if (correct) { S.groupTotal++; buzz(60); } else { buzz([30, 40, 30]); }
    r.flash = correct ? 'ok' : 'skip';
    render();
    setTimeout(function () {
      if (S.round !== r || r.stage !== 'play') return;
      r.flash = ''; nextWord(); render();
    }, 650);
  }

  // ----- Own packs -----
  function viewPacks() {
    var h = '<div class="bar">' + backBtn('home') + '<h1 class="bar-title">' + esc(t('packs.title')) + '</h1></div>' +
      '<div class="notice">' + I.phoneSmall + '<span>' + esc(t('packs.intro')) + '</span></div>';
    if (!S.own.length) h += '<p class="help">' + esc(t('packs.none')) + '</p>';
    S.own.forEach(function (p) {
      h += '<button type="button" class="pack-row" data-act="editpack" data-arg="' + esc(p.id) + '"><strong>' + esc(p.name) + '</strong><span>' + esc(t('packs.words', { n: p.words.length })) + '</span></button>';
    });
    h += '<div class="bottom"><button type="button" class="btn btn-teal" data-act="newpack">' + I.plus + esc(t('packs.newPack')) + '</button></div>';
    return h;
  }
  function viewPack() {
    var p = ownPack(S.view.id);
    if (!p) { S.view = { name: 'packs' }; return viewPacks(); }
    var h = '<div class="bar">' + backBtn('packs') +
      '<label class="sr-only" for="packname">' + esc(t('packs.packName')) + '</label>' +
      '<input id="packname" class="name-input" type="text" maxlength="30" autocomplete="off" value="' + esc(p.name) + '"></div>' +
      '<div class="notice">' + I.phoneSmall + '<span>' + esc(t('packs.savedOnPhone')) + '</span></div>' +
      '<form class="add-row" data-form="addword"><label class="sr-only" for="newword">' + esc(t('packs.addWord')) + '</label>' +
      '<input id="newword" type="text" maxlength="40" autocomplete="off" placeholder="' + esc(t('packs.addWord')) + '">' +
      '<button type="submit">' + esc(t('packs.add')) + '</button></form>' +
      '<section class="group"><h2 class="label">' + esc(t('packs.words', { n: p.words.length })) + '</h2><ul class="word-list">';
    p.words.forEach(function (w, i) {
      h += '<li><span>' + esc(w) + '</span><button type="button" data-act="rmword" data-arg="' + i + '" aria-label="' + esc(t('packs.remove', { w: w })) + '">' + I.x + '</button></li>';
    });
    h += '</ul></section><p class="help">' + esc(t('packs.playIn')) + '</p>';
    if (p.words.length < 3) h += '<p class="help">' + esc(t('packs.needWords')) + '</p>';
    h += '<button type="button" class="link-danger" data-act="delpack">' + esc(t('packs.deletePack')) + '</button>';
    return h;
  }

  // ---------- Render ----------
  function render() {
    document.documentElement.lang = S.lang;
    document.title = t('appName') + ' · Ellenial';
    var v = S.view.name, html;
    if (v === 'setup') html = viewSetup();
    else if (v === 'imposter') html = viewImposter();
    else if (v === 'charades') html = viewCharades();
    else if (v === 'pannben') html = viewPannben();
    else if (v === 'packs') html = viewPacks();
    else if (v === 'pack') html = viewPack();
    else html = viewHome();
    app.innerHTML = html;
    if (S.focusAdd) { S.focusAdd = false; var a = document.getElementById('newword'); if (a) a.focus(); }
  }
  function go(view) {
    S.view = view; render();
    try { window.scrollTo(0, 0); } catch (e) {}
    var first = app.querySelector('h1, .bar-title, .stage-title');
    if (first && S.view.name !== 'pannben') { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
  }
  function toSetup() { endRound(); S.round = null; go({ name: 'setup' }); }

  // ---------- Actions ----------
  var actions = {
    lang: function () {
      S.lang = S.lang === 'sv' ? 'en' : 'sv'; store.set('ep.lang', S.lang); S.copy = COPY[S.lang]; render();
    },
    home: function () { endRound(); S.round = null; S.imp = null; go({ name: 'home' }); },
    setup: toSetup,
    open: function (g) {
      S.setup.game = g;
      var ids = packsFor(g).map(function (p) { return p.id; });
      if (!S.setup.ownId && S.setup.packId !== 'mix' && ids.indexOf(S.setup.packId) < 0) S.setup.packId = ids[0] || 'mix';
      if (S.setup.ownId && !ownPack(S.setup.ownId)) S.setup.ownId = null;
      go({ name: 'setup' });
    },
    pack: function (id) { S.setup.packId = id; S.setup.ownId = null; render(); },
    own: function (id) { S.setup.ownId = id; render(); },
    level: function (l) { S.setup.level = l; render(); },
    secs: function (s) { S.setup.seconds = Number(s); render(); },
    fewer: function () { S.setup.players = Math.max(3, S.setup.players - 1); render(); },
    more: function () { S.setup.players = Math.min(12, S.setup.players + 1); render(); },
    begin: function () {
      if (!selectionValid()) return;
      S.groupTotal = 0;
      var g = S.setup.game;
      if (g === 'imposter') { impNew(); go({ name: 'imposter' }); }
      else { newRound(g); go({ name: g }); }
    },
    // Imposter
    peek: function () { S.imp.open = true; render(); },
    hide: function () {
      var m = S.imp; m.open = false;
      if (m.i < m.n - 1) m.i++; else m.stage = 'talk';
      go({ name: 'imposter' });
    },
    impwho: function () { S.imp.stage = 'who'; go({ name: 'imposter' }); },
    impword: function () { S.imp.stage = 'word'; go({ name: 'imposter' }); },
    impagain: function () { impNew(); go({ name: 'imposter' }); },
    // Charades
    chgo: function () {
      var r = S.round; r.stage = 'play'; r.left = r.seconds; nextWord(); keepAwake(true);
      render();
      startTimer(function () { r.stage = 'end'; endRound(); go({ name: 'charades' }); });
    },
    chgot: function () { if (Date.now() < S.round.lockUntil) return; S.groupTotal++; buzz(40); nextWord(); render(); },
    chskip: function () { if (Date.now() < S.round.lockUntil) return; nextWord(); render(); },
    nextturn: function () { var g = S.round.game; newRound(g); go({ name: g }); },
    stopround: toSetup,
    // PANNBEN
    pbgo: function () {
      var r = S.round;
      askMotion().then(function (ok) {
        S.motion = ok ? 'on' : 'off';
        listenTilt(ok);
        goFull(true); keepAwake(true);
        r.stage = 'count'; r.count = 3; render();
        var cd = setInterval(function () {
          if (S.round !== r || r.stage !== 'count') { clearInterval(cd); return; }
          r.count--;
          if (r.count > 0) { render(); return; }
          clearInterval(cd);
          r.stage = 'play'; r.left = r.seconds; nextWord(); render();
          startTimer(function () { r.stage = 'end'; endRound(); go({ name: 'pannben' }); });
        }, 900);
      });
    },
    pbgot: function () { if (Date.now() >= S.round.lockUntil) pbAnswer(true); },
    pbpass: function () { if (Date.now() >= S.round.lockUntil) pbAnswer(false); },
    // Own packs
    packs: function () { go({ name: 'packs' }); },
    newpack: function () {
      var p = { id: uid(), name: t('packs.defaultName'), words: [] };
      S.own.push(p); saveOwn(); S.focusAdd = true; go({ name: 'pack', id: p.id });
    },
    editpack: function (id) { go({ name: 'pack', id: id }); },
    rmword: function (i) { var p = ownPack(S.view.id); if (!p) return; p.words.splice(Number(i), 1); saveOwn(); render(); },
    delpack: function () {
      var p = ownPack(S.view.id); if (!p) return;
      if (!window.confirm(t('packs.confirmDelete', { name: p.name }))) return;
      S.own = S.own.filter(function (x) { return x.id !== p.id; }); saveOwn();
      if (S.setup.ownId === p.id) S.setup.ownId = null;
      go({ name: 'packs' });
    }
  };

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled || !app.contains(el)) return;
    var fn = actions[el.getAttribute('data-act')];
    if (fn) fn(el.getAttribute('data-arg'));
  });
  app.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-name')) { S.setup.names[Number(el.getAttribute('data-name'))] = el.value; }
    if (el.id === 'packname') {
      var p = ownPack(S.view.id);
      if (p) { p.name = el.value.trim() || t('packs.defaultName'); saveOwn(); }
    }
  });
  app.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.getAttribute('data-form') !== 'addword') return;
    e.preventDefault();
    var input = document.getElementById('newword'), p = ownPack(S.view.id);
    var w = (input.value || '').trim();
    if (!p || !w) return;
    if (p.words.indexOf(w) < 0) p.words.unshift(w);
    saveOwn(); S.focusAdd = true; render();
  });

  // ---------- Boot ----------
  var COPY = {};
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  Promise.all([getJSON('copy/en.json'), getJSON('copy/sv.json'), getJSON('packs/en.json'), getJSON('packs/sv.json')])
    .then(function (res) {
      COPY.en = res[0]; COPY.sv = res[1];
      S.packs.en = res[2]; S.packs.sv = res[3];
      S.copy = COPY[S.lang];
      render();
    })
    .catch(function () {
      app.innerHTML = '<p class="help">Could not load the game. Check your connection once, then it works offline.</p>';
    });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
