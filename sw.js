/* Offline support: after the first visit, everything is played from this cache.
   Bump VERSION whenever any file changes, so phones pick up the new one. */
var VERSION = 'party-v9';
var FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'hatt.js',
  'manifest.webmanifest',
  'copy/en.json',
  'copy/sv.json',
  'packs/en.json',
  'packs/sv.json',
  'fonts/fraunces-latin-500-normal.woff2',
  'fonts/dm-sans-latin-400-normal.woff2',
  'fonts/dm-sans-latin-500-normal.woff2',
  'fonts/dm-sans-latin-600-normal.woff2',
  'fonts/dm-sans-latin-700-normal.woff2',
  'ellenial-theme.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Cache first, then network; new copies are stored for next time.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () { return caches.match('index.html'); });
  }));
});
