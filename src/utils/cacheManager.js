/**
 * Musicfy Smart Cache Manager
 * Gestiona la descarga y persistencia de canciones para modo offline.
 */
export const CacheManager = {
  CACHE_NAME: 'musicfy-audio-cache-v1',

  /**
   * Intenta obtener una canción del caché. Si no está, la descarga y la guarda.
   */
  async getOrCacheSong(song) {
    if (!song || !song.url) return null;
    
    // Solo cacheamos si estamos en un entorno que lo soporte (Navegador o Capacitor)
    if (!('caches' in window)) return song.url;

    const cache = await caches.open(this.CACHE_NAME);
    const cachedResponse = await cache.match(song.url);

    if (cachedResponse) {
      console.log(`[Cache] 💿 Usando versión local de: ${song.title}`);
      const blob = await cachedResponse.blob();
      return URL.createObjectURL(blob);
    }

    // Si no está en caché, iniciamos la descarga en segundo plano
    console.log(`[Cache] ⬇️ Descargando para uso futuro: ${song.title}`);
    this.cacheSong(song.url);
    
    return song.url;
  },

  /**
   * Guarda una canción en el caché de forma silenciosa.
   */
  async cacheSong(url) {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open(this.CACHE_NAME);
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        console.log(`[Cache] ✅ Canción guardada exitosamente.`);
      }
    } catch (error) {
      console.warn(`[Cache] ❌ Error al cachear:`, error);
    }
  },

  /**
   * Limpia canciones antiguas para no llenar el almacenamiento.
   */
  async cleanOldCache(maxItems = 20) {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open(this.CACHE_NAME);
      const keys = await cache.keys();
      if (keys.length > maxItems) {
        for (let i = 0; i < keys.length - maxItems; i++) {
          await cache.delete(keys[i]);
        }
      }
    } catch (error) {
       console.warn(`[Cache] Error al limpiar:`, error);
    }
  }
};
