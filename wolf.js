/* Wolf in Sheep's Clothing (Varg i fårakläder) — Mafia/Werewolf for one phone, passed around.
   Works offline: nothing is sent anywhere and names are forgotten when you leave the game.
   No narrator: at night the phone goes to everyone in turn. Wolves pick a sheep, the Shepherd
   protects someone, the Sheepdog sniffs someone, and plain sheep tap a name too, so nobody can
   tell who's who by how long they hold the phone. Gentle wording: sheep are "taken" at night and
   "sent out of the meadow" by day; players who are out stay and watch. */
(function () {
  'use strict';

  // ---------- Game rules (no screen code, so they can be tested on their own) ----------
  var L = {
    MIN: 5, MAX: 16,
    suggestWolves: function (n) { return Math.max(1, Math.floor(n / 4)); },
    maxWolves: function (n) { return Math.max(1, Math.floor((n - 1) / 2)); },
    deal: function (n, wolves, shepherd, dog, rnd) {
      rnd = rnd || Math.random;
      var roles = [], i;
      for (i = 0; i < wolves; i++) roles.push('wolf');
      if (shepherd) roles.push('shepherd');
      if (dog) roles.push('dog');
      while (roles.length < n) roles.push('sheep');
      for (i = roles.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var x = roles[i]; roles[i] = roles[j]; roles[j] = x; }
      return roles;
    },
    newGame: function (names, opts, rnd) {
      var n = names.length;
      return {
        names: names.slice(),
        roles: L.deal(n, opts.wolves, opts.shepherd, opts.dog, rnd),
        alive: names.map(function () { return true; }),
        out: names.map(function () { return null; }), // { how: 'taken'|'sent', when: number }
        night: 0, day: 0,
        lastSaved: -1,     // the Shepherd can't protect the same player two nights in a row
        saves: [],         // names the Shepherd actually saved, for the end screen
        nt: null           // the night in progress
      };
    },
    aliveIdx: function (G) { var a = []; G.alive.forEach(function (x, i) { if (x) a.push(i); }); return a; },
    wolvesLeft: function (G) { return L.aliveIdx(G).filter(function (i) { return G.roles[i] === 'wolf'; }).length; },
    winner: function (G) {
      var w = L.wolvesLeft(G), others = L.aliveIdx(G).length - w;
      if (w === 0) return 'sheep';
      if (w >= others) return 'wolves';
      return null;
    },
    startNight: function (G) {
      G.night++;
      G.nt = { order: L.aliveIdx(G), i: 0, picks: [], target: -1, save: -1, sniff: -1 };
    },
    // Who a player may tap tonight. Wolves: any living non-wolf. Shepherd: anyone living but last
    // night's choice. Sheepdog: anyone living but themselves. Sheep: anyone living but themselves.
    choices: function (G, p) {
      var role = G.roles[p];
      return L.aliveIdx(G).filter(function (i) {
        if (role === 'wolf') return G.roles[i] !== 'wolf';
        if (role === 'shepherd') return i !== G.lastSaved;
        return i !== p;
      });
    },
    // A player's tap at night. The last wolf's pick counts.
    act: function (G, p, target) {
      var role = G.roles[p], nt = G.nt;
      if (L.choices(G, p).indexOf(target) < 0) return false;
      if (role === 'wolf') { nt.picks.push({ by: p, target: target }); nt.target = target; }
      else if (role === 'shepherd') nt.save = target;
      else if (role === 'dog') nt.sniff = target;
      return true;
    },
    // Morning: returns the player taken, or -1 if the Shepherd got there first.
    endNight: function (G) {
      var nt = G.nt, taken = -1;
      if (nt.save >= 0) G.lastSaved = nt.save; else G.lastSaved = -1;
      if (nt.target >= 0 && nt.target !== nt.save) {
        taken = nt.target; G.alive[taken] = false; G.out[taken] = { how: 'taken', when: G.night };
      } else if (nt.target >= 0) {
        G.saves.push(nt.target);
      }
      G.day = G.night;
      G.nt = null;
      return taken;
    },
    sendOut: function (G, p) {
      if (p >= 0 && G.alive[p]) { G.alive[p] = false; G.out[p] = { how: 'sent', when: G.day }; }
    }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = L; return; }

  // ---------- Screens ----------
  window.EPWolf = function (ep) {
    var S = ep.S, t = ep.t, esc = ep.esc, I = ep.I;

    var W = S.wolf = {
      names: [], draft: '', wolves: null, shepherd: true, dog: true, talk: 3, err: '',
      G: null,
      stage: 'setup',     // setup | deal | dealt | night | morning | vote | reveal | end
      i: 0, open: false,  // deal: whose turn; open = role showing
      pick: -1,           // night / vote: what's tapped on this screen
      sniffShown: false,  // night: the Sheepdog has seen the answer
      taken: -1,          // morning: who was taken (-1 = nobody)
      sent: -1,           // reveal: who was sent out (-1 = nobody)
      win: null, quit: false, endNote: '',
      left: 0, timer: null
    };

    function wolves() {
      var n = Math.max(W.names.length, L.MIN), mx = L.maxWolves(n);
      var w = W.wolves === null ? L.suggestWolves(n) : W.wolves;
      return Math.max(1, Math.min(w, mx));
    }
    function nm(i) { return W.G.names[i]; }
    function roleName(r) { return t('wolf.roles.' + r); }
    // Ellen's own drawings (art/*.webp). Always next to text that says the same, so they're decorative.
    function art(name, cls) { return '<img class="w-art ' + cls + '" src="art/' + name + '.webp" alt="" aria-hidden="true" decoding="async">'; }
    // Before a role is shown everyone sees the same plain fleece (the sheep's outline), so a glimpse gives nothing away.
    var FLEECE = '<span class="w-fleece" aria-hidden="true"></span>';

    // ---------- Day timer ----------
    function stopTimer() { if (W.timer) { clearInterval(W.timer); W.timer = null; } }
    function startTimer() {
      stopTimer();
      W.left = W.talk * 60;
      W.timer = setInterval(function () {
        if (S.view.name !== 'wolf' || W.stage !== 'morning') { stopTimer(); return; }
        W.left = Math.max(0, W.left - 1);
        if (W.left === 0) { stopTimer(); ep.buzz(200); ep.render(); return; }
        paintTimer();
      }, 1000);
    }
    function paintTimer() {
      var el = ep.app.querySelector('[data-wtimer]'), bar = ep.app.querySelector('[data-wbar]');
      if (el) el.textContent = ep.fmt(W.left);
      if (bar) bar.style.width = Math.round(100 * W.left / (W.talk * 60)) + '%';
    }

    // ---------- Views ----------
    function bar(title) {
      return '<div class="bar center">' + ep.backBtn(W.stage === 'setup' ? 'home' : 'wquit') +
        '<span class="bar-title">' + esc(title || t('games.wolf.name')) + '</span><span class="spacer"></span></div>';
    }
    function quitBox() {
      return '<div class="confirm" role="alert"><p>' + esc(t('wolf.quitAsk')) + '</p>' +
        '<div class="btn-row"><button type="button" class="btn btn-secondary" data-act="wquitno">' + esc(t('wolf.quitNo')) + '</button>' +
        '<button type="button" class="btn btn-primary" data-act="wquityes">' + esc(t('wolf.quitYes')) + '</button></div></div>';
    }
    function dots(n, i) {
      var h = '<div class="dots" aria-hidden="true">';
      for (var d = 0; d < n; d++) h += '<span class="dot' + (d < i ? ' done' : d === i ? ' now' : '') + '"></span>';
      return h + '</div>';
    }
    function phase(night) {
      return '<span class="pill w-phase">' + (night ? I.moon : I.sun) +
        esc(night ? t('wolf.nightN', { n: W.G.night }) : t('wolf.dayN', { n: W.G.day })) + '</span>';
    }

    function viewSetup() {
      var n = W.names.length, w = wolves(), mx = L.maxWolves(Math.max(n, L.MIN));
      var h = '<div class="bar">' + ep.backBtn('home') + '<h1 class="bar-title">' + esc(t('games.wolf.name')) + '</h1></div>' +
        art('flock', 'w-flock') + '<p class="help w-intro">' + esc(t('wolf.intro')) + '</p>';

      h += '<section class="group"><div class="w-row"><h2 class="label">' + esc(t('wolf.players')) + '</h2>' +
        '<span class="help">' + esc(t('wolf.playersCount', { n: n, min: L.MIN })) + '</span></div>';
      if (n) {
        h += '<ul class="w-names">';
        W.names.forEach(function (name, i) {
          h += '<li><span>' + esc(name) + '</span><button type="button" data-act="wrm" data-arg="' + i + '" aria-label="' + esc(t('wolf.remove', { name: name })) + '">' + I.x + '</button></li>';
        });
        h += '</ul>';
      }
      if (n < L.MAX) {
        h += '<form class="add-row" data-form="wolfname"><input id="wolfname" class="text-input" type="text" maxlength="16" autocomplete="off" enterkeyhint="done" aria-label="' + esc(t('wolf.addPlayer')) + '" placeholder="' + esc(t('wolf.addPlayer')) + '" value="' + esc(W.draft) + '">' +
          '<button type="submit" class="step-btn plus" aria-label="' + esc(t('wolf.add')) + '">' + I.plus + '</button></form>';
      }
      if (W.err) h += '<p class="h-err" role="alert">' + esc(W.err) + '</p>';
      h += '<p class="help">' + esc(t('wolf.namesHelp')) + '</p></section>';

      h += '<section class="group"><h2 class="label">' + esc(t('wolf.wolves')) + '</h2>' +
        '<div class="stepper"><button type="button" class="step-btn" data-act="wwolves" data-arg="-1" aria-label="' + esc(t('wolf.fewerWolves')) + '"' + (w <= 1 ? ' disabled' : '') + '>' + I.minus + '</button>' +
        '<span class="step-num" aria-live="polite">' + w + '</span>' +
        '<button type="button" class="step-btn plus" data-act="wwolves" data-arg="1" aria-label="' + esc(t('wolf.moreWolves')) + '"' + (w >= mx ? ' disabled' : '') + '>' + I.plus + '</button></div>' +
        '<p class="help">' + esc(n >= L.MIN ? t('wolf.suggested', { w: L.suggestWolves(n), n: n }) : t('wolf.suggestedLater')) + '</p></section>';

      h += '<section class="group"><h2 class="label">' + esc(t('wolf.extras')) + '</h2>' +
        '<label class="h-check"><span class="h-check-text"><strong>' + esc(t('wolf.roles.shepherd')) + '</strong><small>' + esc(t('wolf.shepherdHelp')) + '</small></span>' +
        '<input type="checkbox" data-wopt="shepherd"' + (W.shepherd ? ' checked' : '') + '></label>' +
        '<label class="h-check"><span class="h-check-text"><strong>' + esc(t('wolf.roles.dog')) + '</strong><small>' + esc(t('wolf.dogHelp')) + '</small></span>' +
        '<input type="checkbox" data-wopt="dog"' + (W.dog ? ' checked' : '') + '></label></section>';

      h += '<section class="group"><h2 class="label">' + esc(t('wolf.talk')) + '</h2>' +
        '<div class="stepper"><button type="button" class="step-btn" data-act="wtalk" data-arg="-1" aria-label="' + esc(t('wolf.lessTalk')) + '"' + (W.talk <= 1 ? ' disabled' : '') + '>' + I.minus + '</button>' +
        '<span class="step-num w-min" aria-live="polite">' + esc(t('wolf.minutes', { n: W.talk })) + '</span>' +
        '<button type="button" class="step-btn plus" data-act="wtalk" data-arg="1" aria-label="' + esc(t('wolf.moreTalk')) + '"' + (W.talk >= 10 ? ' disabled' : '') + '>' + I.plus + '</button></div>' +
        '<p class="help">' + esc(t('wolf.talkHelp')) + '</p></section>';

      var ok = n >= L.MIN;
      h += '<div class="bottom">';
      if (!ok) h += '<p class="center-text">' + esc(t('wolf.needMore', { n: L.MIN - n })) + '</p>';
      h += '<button type="button" class="btn btn-primary" data-act="wstart"' + (ok ? '' : ' disabled') + '>' + esc(t('wolf.handOut')) + '</button></div>';
      return h;
    }

    function roleCard(p) {
      var G = W.G, r = G.roles[p];
      var h = '<div class="stage w-role" aria-live="polite">' + art(r, 'w-lg') + '<span class="stage-text">' + esc(t('wolf.youAre', { name: nm(p) })) + '</span>' +
        '<span class="big-word">' + esc(roleName(r)) + '</span>';
      if (r === 'wolf') {
        var pack = G.roles.map(function (x, i) { return x === 'wolf' && i !== p ? nm(i) : null; }).filter(Boolean);
        h += '<span class="pill w-pack">' + esc(pack.length ? t('wolf.pack', { names: pack.join(', ') }) : t('wolf.lone')) + '</span>';
      }
      return h + '<span class="stage-text">' + esc(t('wolf.how.' + r)) + '</span></div>';
    }

    function viewDeal() {
      var G = W.G, n = G.names.length;
      var h = bar() + '<div class="progress"><p>' + esc(t('wolf.dealing', { i: W.i + 1, n: n })) + '</p>' + dots(n, W.i) + '</div>';
      if (!W.open) {
        h += '<button type="button" class="stage" data-act="wpeek">' + FLEECE +
          '<span class="stage-text soft">' + esc(t('wolf.passTo')) + '</span>' +
          '<span class="big-word">' + esc(nm(W.i)) + '</span>' +
          '<span class="stage-text soft">' + esc(t('wolf.onlyLooks', { name: nm(W.i) })) + '</span>' +
          '<span class="stage-title w-tap">' + esc(t('wolf.tapRole', { name: nm(W.i) })) + '</span></button>';
      } else {
        h += roleCard(W.i) + '<button type="button" class="btn btn-primary" data-act="whide">' + esc(W.i === n - 1 ? t('wolf.hideLast') : t('wolf.hidePass')) + '</button>';
      }
      return h;
    }

    function viewDealt() {
      return bar() + '<div class="stage">' + I.moonBig +
        '<span class="stage-title">' + esc(t('wolf.allDealt')) + '</span>' +
        '<span class="stage-text soft">' + esc(t('wolf.nightHow')) + '</span></div>' +
        '<button type="button" class="btn btn-primary" data-act="wnight">' + esc(t('wolf.nightFalls')) + '</button>';
    }

    function pickList(list, act, sel, extra) {
      var h = '<div class="w-picks">';
      list.forEach(function (i) {
        var note = extra ? extra(i) : '';
        h += '<button type="button" class="w-pick" data-act="' + act + '" data-arg="' + i + '" aria-pressed="' + (sel === i) + '">' +
          '<span>' + esc(nm(i)) + '</span>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</button>';
      });
      return h + '</div>';
    }

    function viewNight() {
      var G = W.G, nt = G.nt, p = nt.order[nt.i], r = G.roles[p], last = nt.i === nt.order.length - 1;
      var h = bar() + '<div class="w-top">' + phase(true) + '<span class="help">' + esc(t('wolf.turnOf', { i: nt.i + 1, n: nt.order.length })) + '</span></div>';
      if (!W.open) {
        h += '<button type="button" class="stage" data-act="wpeek">' + FLEECE +
          '<span class="stage-text soft">' + esc(t('wolf.passTo')) + '</span>' +
          '<span class="big-word">' + esc(nm(p)) + '</span>' +
          '<span class="stage-text soft">' + esc(t('wolf.nightLook', { name: nm(p) })) + '</span>' +
          '<span class="stage-title w-tap">' + esc(t('wolf.tapNight', { name: nm(p) })) + '</span></button>';
        return h;
      }
      var list = L.choices(G, p), done = W.pick >= 0, head = art(r, 'w-sm');
      if (r === 'wolf') {
        var before = nt.picks.filter(function (x) { return x.by !== p; });
        var lastPick = before.length ? before[before.length - 1] : null;
        h += '<div class="w-ask">' + head + '<h1 class="h-title">' + esc(t('wolf.wolfAsk')) + '</h1><p class="help">' +
          esc(lastPick ? t('wolf.wolfPicked', { name: nm(lastPick.by), target: nm(lastPick.target) }) : t('wolf.wolfFirst')) + '</p></div>' +
          pickList(list, 'wpick', W.pick, function (i) { return lastPick && lastPick.target === i ? t('wolf.theirPick', { name: nm(lastPick.by) }) : ''; });
      } else if (r === 'shepherd') {
        h += '<div class="w-ask">' + head + '<h1 class="h-title">' + esc(t('wolf.shepAsk')) + '</h1><p class="help">' +
          esc(G.lastSaved >= 0 && G.alive[G.lastSaved] ? t('wolf.shepNotAgain', { name: nm(G.lastSaved) }) : t('wolf.shepHelp')) + '</p></div>' +
          pickList(list, 'wpick', W.pick, function (i) { return i === p ? t('wolf.yourself') : ''; });
      } else if (r === 'dog') {
        if (W.sniffShown) {
          var isWolf = G.roles[W.pick] === 'wolf';
          h += '<div class="stage night w-sniff" aria-live="polite">' + art(isWolf ? 'wolf' : 'sheep', 'w-lg') + '<span class="stage-text">' + esc(t('wolf.sniffed', { name: nm(W.pick) })) + '</span>' +
            '<span class="big-word">' + esc(isWolf ? t('wolf.isWolf') : t('wolf.notWolf')) + '</span>' +
            '<span class="stage-text">' + esc(t('wolf.sniffKeep')) + '</span></div>';
        } else {
          h += '<div class="w-ask">' + head + '<h1 class="h-title">' + esc(t('wolf.dogAsk')) + '</h1><p class="help">' + esc(t('wolf.dogHelp2')) + '</p></div>' +
            pickList(list, 'wpick', W.pick);
        }
      } else {
        h += '<div class="w-ask">' + head + '<h1 class="h-title">' + esc(t('wolf.sheepAsk')) + '</h1><p class="help">' + esc(t('wolf.sheepHelp')) + '</p></div>' +
          pickList(list, 'wpick', W.pick);
      }
      h += '<div class="bottom">';
      if (r === 'dog' && !W.sniffShown) {
        h += '<button type="button" class="btn btn-primary" data-act="wsniff"' + (done ? '' : ' disabled') + '>' + esc(t('wolf.sniffGo')) + '</button>';
      } else {
        var next = last ? t('wolf.toMorning') : t('wolf.donePass', { name: nm(nt.order[nt.i + 1]) });
        h += '<p class="center-text small">' + esc(t('wolf.everyoneTaps')) + '</p>' +
          '<button type="button" class="btn btn-primary" data-act="wnext"' + (done ? '' : ' disabled') + '>' + esc(next) + '</button>';
      }
      return h + '</div>';
    }

    function counts() {
      var G = W.G;
      return '<div class="btn-row w-counts"><div class="w-count"><strong>' + L.aliveIdx(G).length + '</strong><span>' + esc(t('wolf.inMeadow')) + '</span></div>' +
        '<div class="w-count"><strong>' + L.wolvesLeft(G) + '</strong><span>' + esc(t('wolf.wolvesAmong')) + '</span></div></div>';
    }

    function viewMorning() {
      var h = bar() + '<div class="w-top">' + phase(false) + '<span class="help">' + esc(t('wolf.phoneMiddle')) + '</span></div>' +
        '<h1 class="h-title">' + esc(t('wolf.goodMorning')) + '</h1>';
      if (W.taken >= 0) {
        h += '<div class="h-card w-news" aria-live="polite"><strong>' + esc(t('wolf.wasTaken', { name: nm(W.taken) })) + '</strong>' +
          '<span class="muted">' + esc(t('wolf.stayWatch', { name: nm(W.taken) })) + '</span></div>';
      } else {
        h += '<div class="h-card w-news" aria-live="polite"><strong>' + esc(t('wolf.nobodyTaken')) + '</strong>' +
          '<span class="muted">' + esc(t('wolf.shepherdWatched')) + '</span></div>';
      }
      var low = W.left === 0;
      h += '<div class="h-time w-time' + (low ? ' w-up' : '') + '"><span class="muted">' + esc(low ? t('wolf.timeUp') : t('wolf.talkNow')) + '</span>' +
        '<span data-wtimer>' + ep.fmt(W.left) + '</span><span class="h-bar"><i data-wbar style="width:' + Math.round(100 * W.left / (W.talk * 60)) + '%"></i></span></div>';
      return h + counts() + '<div class="bottom"><button type="button" class="btn btn-primary" data-act="wvote">' + esc(t('wolf.readyDecide')) + '</button></div>';
    }

    function viewVote() {
      var G = W.G;
      var h = bar() + '<div class="w-top">' + phase(false) + '<span class="help">' + esc(t('wolf.leftN', { n: L.aliveIdx(G).length })) + '</span></div>' +
        '<div class="w-ask"><h1 class="h-title">' + esc(t('wolf.voteAsk')) + '</h1><p class="help">' + esc(t('wolf.voteHow')) + '</p></div>' +
        '<div class="w-picks w-grid">';
      L.aliveIdx(G).forEach(function (i) {
        h += '<button type="button" class="w-pick" data-act="wvpick" data-arg="' + i + '" aria-pressed="' + (W.pick === i) + '"><span>' + esc(nm(i)) + '</span></button>';
      });
      h += '<button type="button" class="w-pick w-nobody" data-act="wvpick" data-arg="-2" aria-pressed="' + (W.pick === -2) + '"><span>' + esc(t('wolf.nobody')) + '</span></button></div>';
      var label = W.pick >= 0 ? t('wolf.sendOut', { name: nm(W.pick) }) : W.pick === -2 ? t('wolf.nobodyGo') : t('wolf.pickFirst');
      return h + '<div class="bottom"><p class="center-text small">' + esc(t('wolf.tie')) + '</p>' +
        '<button type="button" class="btn btn-primary" data-act="wsend"' + (W.pick === -1 ? ' disabled' : '') + '>' + esc(label) + '</button></div>';
    }

    function viewReveal() {
      var G = W.G, h = bar();
      if (W.sent >= 0) {
        var r = G.roles[W.sent];
        h += '<div class="stage ' + (r === 'wolf' ? 'night' : 'yellow') + '" aria-live="polite">' + art(r, 'w-lg') + '<span class="stage-text">' + esc(t('wolf.sentWas', { name: nm(W.sent) })) + '</span>' +
          '<span class="big-word">' + esc(roleName(r)) + '</span>' +
          '<span class="stage-text">' + esc(r === 'wolf' ? t('wolf.foundOne') : t('wolf.wasInnocent')) + '</span></div>';
      } else {
        h += '<div class="stage"><span class="stage-title">' + esc(t('wolf.nobodySent')) + '</span><span class="stage-text soft">' + esc(t('wolf.nobodySentHelp')) + '</span></div>';
      }
      return h + counts() + '<button type="button" class="btn btn-primary" data-act="wafter">' + esc(W.win ? t('wolf.seeEnd') : t('wolf.nightFalls')) + '</button>';
    }

    function viewEnd() {
      var G = W.G, sheep = W.win === 'sheep';
      if (!W.roles) {
        return '<div class="w-end">' + art(sheep ? 'sheep-win' : 'wolves-win', 'w-hero') + '<h1 class="h-title w-win">' + esc(sheep ? t('wolf.sheepWin') : t('wolf.wolvesWin')) + '</h1>' +
          (W.endNote ? '<p class="w-note">' + esc(W.endNote) + '</p>' : '') +
          '<p class="help">' + esc(sheep ? t('wolf.sheepWinHow', { n: G.day }) : t('wolf.wolvesWinHow')) + '</p></div>' +
          '<div class="bottom"><button type="button" class="btn btn-primary" data-act="wroles">' + esc(t('wolf.seeWho')) + '</button></div>';
      }
      var h = '<div class="w-end"><h1 class="h-title w-win">' + esc(sheep ? t('wolf.sheepWin') : t('wolf.wolvesWin')) + '</h1>' +
        (W.endNote ? '<p class="w-note">' + esc(W.endNote) + '</p>' : '') +
        '<p class="help">' + esc(sheep ? t('wolf.sheepWinHow', { n: G.day }) : t('wolf.wolvesWinHow')) + '</p></div>' +
        '<section class="h-card"><h2 class="label">' + esc(t('wolf.whoWasWho')) + '</h2><ul class="w-roles">';
      var order = ['wolf', 'shepherd', 'dog', 'sheep'];
      order.forEach(function (role) {
        G.roles.forEach(function (r, i) {
          if (r !== role) return;
          var o = G.out[i], status = o ? t(o.how === 'taken' ? 'wolf.takenNight' : 'wolf.sentDay', { n: o.when }) : t('wolf.stillIn');
          if (r === 'shepherd' && G.saves.length) status += ' · ' + t('wolf.saved', { names: G.saves.map(nm).join(', ') });
          h += '<li>' + art(r, 'w-xs') + '<span class="w-who"><strong>' + esc(nm(i)) + '</strong><small>' + esc(status) + '</small></span>' +
            '<span class="w-rp w-rp-' + r + '">' + esc(roleName(r)) + '</span></li>';
        });
      });
      h += '</ul></section><div class="bottom">' +
        '<button type="button" class="btn btn-primary" data-act="wagain">' + esc(t('wolf.again')) + '</button>' +
        '<button type="button" class="btn btn-secondary" data-act="wnewp">' + esc(t('wolf.newPlayers')) + '</button></div>';
      return h;
    }

    function view() {
      var night = W.stage === 'night' || W.stage === 'dealt';
      document.documentElement.classList.toggle('wolf-night', night);
      if (W.quit && W.stage !== 'setup') return bar() + quitBox();
      if (W.stage === 'deal') return viewDeal();
      if (W.stage === 'dealt') return viewDealt();
      if (W.stage === 'night') return viewNight();
      if (W.stage === 'morning') return viewMorning();
      if (W.stage === 'vote') return viewVote();
      if (W.stage === 'reveal') return viewReveal();
      if (W.stage === 'end') return viewEnd();
      return viewSetup();
    }

    // ---------- Flow ----------
    function show(stage) {
      W.stage = stage; W.open = false; W.pick = -1; W.sniffShown = false; W.quit = false; W.roles = false;
      ep.keepAwake(stage !== 'setup' && stage !== 'end');
      ep.go({ name: 'wolf' });
    }
    function deal() {
      W.G = L.newGame(W.names, { wolves: wolves(), shepherd: W.shepherd, dog: W.dog });
      W.i = 0; W.win = null; show('deal');
    }
    function night() { L.startNight(W.G); show('night'); }
    function addName() {
      var v = (W.draft || '').trim().replace(/\s+/g, ' ');
      W.err = '';
      if (!v) return;
      if (W.names.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) { W.err = t('wolf.taken', { name: v }); ep.render(); return; }
      if (W.names.length >= L.MAX) return;
      W.names.push(v); W.draft = ''; ep.render();
      var el = document.getElementById('wolfname'); if (el) el.focus();
    }

    var actions = {
      wopen: function () { stopTimer(); W.stage = 'setup'; W.quit = false; W.err = ''; ep.go({ name: 'wolf' }); },
      wrm: function (i) { W.names.splice(Number(i), 1); W.err = ''; ep.render(); },
      wwolves: function (d) {
        var n = W.names.length, mx = L.maxWolves(Math.max(n, L.MIN));
        W.wolves = Math.max(1, Math.min(mx, wolves() + Number(d))); ep.render();
      },
      wtalk: function (d) { W.talk = Math.max(1, Math.min(10, W.talk + Number(d))); ep.render(); },
      wstart: function () { if (W.names.length >= L.MIN) deal(); },
      wpeek: function () { W.open = true; ep.render(); },
      whide: function () {
        W.open = false;
        if (W.i < W.G.names.length - 1) { W.i++; ep.go({ name: 'wolf' }); } else show('dealt');
      },
      wnight: night,
      wpick: function (i) { if (W.sniffShown) return; W.pick = Number(i); ep.render(); },
      wsniff: function () { if (W.pick >= 0) { W.sniffShown = true; ep.render(); } },
      wnext: function () {
        var G = W.G, nt = G.nt; if (W.pick < 0) return;
        L.act(G, nt.order[nt.i], W.pick);
        W.open = false; W.pick = -1; W.sniffShown = false;
        if (nt.i < nt.order.length - 1) { nt.i++; ep.go({ name: 'wolf' }); return; }
        W.taken = L.endNight(G);
        W.win = L.winner(G);
        W.endNote = W.taken >= 0 ? t('wolf.wasTaken', { name: nm(W.taken) }) : '';
        if (W.win) { show('end'); return; }
        startTimer(); show('morning');
      },
      wvote: function () { stopTimer(); show('vote'); },
      wvpick: function (i) { W.pick = Number(i); ep.render(); },
      wsend: function () {
        if (W.pick === -1) return;
        W.sent = W.pick >= 0 ? W.pick : -1; W.endNote = '';
        L.sendOut(W.G, W.sent);
        W.win = L.winner(W.G);
        show('reveal');
      },
      wafter: function () { if (W.win) show('end'); else night(); },
      wroles: function () { W.roles = true; ep.render(); window.scrollTo(0, 0); },
      wagain: function () { deal(); },
      wnewp: function () { W.G = null; show('setup'); },
      wquit: function () { W.quit = true; ep.render(); },
      wquitno: function () { W.quit = false; ep.render(); },
      wquityes: function () { stopTimer(); ep.keepAwake(false); W.G = null; W.quit = false; W.stage = 'setup'; ep.go({ name: 'home' }); }
    };

    ep.app.addEventListener('input', function (e) { if (e.target.id === 'wolfname') { W.draft = e.target.value; if (W.err) { W.err = ''; } } });
    ep.app.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-wopt');
      if (k) { W[k] = !!e.target.checked; }
    });
    ep.app.addEventListener('submit', function (e) {
      if (e.target.getAttribute('data-form') !== 'wolfname') return;
      e.preventDefault(); addName();
    });

    return { view: view, actions: actions, stop: function () { stopTimer(); document.documentElement.classList.remove('wolf-night'); } };
  };
})();
