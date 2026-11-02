/**
 * Need4Led — Service Worker (v2.3 Ultimate)
 * Caching offline per Progressive Web App con supporto per GIF di sfondo esterna (no-cors)
 */

const CACHE_NAME = 'need4led-v2.3-ultimate-' + Date.now();
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/ble-manager.js',
  './js/protocols.js',
  './js/ui-controller.js',
  './manifest.json'
];

const EXTERNAL_GIF_URL = 'https://i.pinimg.com/originals/a3/50/87/a3508797091683ab55e1d0534c6ba97a.gif';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Caching asset locali applicazione
      await cache.addAll(ASSETS);

      // 2. Caching isolato in background della GIF esterna con mode: 'no-cors'
      // Se Pinterest è offline o non raggiungibile, l'installazione del SW NON fallisce
      try {
        const gifRequest = new Request(EXTERNAL_GIF_URL, { mode: 'no-cors' });
        const gifResponse = await fetch(gifRequest);
        if (gifResponse) {
          await cache.put(EXTERNAL_GIF_URL, gifResponse);
        }
      } catch (_) {
        // Ignora silenziosamente errori di rete verso host terzi
      }
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Rimozione vecchia cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Strategia Network-First con fallback a cache offline per tutti gli asset
self.addEventListener('fetch', (e) => {
  // Richiesta speciale per la GIF di sfondo animata Pinterest
  if (e.request.url.includes('a3508797091683ab55e1d0534c6ba97a.gif')) {
    e.respondWith(
      caches.match(EXTERNAL_GIF_URL).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(e.request).then((networkResponse) => {
          if (networkResponse) {
            const respClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(EXTERNAL_GIF_URL, respClone));
          }
          return networkResponse;
        }).catch(() => cachedResponse);
      })
    );
    return;
  }

  // Pagine HTML di navigazione
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(e.request) || caches.match('./index.html'))
    );
    return;
  }

  // Risorse statiche CSS, JS, icone
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(e.request))
  );
});
