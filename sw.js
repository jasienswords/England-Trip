/* Service worker — caches the whole itinerary for full offline use.
   The itinerary HTML already has every image and font baked in, so
   caching these few files is enough to run with no internet at all.

   SINGLE-VERSION POLICY: bump CACHE on every deploy. On activate the SW
   deletes EVERY other cache it can see, so exactly one version ever
   survives — no stale or half-written (corrupt) copies can linger. */
const CACHE = 'england-trip-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // Delete every cache that is not the current one — wipes all prior
      // versions (and any corrupt leftovers) so only v1 remains.
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting SW to take over immediately.
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Network-first for the itinerary page itself, so edits pushed to GitHub
  // always show the latest when online — falling back to cache when offline.
  const isDoc = e.request.mode === 'navigate' ||
    (e.request.destination === 'document') ||
    /\/(index\.html)?$/.test(new URL(e.request.url).pathname);

  if (isDoc) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return resp;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest) — they rarely change.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
