/* Plays thousands of random Wolf in Sheep's Clothing games against the rules in wolf.js
   and checks they always end correctly. Run: node tests/wolf.test.js */
'use strict';
var L = require('../wolf.js');
var assert = require('assert');

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
var stats = { games: 0, sheep: 0, wolves: 0, saves: 0, nobodyDays: 0, maxNights: 0 };

// Rule checks on a fixed deal.
(function () {
  var G = L.newGame(['A', 'B', 'C', 'D', 'E', 'F'], { wolves: 2, shepherd: true, dog: true });
  G.roles = ['wolf', 'wolf', 'shepherd', 'dog', 'sheep', 'sheep'];
  L.startNight(G);
  assert.deepStrictEqual(L.choices(G, 0), [2, 3, 4, 5], 'wolves only pick living non-wolves');
  assert.deepStrictEqual(L.choices(G, 3), [0, 1, 2, 4, 5], 'the dog cannot sniff itself');
  assert.deepStrictEqual(L.choices(G, 2), [0, 1, 2, 3, 4, 5], 'the shepherd may protect anyone, itself included');
  assert.strictEqual(L.act(G, 0, 1), false, 'a wolf cannot pick a wolf');
  L.act(G, 0, 4); L.act(G, 1, 5); L.act(G, 2, 5);
  assert.strictEqual(L.endNight(G), -1, 'last wolf picked 5, the shepherd saved 5: nobody taken');
  assert.deepStrictEqual(G.saves, [5]);
  L.startNight(G);
  assert.strictEqual(L.choices(G, 2).indexOf(5), -1, 'not the same player two nights in a row');
  L.act(G, 0, 4); L.act(G, 1, 4); L.act(G, 2, 3);
  assert.strictEqual(L.endNight(G), 4, 'wolves take 4');
  assert.strictEqual(G.alive[4], false);
  L.sendOut(G, 0); L.sendOut(G, 1);
  assert.strictEqual(L.winner(G), 'sheep');
  var G2 = L.newGame(['A', 'B', 'C', 'D', 'E'], { wolves: 2, shepherd: false, dog: false });
  G2.roles = ['wolf', 'wolf', 'sheep', 'sheep', 'sheep'];
  assert.strictEqual(L.winner(G2), null);
  L.sendOut(G2, 2);
  assert.strictEqual(L.winner(G2), 'wolves', '2 wolves vs 2 sheep: wolves win');
  [[5, 1], [7, 1], [8, 2], [12, 3], [16, 4]].forEach(function (x) { assert.strictEqual(L.suggestWolves(x[0]), x[1]); });
  for (var n = L.MIN; n <= L.MAX; n++) assert.ok(L.maxWolves(n) < n - L.maxWolves(n), 'max wolves stay a minority at ' + n);
})();

for (var g = 0; g < 20000; g++) {
  var n = L.MIN + Math.floor(Math.random() * (L.MAX - L.MIN + 1));
  var wolves = 1 + Math.floor(Math.random() * L.maxWolves(n));
  var opts = { wolves: wolves, shepherd: Math.random() < 0.7, dog: Math.random() < 0.7 };
  var names = []; for (var i = 0; i < n; i++) names.push('P' + i);
  var G = L.newGame(names, opts);
  assert.strictEqual(G.roles.filter(function (r) { return r === 'wolf'; }).length, wolves);
  assert.strictEqual(G.roles.filter(function (r) { return r === 'shepherd'; }).length, opts.shepherd ? 1 : 0);
  assert.strictEqual(G.roles.filter(function (r) { return r === 'dog'; }).length, opts.dog ? 1 : 0);
  assert.strictEqual(L.winner(G), null, 'nobody has won before the first night');
  var win = null, rounds = 0;
  while (!win) {
    rounds++;
    assert.ok(rounds <= n * 2, 'game ends in time');
    var before = L.aliveIdx(G).length;
    L.startNight(G);
    G.nt.order.forEach(function (p) {
      assert.ok(G.alive[p], 'only living players get the phone');
      var list = L.choices(G, p);
      assert.ok(list.length > 0, 'every player has someone to tap');
      assert.ok(L.act(G, p, pick(list)));
    });
    var taken = L.endNight(G);
    if (taken < 0) stats.saves++;
    assert.strictEqual(L.aliveIdx(G).length, before - (taken >= 0 ? 1 : 0));
    if (taken >= 0) assert.notStrictEqual(G.roles[taken], 'wolf', 'wolves never take a wolf');
    win = L.winner(G);
    if (win) break;
    var v = Math.random() < 0.1 ? -1 : pick(L.aliveIdx(G));
    if (v < 0) stats.nobodyDays++;
    L.sendOut(G, v);
    win = L.winner(G);
  }
  var w = L.wolvesLeft(G), others = L.aliveIdx(G).length - w;
  if (win === 'sheep') assert.strictEqual(w, 0); else assert.ok(w >= others && w > 0);
  stats.games++; stats[win]++; stats.maxNights = Math.max(stats.maxNights, G.night);
}
console.log('OK', JSON.stringify(stats));
