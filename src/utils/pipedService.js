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
  
  // 1. Google user content (portadas/avatares)
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    // Reemplazar =w\d+-h\d+ por =w544-h544
    let highResUrl = url.replace(/=w\d+-h\d+/, '=w544-h544');
    // Reemplazar =s\d+ por =s512
    highResUrl = highResUrl.replace(/=s\d+/, '=s512');
    return highResUrl;
  }
  
  // 2. YouTube thumbnails estándar
  if (url.includes('ytimg.com') || url.includes('youtube.com')) {
    if (url.includes('/default.jpg')) {
      return url.replace('/default.jpg', '/hqdefault.jpg');
    }
    if (url.includes('/mqdefault.jpg')) {
      return url.replace('/mqdefault.jpg', '/hqdefault.jpg');
    }
  }
  
  return url;
}

/**
 * Realiza consultas al backend emulando la estructura de respuesta de Piped.
 * @param {string} path - Ruta solicitada (ej. "/search?q=..." o "/streams/...")
 * @returns {Promise<any>}
 */
export async function fetchFromPiped(path) {
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
      
      const res = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&type=${type}`);
      if (!res.ok) throw new Error(`Backend devolvió status ${res.status}`);
      
      const data = await res.json();
      
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
      
      const res = await fetchWithTimeout(`${BACKEND_URL}/stream?id=${videoId}`);
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
    const res = await fetchWithTimeout(`${BACKEND_URL}${cleanPath}`);
    return await res.json();
    
  } catch (err) {
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
