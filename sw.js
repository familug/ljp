/**
 * Service worker for JLPT Kanji Trainer PWA.
 * Caches app shell and kanji data so the app works offline and loads fast on repeat visits.
 */

const CACHE_NAME = 'jlpt-trainer-v1';
const KANJI_DATA_URL = 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json';

function baseUrl() {
  const scope = self.registration?.scope || self.location.pathname;
  const path = scope.replace(/\/sw\.js$/, '').replace(/\/?$/, '') + '/';
  return new URL(path, self.location.origin).href;
}

self.addEventListener('install', (event) => {
  const base = baseUrl();
  const precache = [
    base,
    base + 'index.html',
    base + 'styles.css',
    base + 'src/main.js'
  ].map((u) => new Request(u, { cache: 'reload' }));

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(precache)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  if (url === KANJI_DATA_URL) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  if (!url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        if (res.ok && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style' || request.destination === '')) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
