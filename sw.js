const CACHE_NAME = 'jeux-v1';
const FILES_TO_CACHE = [
  '/jeuxdesociete.html',
  '/jeuxdesociete.js',
  '/7wonders.html',
  '/qwirkle.html',
  '/tickettoride.html',
  '/tickettoride-rs.html',
  '/flip7.html',
  '/ladamepique.html',
  '/compteurgeneral.html',
  '/style.css',
  '/version.js',
  '/theme-toggle.js',
  '/page-controls.js',
  '/sw-register.js',
];

const CACHED_PATHS = new Set(FILES_TO_CACHE);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHED_PATHS.has(url.pathname)) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(e.request);

      const networkFetch = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => null);

      // Sert le cache immédiatement si disponible, met à jour en arrière-plan
      return cached || networkFetch;
    })
  );
});
