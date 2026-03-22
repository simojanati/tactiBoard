const CACHE_VERSION = 'tactiboard-pwa-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pages/login.html',
  './pages/index.html',
  './assets/vendor/css/core.css',
  './assets/vendor/css/theme-default.css',
  './assets/vendor/fonts/boxicons.css',
  './assets/css/demo.css',
  './assets/css/app.css',
  './assets/js/config.js',
  './assets/js/main.js',
  './assets/js/app/config.local.js',
  './assets/i18n/fr.json',
  './assets/i18n/en.json',
  './assets/img/favicon/favicon.ico',
  './assets/img/favicon/favicon-32x32.png',
  './assets/img/favicon/apple-touch-icon.png',
  './assets/img/favicon/android-chrome-192x192.png',
  './assets/img/favicon/android-chrome-512x512.png',
  './assets/img/branding/logo-horizontal.png',
  './assets/img/branding/logo-horizontal-dark.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => ![STATIC_CACHE, RUNTIME_CACHE].includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;
  if (url.pathname.includes('/storage/v1/') || url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/')) return;

  const isNavigate = request.mode === 'navigate';
  const isDynamicAppAsset = /\/assets\/js\/app\//.test(url.pathname) || /\/assets\/i18n\//.test(url.pathname) || /\/pages\//.test(url.pathname);
  const isStaticAsset = request.destination === 'style' || request.destination === 'image' || request.destination === 'font' || /\/assets\//.test(url.pathname);

  if (isNavigate || isDynamicAppAsset) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request)) || (await caches.match('./pages/login.html')) || Response.error();
      }
    })());
    return;
  }

  if (isStaticAsset) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, fresh.clone());
      return fresh;
    })());
  }
});
