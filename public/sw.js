const CACHE_NAME = 'musicfy-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png'
];

// Instalar el Service Worker y cachear recursos básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activar y limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Estrategia: Network First, falling back to Cache (solo para assets estáticos del mismo origen)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Solo interceptar peticiones del mismo origen (no APIs externas)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. NUNCA interceptar rutas de API del backend
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api')) {
    return;
  }

  // 3. Ignorar esquemas que no sean http/https
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // 4. Ignorar peticiones a servicios conocidos (por si acaso)
  if (
    event.request.url.includes('supabase') ||
    event.request.url.includes('piped') ||
    event.request.url.includes('invidious') ||
    event.request.url.includes('inv.') ||
    event.request.url.includes('cobalt') ||
    event.request.url.includes('r2') ||
    event.request.url.includes('googlevideo') ||
    event.request.url.includes('workers.dev') ||
    event.request.url.includes('youtube')
  ) {
    return;
  }

  // 5. Solo cachear assets estáticos (JS, CSS, imágenes, fuentes, HTML)
  const isStaticAsset = url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|eot|json|html)$/i)
    || url.pathname === '/'
    || event.request.mode === 'navigate';

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status === 404) {
          return caches.match(event.request).then((cached) => cached || response);
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Si es una petición de navegación (SPA), servir index.html del caché
        if (event.request.mode === 'navigate') {
          const indexCache = await caches.match('/index.html');
          if (indexCache) return indexCache;
        }

        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
