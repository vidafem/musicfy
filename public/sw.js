const CACHE_NAME = 'musicfy-v1';
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

// Estrategia: Network First, falling back to Cache
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a Supabase, APIs externas y Cloudflare R2
  if (
    event.request.url.includes('supabase') || 
    event.request.url.includes('piped') || 
    event.request.url.includes('r2')
  ) {
    return;
  }

  // Ignorar esquemas que no sean http/https (ej: extensiones de chrome)
  if (!event.request.url.startsWith('http')) {
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

        // Si es una petición de navegación (HTML/SPA) y falló la red, servir el index.html
        if (event.request.mode === 'navigate') {
          const indexCache = await caches.match('/index.html');
          if (indexCache) return indexCache;
        }

        // Fallback final: retornar una respuesta vacía o de error en vez de undefined para no romper el navegador
        return new Response('Error de conexión local', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
