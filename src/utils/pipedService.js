/**
 * PIPED SERVICE - COMPATIBILITY LAYER
 * 
 * Redirige de forma transparente todas las búsquedas y streams hacia nuestro nuevo
 * backend de Node.js local (que utiliza yt-dlp y ytmusicapi) en lugar de consultar
 * las inestables instancias públicas de Piped.
 */
import { BACKEND_URL } from '../config';
import { fetchWithTimeout } from './fetchHelper';

/**
 * Retorna la URL de la imagen en alta resolución reemplazando sufijos de miniatura.
 * @param {string} url - URL original del thumbnail
 * @returns {string}
 */
export function getHighResThumbnail(url) {
  if (!url) return '';
  
  // 1. Google user content (portadas/avatares de youtube music)
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    // Reemplaza tanto =w120-h120 como /w120-h120/ por w544-h544
    let highResUrl = url.replace(/([=/])w\d+-h\d+/, '$1w544-h544')
                        .replace(/([=/])s\d+([^\d]|$)/, '$1s512$2');
    return highResUrl;
  }
  
  // 2. YouTube thumbnails estándar
  if (url.includes('ytimg.com') || url.includes('youtube.com')) {
    const match = url.match(/\/vi\/([^\/]+)/);
    if (match && match[1]) {
      const videoId = match[1];
      // hqdefault (480x360) es el estándar de alta calidad seguro en todos los videos
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
    // Fallback simple si no coincide /vi/
    if (url.includes('/default.jpg')) return url.replace('/default.jpg', '/hqdefault.jpg');
    if (url.includes('/mqdefault.jpg')) return url.replace('/mqdefault.jpg', '/hqdefault.jpg');
  }
  
  return url;
}

/**
 * Realiza consultas al backend emulando la estructura de respuesta de Piped.
 * @param {string} path - Ruta solicitada (ej. "/search?q=..." o "/streams/...")
 * @returns {Promise<any>}
 */
export async function fetchFromPiped(path, options = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  try {
    // 1. Manejar consultas de búsqueda
    if (cleanPath.startsWith('/search')) {
      // Extraer parámetro q y filter
      const urlParams = new URLSearchParams(cleanPath.split('?')[1] || '');
      const query = urlParams.get('q') || '';
      const filter = urlParams.get('filter') || '';
      
      let type = 'song';
      if (filter === 'music_videos') type = 'video';
      else if (filter === 'playlists') type = 'playlist';
      else if (filter === 'albums') type = 'album';
      
      console.log(`[PipedProxy] Redirigiendo búsqueda al backend para: "${query}", tipo: ${type}`);
      
      let data;
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&type=${type}`, { signal: options.signal }, 6000);
        if (!res.ok) throw new Error(`Backend devolvió status ${res.status}`);
        data = await res.json();
      } catch (backendErr) {
        if (options.signal?.aborted) throw backendErr;
        console.warn("[PipedProxy] Backend search failed or timed out, falling back to public Piped mirrors...", backendErr.message);
        
        const PIPED_INSTANCES = [
          'https://pipedapi.kavin.rocks',
          'https://pipedapi.tokhmi.xyz',
          'https://pipedapi.moomoo.me',
          'https://pipedapi.adminforge.de',
          'https://api-piped.mha.fi'
        ];
        
        const searchPromises = PIPED_INSTANCES.map(async (instance) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          
          let signalListener;
          if (options.signal) {
            signalListener = () => controller.abort();
            options.signal.addEventListener('abort', signalListener);
          }

          try {
            const pipedFilter = type === 'song' ? 'songs' : (type === 'video' ? 'music_videos' : (type === 'playlist' ? 'playlists' : 'albums'));
            const response = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=${pipedFilter}`, {
              headers: { Accept: 'application/json' },
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const result = await response.json();
            if (result.items && result.items.length > 0) {
              return result;
            }
            throw new Error('No items');
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          } finally {
            if (options.signal && signalListener) {
              options.signal.removeEventListener('abort', signalListener);
            }
          }
        });

        try {
          const publicData = await Promise.any(searchPromises);
          
          if (type === 'playlist' || type === 'album') {
            return {
              items: (publicData.items || []).map(item => ({
                playlistId: item.playlistId,
                title: item.title,
                uploaderName: item.uploaderName || 'Artista Desconocido',
                thumbnail: getHighResThumbnail(item.thumbnail),
                trackCount: item.trackCount,
                type: item.type
              }))
            };
          }
          
          return {
            items: (publicData.items || []).map(item => ({
              url: `/watch?v=${item.videoId}`,
              title: item.title,
              uploaderName: item.uploaderName,
              thumbnail: getHighResThumbnail(item.thumbnail),
              duration: item.duration || 0
            }))
          };
        } catch (anyErr) {
          console.error("[PipedProxy] All public search fallbacks failed:", anyErr);
          throw new Error("Servicio de búsqueda no disponible temporalmente.");
        }
      }
      
      if (type === 'playlist' || type === 'album') {
        return {
          items: (data.items || []).map(item => ({
            playlistId: item.playlistId,
            title: item.title,
            uploaderName: item.author || 'Artista Desconocido',
            thumbnail: getHighResThumbnail(item.thumbnail),
            trackCount: item.trackCount,
            type: item.type
          }))
        };
      }
      
      // Mapear al formato que los componentes esperan de Piped (canciones/videos)
      return {
        items: (data.items || []).map(item => ({
          url: `/watch?v=${item.id.videoId}`,
          title: item.snippet.title,
          uploaderName: item.snippet.channelTitle,
          thumbnail: getHighResThumbnail(item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || ''),
          duration: 0
        }))
      };
    }
    
    // 2. Manejar consultas de streaming
    if (cleanPath.startsWith('/streams/')) {
      const videoId = cleanPath.split('/').pop();
      console.log(`[PipedProxy] Redirigiendo resolución de stream al backend para: ${videoId}`);
      
      const res = await fetchWithTimeout(`${BACKEND_URL}/stream?id=${videoId}`, { signal: options.signal }, 35000);
      if (!res.ok) throw new Error(`Backend devolvió status ${res.status}`);
      
      const data = await res.json();
      
      // Mapear al formato esperado por el reproductor
      return {
        audioStreams: [
          {
            url: data.url,
            format: 'M4A',
            quality: 'high'
          }
        ],
        videoStreams: []
      };
    }
    
    // Ruta genérica
    const res = await fetchWithTimeout(`${BACKEND_URL}${cleanPath}`, { signal: options.signal }, 20000);
    return await res.json();
    
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    console.error(`[PipedProxy] Error en proxy hacia backend para la ruta ${cleanPath}:`, err);
    throw new Error(`Error en el servidor local de música: ${err.message}`);
  }
}

/**
 * Retorna el endpoint de stream en el servidor local.
 * @param {string} songId - ID de video de YouTube
 * @returns {string}
 */
export function getStreamUrlEndpoint(songId) {
  return `${BACKEND_URL}/stream?id=${songId}`;
}
