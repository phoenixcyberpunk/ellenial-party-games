/* Lapp i hatt — the hat game, played on everyone's own phone.
   The only game here that uses the internet: words are collected in a temporary game
   (lives up to 24 h) in a small database. No accounts: each phone keeps a secret player
   token. Phones don't need to be live — they only sync between turns. During a turn the
   describer's phone runs everything locally. Words are deleted when the game ends. */
(function () {
  'use strict';

  var API = 'https://knvrvmqdxvcatsrvkrgx.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_5e3mg1E-r-P_to34ONwRfw_FQYUwy3z';
  var POLL_MS = 2500;

  window.EPHatt = function (ep) {
    var S = ep.S, t = ep.t, esc = ep.esc, I = ep.I, app = ep.app;

    var H = S.hatt = {
      stage: 'setup',              // 'setup' | 'join' | 'game'
      ses: ep.store.get('ep.hatt', null), // { code, token, player }
      name: ep.store.get('ep.hattName', ''),
      opts: { seconds: 45, skips: 0, skipN: 2, round4: false, teams: 'scramble', mix: false },
      joinCode: '',
      data: null,                  // last state from the server
      turn: null,                  // the describer's turn, run on this phone
      ended: null,                 // { n } after a turn, until OK
      pending: null,               // a finished turn that still needs sending
      busy: false, err: '', note: '',
      draft: '', confirmSkip: false
    };

    // ---------- Server ----------
    function rpc(fn, args) {
      return fetch(API + fn, {
        method: 'POST',
        headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      }).then(function (r) {
        return r.text().then(function (txt) {
          var body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) {}
          if (!r.ok) {
            var m = body && body.message ? String(body.message) : '';
            var code = (m.match(/hatt:([a-z]+)/) || [])[1] || 'net';
            var err = new Error(code); err.code = code; throw err;
          }
          return body;
        });
      }, function () { var err = new Error('net'); err.code = 'net'; throw err; });
    }
    function errText(e) {
      var c = (e && e.code) || 'net';
      var s = t('hatt.err.' + c);
      return s.indexOf('hatt.err.') === 0 ? t('hatt.err.net') : s;
    }
    function saveSes(s) { H.ses = s; ep.store.set('ep.hatt', s); }
    function forget() { saveSes(null); H.data = null; H.turn = null; H.ended = null; H.pending = null; stopTurnTimer(); }
    function me() { return H.data && H.data.me; }
    function a(c) { return { p_code: H.ses.code, p_token: H.ses.token }; }
    function withSes(extra) { var o = a(); Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }

    function refresh(force) {
      if (!H.ses) return Promise.resolve();
      return rpc('hatt_state', a()).then(function (d) {
        var changed = !H.data || force || d.version !== H.data.version;
        H.data = d; H.err = '';
        if (changed && onScreen() && !H.turn) paint();
      }, function (e) {
        if (e.code === 'nogame' || e.code === 'noplayer') {
          forget(); H.stage = 'setup'; H.note = t('hatt.gone');
          if (onScreen()) paint();
        } else if (!H.data) { H.err = errText(e); if (onScreen()) paint(); }
      });
    }
    function act(fn, extra, after) {
      if (H.busy) return;
      H.busy = true; H.err = ''; paint();
      return rpc(fn, withSes(extra)).then(function (r) {
        H.busy = false;
        if (after) after(r);
        return refresh(true);
      }, function (e) { H.busy = false; H.err = errText(e); paint(); });
    }

    // ---------- Polling (only while on this screen and not mid-turn) ----------
    var pollId = null;
    function onScreen() { return S.view.name === 'hatt'; }
    function poll(on) {
      if (on && !pollId) pollId = setInterval(function () {
        if (!onScreen() || H.stage !== 'game' || H.turn || H.busy || document.visibilityState !== 'visible') return;
        if (H.data && H.data.status === 'done') return;
        refresh(false);
      }, POLL_MS);
      if (!on && pollId) { clearInterval(pollId); pollId = null; }
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && onScreen() && H.stage === 'game' && !H.turn) refresh(false);
    });

    // Repaint without losing what's being typed in the word box.
    function paint() {
      if (!onScreen()) return;
      var f = document.activeElement, id = f && f.id;
      ep.render();
      if (id === 'hattword' || id === 'hattname' || id === 'hattcode') {
        var el = document.getElementById(id); if (el) { el.focus(); try { var n = el.value.length; el.setSelectionRange(n, n); } catch (e) {} }
      }
    }

    // ---------- Helpers ----------
    function player(id) { return ((H.data && H.data.players) || []).filter(function (p) { return p.id === id; })[0] || null; }
    function pname(id) { var p = player(id); return p ? p.name : '?'; }
    function teamName(i) { return t('hatt.team' + i); }
    function teamClass(i) { return 'h-team' + i; }
    function roundName(r) { return t('hatt.rounds.r' + r + '.name'); }
    function plural(n, one, many) { return t(n === 1 ? one : many, { n: n }); }
    function shareLink() { return location.origin + location.pathname + '?hatt=' + H.ses.code; }

    function readyBtnLabel() {
      var m = me();
      return m && m.ready ? t('hatt.notReady') : t('hatt.imReady');
    }
    function extraWords() {
      // A few ready-made words, mixed in when chosen (easy and medium only).
      var pool = [];
      ep.builtIn().forEach(function (p) {
        ['easy', 'medium'].forEach(function (l) { (p.levels[l] || []).forEach(function (w) { pool.push(w); }); });
      });
      return ep.shuffle(pool).slice(0, 10);
    }

    // ---------- The describer's turn (local) ----------
    var tid = null;
    function stopTurnTimer() { if (tid) { clearInterval(tid); tid = null; } ep.keepAwake(false); }
    function startTurn() {
      var d = H.data, s = d.state;
      var secs = s.carry || d.settings.seconds;
      H.turn = {
        round: s.round, turn: s.turn, seconds: secs, left: secs, endsAt: Date.now() + secs * 1000,
        queue: ep.shuffle(s.hat.slice()), guessed: [], skips: 0, lockUntil: Date.now() + 500, words: d.words || {}
      };
      H.confirmSkip = false;
      ep.keepAwake(true);
      tid = setInterval(function () {
        var tu = H.turn; if (!tu) return stopTurnTimer();
        var left = Math.max(0, Math.ceil((tu.endsAt - Date.now()) / 1000));
        if (left !== tu.left) {
          tu.left = left;
          var els = app.querySelectorAll('[data-htimer]');
          for (var i = 0; i < els.length; i++) els[i].textContent = ep.fmt(left);
          var bar = app.querySelector('.h-bar i');
          if (bar) bar.style.width = (100 * left / tu.seconds) + '%';
          var tm = app.querySelector('.h-time');
          if (tm) tm.classList.toggle('low', left <= 10);
          if (left <= 5 && left > 0) ep.buzz(30);
        }
        if (left <= 0) finishTurn(0);
      }, 200);
      ep.go({ name: 'hatt' });
    }
    function finishTurn(left) {
      var tu = H.turn; if (!tu) return;
      stopTurnTimer(); ep.buzz(200);
      H.turn = null;
      H.ended = { n: tu.guessed.length, empty: tu.queue.length === 0 };
      H.pending = { p_round: tu.round, p_turn: tu.turn, p_guessed: tu.guessed, p_left: left };
      sendPending();
      ep.go({ name: 'hatt' });
    }
    function sendPending() {
      if (!H.pending) return;
      var p = H.pending;
      H.busy = true; H.err = '';
      rpc('hatt_turn_done', withSes(p)).then(function () {
        H.busy = false; if (H.pending === p) H.pending = null;
        refresh(true);
      }, function (e) { H.busy = false; H.err = errText(e); paint(); });
    }

    // ---------- Views ----------
    function bar(title, backAct) {
      return '<div class="bar">' + ep.backBtn(backAct || 'home') + '<h1 class="bar-title">' + esc(title) + '</h1></div>';
    }
    function errBox() { return H.err ? '<p class="h-err" role="alert">' + esc(H.err) + '</p>' : ''; }

    function viewSetup() {
      var o = H.opts;
      var h = bar(t('games.hatt.name'));
      if (H.note) h += '<p class="h-note" role="status">' + esc(H.note) + '</p>';
      h += '<p class="help">' + esc(t('hatt.intro')) + '</p>';
      h += '<section class="group"><label class="label" for="hattname">' + esc(t('hatt.yourName')) + '</label>' +
        '<input id="hattname" class="text-input h-input" type="text" maxlength="20" autocomplete="nickname" value="' + esc(H.name) + '" placeholder="' + esc(t('hatt.namePh')) + '"></section>';
      h += '<section class="group"><h2 class="label">' + esc(t('hatt.teams')) + '</h2><div class="seg" role="group" aria-label="' + esc(t('hatt.teams')) + '">' +
        '<button type="button" data-act="hopt" data-arg="teams:scramble" aria-pressed="' + (o.teams === 'scramble') + '">' + esc(t('hatt.scramble')) + '</button>' +
        '<button type="button" data-act="hopt" data-arg="teams:choose" aria-pressed="' + (o.teams === 'choose') + '">' + esc(t('hatt.choose')) + '</button></div></section>';
      h += '<section class="group"><h2 class="label">' + esc(t('hatt.turnLength')) + '</h2>' +
        '<div class="stepper"><button type="button" class="step-btn" data-act="hopt" data-arg="secs:-15" aria-label="' + esc(t('hatt.less15')) + '"' + (o.seconds <= 15 ? ' disabled' : '') + '>' + I.minus + '</button>' +
        '<span class="step-num" aria-live="polite">' + esc(t('setup.seconds', { n: o.seconds })) + '</span>' +
        '<button type="button" class="step-btn plus" data-act="hopt" data-arg="secs:15" aria-label="' + esc(t('hatt.more15')) + '"' + (o.seconds >= 120 ? ' disabled' : '') + '>' + I.plus + '</button></div></section>';
      h += '<section class="group"><h2 class="label">' + esc(t('hatt.skips')) + '</h2><div class="seg h-seg4" role="group" aria-label="' + esc(t('hatt.skips')) + '">' +
        '<button type="button" data-act="hopt" data-arg="skips:0" aria-pressed="' + (o.skips === 0) + '">' + esc(t('hatt.unlimited')) + '</button>';
      [1, 2, 3].forEach(function (n) {
        h += '<button type="button" data-act="hopt" data-arg="skips:' + n + '" aria-pressed="' + (o.skips === n) + '">' + esc(t('hatt.maxN', { n: n })) + '</button>';
      });
      h += '</div></section>';
      h += '<section class="group"><h2 class="label">' + esc(t('hatt.roundsLabel')) + '</h2><ol class="h-rounds">';
      [1, 2, 3].forEach(function (r) { h += '<li><span class="h-rn h-r' + r + '">' + r + '</span>' + esc(roundName(r)) + '</li>'; });
      h += '</ol>' +
        '<label class="h-check"><span><span class="h-rn h-r4">4</span>' + esc(t('hatt.addSound')) + '</span>' +
        '<input type="checkbox" data-hopt="round4"' + (o.round4 ? ' checked' : '') + '></label>' +
        '<label class="h-check"><span class="h-check-text"><strong>' + esc(t('hatt.mix')) + '</strong><small>' + esc(t('hatt.mixHelp')) + '</small></span>' +
        '<input type="checkbox" data-hopt="mix"' + (o.mix ? ' checked' : '') + '></label></section>';
      h += '<div class="bottom">' + errBox() +
        '<div class="tip">' + I.users + '<p>' + esc(t('hatt.netTip')) + '</p></div>' +
        '<button type="button" class="btn btn-primary" data-act="hcreate"' + (H.busy ? ' disabled' : '') + '>' + esc(H.busy ? t('hatt.wait') : t('hatt.create')) + '</button>' +
        '<button type="button" class="btn btn-secondary" data-act="hjoinview">' + esc(t('hatt.haveCode')) + '</button></div>';
      return h;
    }

    function viewJoin() {
      var h = bar(t('hatt.joinTitle'), 'hsetupview');
      if (H.note) h += '<p class="h-note" role="status">' + esc(H.note) + '</p>';
      h += '<section class="group"><label class="label" for="hattcode">' + esc(t('hatt.code')) + '</label>' +
        '<input id="hattcode" class="text-input h-input h-codein" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" value="' + esc(H.joinCode) + '" placeholder="ABC234"></section>' +
        '<section class="group"><label class="label" for="hattname">' + esc(t('hatt.yourName')) + '</label>' +
        '<input id="hattname" class="text-input h-input" type="text" maxlength="20" autocomplete="nickname" value="' + esc(H.name) + '" placeholder="' + esc(t('hatt.namePh')) + '"></section>' +
        '<div class="bottom">' + errBox() +
        '<button type="button" class="btn btn-primary" data-act="hjoin"' + (H.busy ? ' disabled' : '') + '>' + esc(H.busy ? t('hatt.wait') : t('hatt.join')) + '</button></div>';
      return h;
    }

    function viewLobby() {
      var d = H.data, m = d.me, mine = d.myWords || [], choose = d.settings.teams === 'choose';
      var hrs = Math.max(1, Math.round((new Date(d.expiresAt) - Date.now()) / 3600000));
      var h = '<div class="bar">' + ep.backBtn('home') + '<h1 class="bar-title">' + esc(t('hatt.yourWords')) + '</h1>' +
        '<button type="button" class="chip-btn h-invite" data-act="hshare">' + esc(t('hatt.invite')) + '</button></div>';
      h += '<div class="h-codebox"><span>' + esc(t('hatt.codeIs')) + '</span><strong>' + esc(d.code) + '</strong></div>';
      if (H.note) h += '<p class="h-note" role="status">' + esc(H.note) + '</p>';
      h += '<p class="help">' + esc(t('hatt.wordsHelp')) + '</p>';
      if (mine.length < 5) {
        h += '<form class="add-row" data-form="hattword"><label class="sr-only" for="hattword">' + esc(t('hatt.newWord')) + '</label>' +
          '<input id="hattword" type="text" maxlength="40" autocomplete="off" placeholder="' + esc(t('hatt.wordPh')) + '" value="' + esc(H.draft) + '">' +
          '<button type="submit"' + (H.busy ? ' disabled' : '') + '>' + esc(t('packs.add')) + '</button></form>';
      }
      if (mine.length) {
        h += '<ul class="word-list h-mine">';
        mine.forEach(function (w, i) {
          h += '<li class="h-w' + (i % 4) + '"><span>' + esc(w.word) + '</span><button type="button" data-act="hrmword" data-arg="' + esc(w.id) + '" aria-label="' + esc(t('packs.remove', { w: w.word })) + '">' + I.x + '</button></li>';
        });
        h += '</ul>';
      }
      h += '<p class="help">' + esc(mine.length >= 5 ? t('hatt.full5') : t('hatt.countOf5', { n: mine.length })) + '</p>';

      if (choose) {
        h += '<section class="group"><h2 class="label">' + esc(t('hatt.pickTeam')) + '</h2><div class="btn-row">';
        [0, 1].forEach(function (i) {
          h += '<button type="button" class="h-teambtn ' + teamClass(i) + '" data-act="hteam" data-arg="' + i + '" aria-pressed="' + (m.team === i) + '">' + esc(teamName(i)) + '</button>';
        });
        h += '</div></section>';
      }

      var ready = d.players.filter(function (p) { return p.ready; }).length;
      h += '<section class="h-card"><div class="h-row"><strong>' + esc(t('hatt.readyLabel')) + '</strong><span class="muted">' +
        esc(t('hatt.readyCount', { r: ready, n: d.players.length })) + ' · ' + esc(plural(d.total, 'hatt.wordsOne', 'hatt.wordsMany')) + '</span></div><div class="h-people">';
      d.players.forEach(function (p) {
        var cls = p.ready ? 'h-p on' : 'h-p';
        var label = (p.ready ? '✓ ' : '') + p.name + (p.id === m.id ? ' (' + t('hatt.you') + ')' : '');
        h += '<span class="' + cls + (choose && p.team !== null ? ' ' + teamClass(p.team) : '') + '">' + esc(label) + '</span>';
      });
      h += '</div>';
      var allReady = d.players.length >= 2 && ready === d.players.length;
      h += '<p class="help">' + esc(d.players.length < 2 ? t('hatt.needTwo') : (choose && allReady ? t('hatt.needBothTeams') : t('hatt.startsWhen'))) + '</p></section>';

      var canReady = mine.length >= 3 && (!choose || m.team !== null);
      h += '<div class="bottom">' + errBox();
      if (!m.ready && !canReady) h += '<p class="center-text">' + esc(mine.length < 3 ? t('hatt.add3') : t('hatt.pickTeamFirst')) + '</p>';
      h += '<button type="button" class="btn ' + (m.ready ? 'btn-secondary' : 'btn-primary') + '" data-act="hready"' + ((!m.ready && !canReady) || H.busy ? ' disabled' : '') + '>' + esc(readyBtnLabel()) + '</button>' +
        '<p class="center-text small">' + esc(t('hatt.closesIn', { n: hrs })) + '</p>' +
        '<button type="button" class="link-danger" data-act="hleave">' + esc(t('hatt.leave')) + '</button></div>';
      return h;
    }

    function scores(highlight) {
      var s = H.data.state, h = '<div class="btn-row h-scores">';
      [0, 1].forEach(function (i) {
        h += '<div class="h-score ' + teamClass(i) + (highlight === i ? ' now' : '') + '"><span>' + esc(teamName(i)) + '</span><strong>' + s.scores[i] + '</strong></div>';
      });
      return h + '</div>';
    }
    function roundPill(r) { return '<span class="h-pill h-r' + r + '">' + esc(t('hatt.roundN', { n: r })) + '</span>'; }
    function topRow() {
      var s = H.data.state;
      return '<div class="bar center">' + ep.backBtn('home') + roundPill(s.round) + '<span class="muted small">' + esc(t('hatt.leftInHat', { n: s.hat.length })) + '</span></div>';
    }

    function viewRoundIntro() {
      var d = H.data, s = d.state, mine = s.describer === d.me.id, first = s.round === 1;
      var h = topRow();
      if (first) {
        h += '<h1 class="h-title">' + esc(t('hatt.everyoneReady')) + '</h1><div class="h-teamlist">';
        [0, 1].forEach(function (i) {
          h += '<div class="h-teamcard ' + teamClass(i) + '"><strong>' + esc(teamName(i)) + '</strong><span>' +
            esc(s.order[i].map(function (id) { return pname(id) + (id === d.me.id ? ' (' + t('hatt.you') + ')' : ''); }).join(', ')) + '</span></div>';
        });
        h += '</div>';
      } else {
        h += '<h1 class="h-title">' + esc(t('hatt.hatEmpty')) + '</h1>' + scores(-1);
      }
      h += '<div class="stage h-roundcard h-r' + s.round + '"><span class="kicker">' + esc(t('hatt.nextRound', { n: s.round })) + '</span>' +
        '<span class="stage-title">' + esc(roundName(s.round)) + '</span><span class="stage-text">' + esc(t('hatt.rounds.r' + s.round + '.rule')) + '</span></div>';
      var who = pname(s.describer);
      if (s.carry) h += '<p class="center-text">' + esc(t('hatt.carryNote', { name: who, n: s.carry })) + '</p>';
      h += '<div class="bottom" style="margin-top:0">' + errBox();
      if (mine) h += '<button type="button" class="btn btn-primary" data-act="hstart">' + esc(s.carry ? t('hatt.startCarry', { n: s.carry }) : t('hatt.startTurn')) + '</button>';
      else h += '<p class="center-text"><strong>' + esc(t('hatt.waitingFor', { name: who, team: teamName(s.team) })) + '</strong></p>' + skipLink(who);
      return h + '</div>';
    }

    function skipLink(who) {
      if (H.confirmSkip) {
        return '<div class="confirm" role="alert"><p>' + esc(t('hatt.skipAsk', { name: who })) + '</p>' +
          '<div class="btn-row"><button type="button" class="btn btn-secondary" data-act="hskipno">' + esc(t('hatt.no')) + '</button>' +
          '<button type="button" class="btn btn-primary" data-act="hskipyes">' + esc(t('hatt.yesSkip')) + '</button></div></div>';
      }
      return '<button type="button" class="link-danger h-skiplink" data-act="hskipask">' + esc(t('hatt.notHere', { name: who })) + '</button>';
    }

    function viewYourTurn() {
      var d = H.data, s = d.state;
      var h = topRow() + '<div class="stage h-yours ' + teamClass(s.team) + '"><span class="kicker">' + esc(t('hatt.yourTurn')) + '</span>' +
        '<span class="stage-title">' + esc(t('hatt.youDescribe', { team: teamName(s.team) })) + '</span>' +
        '<span class="stage-text">' + esc(t('hatt.rounds.r' + s.round + '.rule')) + '</span></div>' + scores(s.team);
      return h + '<div class="bottom" style="margin-top:0">' + errBox() +
        '<button type="button" class="btn btn-primary" data-act="hstart">' + esc(t('hatt.startSecs', { n: d.settings.seconds })) + '</button></div>';
    }

    function viewTurn() {
      var tu = H.turn, d = H.data, max = d.settings.skips;
      var w = tu.words[tu.queue[0]] || '—';
      var skipLeft = max ? max - tu.skips : -1;
      var h = '<div class="bar center"><span class="spacer"></span>' + roundPill(tu.round) + '<span class="muted small">' + esc(t('hatt.leftInHat', { n: tu.queue.length })) + '</span></div>' +
        '<div class="h-time' + (tu.left <= 10 ? ' low' : '') + '"><span data-htimer>' + ep.fmt(tu.left) + '</span><span class="h-bar"><i style="width:' + (100 * tu.left / tu.seconds) + '%"></i></span></div>' +
        '<div class="stage h-word"><span class="kicker muted">' + esc(t('hatt.rounds.r' + tu.round + '.short')) + '</span>' +
        '<span class="big-word">' + esc(w) + '</span></div>' +
        '<p class="center-text">' + esc(plural(tu.guessed.length, 'hatt.guessedOne', 'hatt.guessedMany')) + '</p>' +
        '<div class="btn-row"><button type="button" class="btn h-skip" data-act="hskipword"' + (skipLeft === 0 || tu.queue.length < 2 ? ' disabled' : '') + '>' +
        '<span>' + esc(t('hatt.skip')) + '<small>' + esc(skipLeft < 0 ? t('hatt.unlimitedLow') : t('hatt.skipsLeft', { n: skipLeft })) + '</small></span></button>' +
        '<button type="button" class="btn h-got" data-act="hgot">' + esc(t('hatt.guessed')) + '</button></div>';
      return h;
    }

    function viewTurnEnded() {
      var e = H.ended;
      var h = '<div class="stage yellow"><span class="stage-title">' + esc(e.empty ? t('hatt.hatEmpty') : t('timesUp')) + '</span>' +
        '<span class="total">' + e.n + '</span><span class="stage-text" style="font-weight:700">' + esc(plural(e.n, 'hatt.gotOne', 'hatt.gotMany')) + '</span></div>';
      h += '<div class="bottom" style="margin-top:0">' + errBox();
      if (H.pending) h += '<button type="button" class="btn btn-primary" data-act="hresend"' + (H.busy ? ' disabled' : '') + '>' + esc(H.busy ? t('hatt.saving') : t('hatt.tryAgain')) + '</button>';
      else h += '<button type="button" class="btn btn-primary" data-act="hendok">' + esc(t('hatt.ok')) + '</button>';
      return h + '</div>';
    }

    function viewWatching() {
      var d = H.data, s = d.state, mine = d.me.team === s.team, who = pname(s.describer);
      var h = topRow() + '<div class="stage h-watch ' + teamClass(s.team) + '"><span class="kicker">' + esc(t('hatt.teamTurn', { team: teamName(s.team) })) + '</span>' +
        '<span class="stage-title">' + esc(t('hatt.isDescribing', { name: who })) + '</span>' +
        '<span class="stage-text"><strong>' + esc(mine ? t('hatt.guessAloud') : t('hatt.shh')) + '</strong></span></div>' + scores(s.team);
      var nt = 1 - s.team, nextId = s.order[nt][s.next[nt] % s.order[nt].length];
      h += '<div class="h-card h-row"><span class="muted">' + esc(t('hatt.upNext')) + '</span><strong>' + esc(pname(nextId) + ' · ' + teamName(nt)) + '</strong></div>';
      if (s.last && s.last.player) h += '<p class="center-text small">' + esc(t('hatt.lastTurn', { name: pname(s.last.player), n: s.last.guessed })) + '</p>';
      else h += '<p class="center-text small">' + esc(t('hatt.updatesAfter')) + '</p>';
      return h + '<div class="bottom" style="margin-top:0">' + errBox() + skipLink(who) + '</div>';
    }

    function viewFinal() {
      var s = H.data.state, sc = s.scores, win = sc[0] === sc[1] ? -1 : (sc[0] > sc[1] ? 0 : 1);
      var h = '<p class="center-text">' + esc(t('hatt.afterN', { n: s.rounds })) + '</p>' +
        '<h1 class="h-title center">' + esc(win < 0 ? t('hatt.draw') : t('hatt.wins', { team: teamName(win) })) + '</h1>';
      [0, 1].forEach(function (i) {
        h += '<div class="h-final ' + teamClass(i) + '"><strong>' + esc(teamName(i)) + '</strong><span>' + sc[i] + '</span></div>';
      });
      h += '<div class="h-card">';
      s.roundScores.forEach(function (r, i) {
        h += '<div class="h-row h-line"><span>' + esc(t('hatt.roundN', { n: i + 1 }) + ' · ' + roundName(i + 1)) + '</span><span>' + r[0] + ' – ' + r[1] + '</span></div>';
      });
      h += '</div><div class="bottom"><p class="center-text small">' + esc(t('hatt.deleted')) + '</p>' +
        '<button type="button" class="btn btn-secondary" data-act="hnew">' + esc(t('hatt.newGame')) + '</button>' +
        '<button type="button" class="btn btn-primary" data-act="hdone">' + esc(t('hatt.backToGames')) + '</button></div>';
      return h;
    }

    function viewLoading() {
      return bar(t('games.hatt.name')) + '<div class="stage"><span class="stage-text soft">' + esc(H.err || t('hatt.loading')) + '</span></div>' +
        (H.err ? '<div class="bottom"><button type="button" class="btn btn-primary" data-act="hretry">' + esc(t('hatt.tryAgain')) + '</button>' +
          '<button type="button" class="btn btn-secondary" data-act="hforget">' + esc(t('hatt.forget')) + '</button></div>' : '');
    }

    function view() {
      poll(H.stage === 'game');
      if (H.stage === 'setup') return viewSetup();
      if (H.stage === 'join') return viewJoin();
      if (H.turn) return viewTurn();
      if (H.ended) return viewTurnEnded();
      var d = H.data;
      if (!d) return viewLoading();
      if (d.status === 'lobby') return viewLobby();
      if (d.status === 'done') return viewFinal();
      var s = d.state;
      // Start of a round: everyone sees the round card until its first turn is played.
      if (s.turn === 0) return viewRoundIntro();
      if (s.describer === d.me.id) return viewYourTurn();
      return viewWatching();
    }

    // ---------- Actions ----------
    function readName() {
      var el = document.getElementById('hattname');
      var n = ((el && el.value) || H.name || '').trim().slice(0, 20);
      H.name = n; ep.store.set('ep.hattName', n);
      return n;
    }
    function enterGame(r) {
      saveSes({ code: r.code, token: r.token, player: r.player });
      H.stage = 'game'; H.data = null; H.note = ''; H.draft = '';
      return refresh(true).then(function () { ep.go({ name: 'hatt' }); });
    }

    var actions = {
      hopen: function () {
        H.note = ''; H.err = '';
        H.stage = H.ses ? 'game' : 'setup';
        ep.go({ name: 'hatt' });
        if (H.ses) refresh(true);
      },
      hopt: function (arg) {
        var p = String(arg).split(':'), o = H.opts;
        if (p[0] === 'teams') o.teams = p[1];
        if (p[0] === 'secs') o.seconds = Math.max(15, Math.min(120, o.seconds + Number(p[1])));
        if (p[0] === 'skips') o.skips = Number(p[1]);
        readName(); paint();
      },
      hsetupview: function () { H.stage = 'setup'; H.err = ''; H.note = ''; ep.go({ name: 'hatt' }); },
      hjoinview: function () { readName(); H.stage = 'join'; H.err = ''; H.note = ''; ep.go({ name: 'hatt' }); },
      hcreate: function () {
        var n = readName();
        if (!n) { H.err = t('hatt.err.name'); paint(); var el = document.getElementById('hattname'); if (el) el.focus(); return; }
        H.busy = true; H.err = ''; paint();
        var o = H.opts;
        rpc('hatt_create', { p_lang: S.lang, p_name: n, p_extra: o.mix ? extraWords() : [],
          p_settings: { seconds: o.seconds, skips: o.skips, round4: o.round4, teams: o.teams } })
          .then(function (r) { H.busy = false; return enterGame(r); }, function (e) { H.busy = false; H.err = errText(e); paint(); });
      },
      hjoin: function () {
        var n = readName(), c = document.getElementById('hattcode');
        var code = ((c && c.value) || H.joinCode || '').trim().toUpperCase();
        H.joinCode = code;
        if (code.length !== 6) { H.err = t('hatt.err.nogame'); paint(); return; }
        if (!n) { H.err = t('hatt.err.name'); paint(); return; }
        H.busy = true; H.err = ''; paint();
        rpc('hatt_join', { p_code: code, p_name: n })
          .then(function (r) { H.busy = false; return enterGame(r); }, function (e) { H.busy = false; H.err = errText(e); paint(); });
      },
      hshare: function () {
        var url = shareLink(), text = t('hatt.shareText', { code: H.ses.code });
        if (navigator.share) { navigator.share({ title: t('games.hatt.name'), text: text, url: url }).catch(function () {}); return; }
        var done = function () { H.note = t('hatt.copied'); paint(); };
        try { navigator.clipboard.writeText(url).then(done, function () { H.note = url; paint(); }); } catch (e) { H.note = url; paint(); }
      },
      hrmword: function (id) { act('hatt_remove_word', { p_word: id }); },
      hteam: function (i) { act('hatt_set_team', { p_team: Number(i) }); },
      hready: function () { var m = me(); act('hatt_ready', { p_ready: !(m && m.ready) }); },
      hleave: function () {
        if (!H.ses) return;
        rpc('hatt_leave', a()).catch(function () {});
        forget(); H.stage = 'setup'; ep.go({ name: 'home' });
      },
      hstart: function () { if (H.data && H.data.status === 'play' && H.data.state.describer === H.data.me.id) startTurn(); },
      hgot: function () {
        var tu = H.turn; if (!tu || Date.now() < tu.lockUntil) return;
        ep.buzz(40);
        tu.guessed.push(tu.queue.shift());
        tu.lockUntil = Date.now() + 400;
        if (!tu.queue.length) { finishTurn(Math.max(0, Math.ceil((tu.endsAt - Date.now()) / 1000))); return; }
        ep.render();
      },
      hskipword: function () {
        var tu = H.turn; if (!tu || Date.now() < tu.lockUntil || tu.queue.length < 2) return;
        var max = H.data.settings.skips;
        if (max && tu.skips >= max) return;
        tu.skips++; tu.queue.push(tu.queue.shift());
        tu.lockUntil = Date.now() + 400;
        ep.render();
      },
      hresend: function () { sendPending(); paint(); },
      hendok: function () { H.ended = null; H.err = ''; ep.go({ name: 'hatt' }); refresh(true); },
      hskipask: function () { H.confirmSkip = true; paint(); },
      hskipno: function () { H.confirmSkip = false; paint(); },
      hskipyes: function () {
        var s = H.data.state; H.confirmSkip = false;
        act('hatt_skip_turn', { p_round: s.round, p_turn: s.turn });
      },
      hretry: function () { H.err = ''; paint(); refresh(true); },
      hforget: function () { forget(); H.stage = 'setup'; ep.go({ name: 'hatt' }); },
      hnew: function () { forget(); H.stage = 'setup'; ep.go({ name: 'hatt' }); },
      hdone: function () { forget(); H.stage = 'setup'; ep.go({ name: 'home' }); }
    };

    // Typing in the word box, and the two checkboxes.
    app.addEventListener('input', function (e) {
      if (e.target.id === 'hattword') H.draft = e.target.value;
      if (e.target.id === 'hattcode') H.joinCode = e.target.value.toUpperCase();
    });
    app.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-hopt');
      if (k) { H.opts[k] = !!e.target.checked; readName(); }
    });
    app.addEventListener('submit', function (e) {
      if (e.target.getAttribute('data-form') !== 'hattword') return;
      e.preventDefault();
      var w = (H.draft || '').trim();
      if (!w) return;
      H.draft = '';
      act('hatt_add_word', { p_word: w }).then(function () {
        var el = document.getElementById('hattword'); if (el) el.focus();
      });
    });

    // Opened from an invite link (?hatt=CODE).
    function boot() {
      var m = location.search.match(/[?&]hatt=([A-Za-z0-9]{6})/);
      if (!m) return false;
      var code = m[1].toUpperCase();
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      if (H.ses && H.ses.code === code) { H.stage = 'game'; ep.go({ name: 'hatt' }); refresh(true); return true; }
      H.joinCode = code; H.stage = 'join'; H.note = t('hatt.invited');
      ep.go({ name: 'hatt' });
      return true;
    }

    return { view: view, actions: actions, boot: boot };
  };
})();
