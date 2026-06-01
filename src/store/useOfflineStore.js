import { create } from 'zustand';

// Nombre del caché utilizado en el CacheManager existente
const CACHE_NAME = 'musicfy-audio-cache-v1';

export const useOfflineStore = create((set, get) => {
  // Inicialización de IDs y metadatos descargados
  const getInitialDownloadedIds = () => {
    try {
      const stored = localStorage.getItem('musicfy_downloaded_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const getInitialMetadata = () => {
    try {
      const stored = localStorage.getItem('musicfy_offline_metadata');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const getInitialOfflineMode = () => {
    try {
      const stored = localStorage.getItem('musicfy_offline_mode');
      return stored ? JSON.parse(stored) === 'true' : false;
    } catch {
      return false;
    }
  };

  return {
    isOfflineMode: getInitialOfflineMode(),
    isNetworkOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    downloadedIds: getInitialDownloadedIds(),
    downloadedMetadata: getInitialMetadata(),
    downloadProgress: {}, // Map de { [songId]: progressPercentage }
    activeDownloads: new Set(), // IDs de canciones que se están descargando

    setOfflineMode: (value) => {
      localStorage.setItem('musicfy_offline_mode', String(value));
      set({ isOfflineMode: value });
    },

    setNetworkOnline: (value) => {
      set({ isNetworkOnline: value });
    },

    // Sincronizar descargas físicas reales con el store
    syncDownloadedSongs: async () => {
      if (!('caches' in window)) return;
      try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        const urls = keys.map(k => k.url);
        
        // Filtramos metadatos huérfanos que ya no estén en caché
        const currentMeta = get().downloadedMetadata;
        const validMeta = currentMeta.filter(song => urls.includes(song.url));
        const validIds = validMeta.map(song => song.id);

        localStorage.setItem('musicfy_downloaded_ids', JSON.stringify(validIds));
        localStorage.setItem('musicfy_offline_metadata', JSON.stringify(validMeta));
        
        set({ downloadedIds: validIds, downloadedMetadata: validMeta });
      } catch (err) {
        console.error('[Offline] Error al sincronizar caché:', err);
      }
    },

    downloadSong: async (song) => {
      if (!song || !song.url) return;
      const { downloadedIds, downloadedMetadata, activeDownloads } = get();
      
      if (downloadedIds.includes(song.id) || activeDownloads.has(song.id)) {
        return; // Ya descargada o descargándose
      }

      // Añadir a descargas activas
      set((state) => {
        const newActive = new Set(state.activeDownloads);
        newActive.add(song.id);
        const newProgress = { ...state.downloadProgress, [song.id]: 0 };
        return { activeDownloads: newActive, downloadProgress: newProgress };
      });

      try {
        if (!('caches' in window)) {
          throw new Error('Caché no soportado por este navegador');
        }

        const cache = await caches.open(CACHE_NAME);

        // 1. Descarga del archivo MP3 con reporte de progreso
        console.log(`[Offline] Iniciando descarga de: ${song.title}`);
        const response = await fetch(song.url);
        if (!response.ok) throw new Error('Error al descargar el archivo de audio');

        const reader = response.body.getReader();
        const contentLength = +(response.headers.get('Content-Length') || 0);
        let receivedLength = 0;
        let chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          if (contentLength > 0) {
            const pct = Math.round((receivedLength / contentLength) * 100);
            set((state) => ({
              downloadProgress: { ...state.downloadProgress, [song.id]: pct }
            }));
          }
        }

        const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
        
        // Guardamos el audio en caché con su URL original
        const audioResponse = new Response(audioBlob, {
          headers: response.headers
        });
        await cache.put(song.url, audioResponse);

        // 2. Descarga de la portada (de forma paralela simple)
        if (song.cover_url) {
          try {
            // Usamos proxy para evitar problemas de CORS en descargas
            const proxyCoverUrl = song.cover_url.startsWith('data:') || song.cover_url.startsWith('blob:')
              ? song.cover_url
              : `https://musicfy.canonedu17.workers.dev/proxy-image?url=${encodeURIComponent(song.cover_url)}`;
            
            const coverRes = await fetch(proxyCoverUrl);
            if (coverRes.ok) {
              const coverBlob = await coverRes.blob();
              // Guardamos en caché asociado a la URL original de la portada
              const coverResponse = new Response(coverBlob, {
                headers: coverRes.headers
              });
              await cache.put(song.cover_url, coverResponse);
            }
          } catch (e) {
            console.warn('[Offline] No se pudo cachear la portada:', e);
          }
        }

        // 3. Actualizar estados locales y persistencia
        const newIds = [...downloadedIds, song.id];
        // Guardamos metadatos de la canción sin alterar para poder recrear la lista en offline
        const newMeta = [...downloadedMetadata, song];

        localStorage.setItem('musicfy_downloaded_ids', JSON.stringify(newIds));
        localStorage.setItem('musicfy_offline_metadata', JSON.stringify(newMeta));

        set((state) => {
          const newActive = new Set(state.activeDownloads);
          newActive.delete(song.id);
          const newProgress = { ...state.downloadProgress };
          delete newProgress[song.id];

          return {
            downloadedIds: newIds,
            downloadedMetadata: newMeta,
            activeDownloads: newActive,
            downloadProgress: newProgress
          };
        });

        console.log(`[Offline] Descarga completada con éxito: ${song.title}`);
      } catch (err) {
        console.error(`[Offline] Error descargando canción ${song.title}:`, err);
        set((state) => {
          const newActive = new Set(state.activeDownloads);
          newActive.delete(song.id);
          const newProgress = { ...state.downloadProgress };
          delete newProgress[song.id];
          return { activeDownloads: newActive, downloadProgress: newProgress };
        });
        alert(`No se pudo descargar la canción: ${song.title}. Verifica tu conexión.`);
      }
    },

    removeDownload: async (songId) => {
      const { downloadedIds, downloadedMetadata } = get();
      const song = downloadedMetadata.find(s => s.id === songId);
      if (!song) return;

      try {
        if ('caches' in window) {
          const cache = await caches.open(CACHE_NAME);
          await cache.delete(song.url);
          if (song.cover_url) {
            await cache.delete(song.cover_url);
          }
        }

        const newIds = downloadedIds.filter(id => id !== songId);
        const newMeta = downloadedMetadata.filter(s => s.id !== songId);

        localStorage.setItem('musicfy_downloaded_ids', JSON.stringify(newIds));
        localStorage.setItem('musicfy_offline_metadata', JSON.stringify(newMeta));

        set({
          downloadedIds: newIds,
          downloadedMetadata: newMeta
        });
        console.log(`[Offline] Descarga eliminada: ${song.title}`);
      } catch (err) {
        console.error(`[Offline] Error eliminando descarga de ${songId}:`, err);
      }
    },

    downloadPlaylist: async (playlistName, songs) => {
      if (!songs || songs.length === 0) return;
      console.log(`[Offline] Descargando playlist: ${playlistName}`);
      for (const song of songs) {
        await get().downloadSong(song);
      }
    }
  };
});

// Listener global para conexión a internet
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOfflineStore.getState().setNetworkOnline(true);
  });
  window.addEventListener('offline', () => {
    useOfflineStore.getState().setNetworkOnline(false);
  });
}
