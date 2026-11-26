const CACHE_NAME = 'codegame-pwa-v9';
const isValidImageResponse = (res) => {
  if (!res || res.status !== 200) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.startsWith('image/');
};
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/favicon.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass non-GET requests, all cross-origin requests, dynamic API calls, and external font providers
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    return;
  }

  // Network first for HTML page navigations with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((res) => res || caches.match('/'));
      })
    );
    return;
  }

  // Cache-First for game icons (/game_icons/*.webp) — BẮT BUỘC xác thực content-type: image/* (chống đầu độc cache bởi SPA HTML)
  if (url.pathname.startsWith('/game_icons/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cachedResponse) => {
          if (isValidImageResponse(cachedResponse)) {
            return cachedResponse;
          }
          if (cachedResponse) {
            cache.delete(event.request).catch(() => {});
          }
          return fetch(event.request).then((networkResponse) => {
            if (isValidImageResponse(networkResponse)) {
              cache.put(event.request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          }).catch(() => Response.error());
        })
      )
    );
    return;
  }

  // Stale-while-revalidate for static assets (images, icons, fonts, css, js)
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/i)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => null);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(fetch(event.request));
});
