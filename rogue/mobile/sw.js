// Service worker for the Rogue PWA.
//
// Strategy: cache-first with network fallback. The whole app is one
// HTML file plus this script + manifest + icon, so the install step
// can grab everything up-front and the game then runs fully offline.
//
// Bumping CACHE_VERSION on a redeploy invalidates the old cache; the
// activate handler purges any cache whose name doesn't match the
// current version.

const CACHE_VERSION = 'rogue-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  // Skip waiting so a fresh SW takes control on first install without
  // requiring a tab close. (For updates, the controlled clients still
  // see the OLD page until they reload — that's intentional, prevents
  // mid-run code swaps.)
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle same-origin GETs; pass everything else straight to the
  // network so we don't accidentally cache a third-party CDN response
  // or break a cross-origin POST.
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
