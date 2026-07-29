const CACHE_NAME = 'musicfy-v5-force-reload';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png'
];

// Instalar el Service Worker y omitir la espera inmediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activar y reclamar clientes inmediatamente borrando cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network First para todas las peticiones JS/CSS para asegurar actualizaciones en tiempo real
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api')) return;
  if (!event.request.url.startsWith('http')) return;

  if (
    event.request.url.includes('supabase') ||
    event.request.url.includes('piped') ||
    event.request.url.includes('invidious') ||
    event.request.url.includes('inv.') ||
    event.request.url.includes('googlevideo') ||
    event.request.url.includes('youtube')
  ) {
    return;
  }

  // Network first con fallback a cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        if (event.request.mode === 'navigate') {
          const indexCache = await caches.match('/index.html');
          if (indexCache) return indexCache;
        }

        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
