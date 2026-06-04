import { supabase } from '../supabaseClient'
import { getHighResThumbnail } from '../utils/pipedService'
import { WORKER_URL, BACKEND_URL } from '../config'
import { fetchWithTimeout } from '../utils/fetchHelper'

// Bandera de autocuración de esquema para evitar HTTP 400 en consola de red
let dbSchemaSupportsSource = true;

// ─────────────────────────────────────────────
// PROVEEDOR LOCAL (fuente principal existente)
// ─────────────────────────────────────────────
export const LocalProvider = {
  name: 'local',
  
  async search(query, limit = 20) {
    try {
      const cleanQuery = query ? String(query).trim() : '';
      
      // Si ya detectamos que la columna 'source' no existe en la BD, ir directo al fallback
      if (!dbSchemaSupportsSource) {
        let fallbackQuery = supabase.from('songs').select('*');
        if (cleanQuery) {
          fallbackQuery = fallbackQuery.or(`title.ilike.%${cleanQuery}%,artist.ilike.%${cleanQuery}%,album.ilike.%${cleanQuery}%`);
        }
        const { data, error } = await fallbackQuery.limit(limit);
        if (error) throw error;
        return (data || []).map(normalizeLocal);
      }

      let q = supabase.from('songs').select('*');
      if (cleanQuery) {
        q = q.or(`title.ilike.%${cleanQuery}%,artist.ilike.%${cleanQuery}%,album.ilike.%${cleanQuery}%`);
      }
      
      // Intentar primero filtrando por source = local
      const { data, error } = await q.eq('source', 'local').limit(limit);
      
      if (error) {
        if (error.message?.includes('column songs.source does not exist') || error.status === 400 || error.code === 'PGRST100') {
          dbSchemaSupportsSource = false;
        }
        console.warn('[LocalProvider] Columna "source" no encontrada o error de consulta, aplicando fallback:', error.message);
        let fallbackQuery = supabase.from('songs').select('*');
        if (cleanQuery) {
          fallbackQuery = fallbackQuery.or(`title.ilike.%${cleanQuery}%,artist.ilike.%${cleanQuery}%,album.ilike.%${cleanQuery}%`);
        }
        const { data: fallbackData, error: fallbackError } = await fallbackQuery.limit(limit);
        if (fallbackError) throw fallbackError;
        return (fallbackData || []).map(normalizeLocal);
      }
      
      return (data || []).map(normalizeLocal);
    } catch (err) {
      console.error('[LocalProvider] Error en search:', err);
      return [];
    }
  },
  
  async getAll(limit = 50) {
    const cached = localStorage.getItem('musicfy_cached_queue')
    if (cached) {
      const parsed = JSON.parse(cached)
      if (parsed.length > 0) return parsed
    }
    
    try {
      if (!dbSchemaSupportsSource) {
        const { data, error } = await supabase
          .from('songs')
          .select('id,title,artist,cover_url,url,created_at,lyrics,background_url,duration,video_url')
          .order('created_at', { ascending: false })
          .limit(limit);
          
        if (error) throw error;
        const songs = (data || []).map(normalizeLocal);
        localStorage.setItem('musicfy_cached_queue', JSON.stringify(songs));
        return songs;
      }

      const { data, error } = await supabase
        .from('songs')
        .select('id,title,artist,cover_url,url,created_at,lyrics,background_url,duration,bpm,mood,energy,source,video_url')
        .eq('source', 'local')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.message?.includes('column songs.source does not exist') || error.status === 400 || error.code === 'PGRST100') {
          dbSchemaSupportsSource = false;
        }
        console.warn('[LocalProvider] Columnas extendidas no encontradas, aplicando fallback básico:', error.message);
        // Fallback a columnas seguras que sí existen de forma garantizada
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('songs')
          .select('id,title,artist,cover_url,url,created_at,lyrics,background_url,duration,video_url')
          .order('created_at', { ascending: false })
          .limit(limit);
          
        if (fallbackError) throw fallbackError;
        const songs = (fallbackData || []).map(normalizeLocal);
        localStorage.setItem('musicfy_cached_queue', JSON.stringify(songs));
        return songs;
      }

      const songs = (data || []).map(normalizeLocal);
      localStorage.setItem('musicfy_cached_queue', JSON.stringify(songs));
      return songs;
    } catch (err) {
      console.error('[LocalProvider] Error en getAll:', err);
      return [];
    }
  }
}

// ─────────────────────────────────────────────
// PROVEEDOR YOUTUBE (catálogo externo)
// ─────────────────────────────────────────────
export const YouTubeProvider = {
  name: 'youtube',
  
  async search(query, limit = 10) {
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {}, 15000)
      if (!res.ok) return []
      const data = await res.json()
      return (data.items || []).map(normalizeYouTube)
    } catch (e) {
      console.error('[YouTubeProvider] Error al buscar:', e)
      return []
    }
  },
  
  async getStreamUrl(youtubeId) {
    // 0. Comprobar caché local (en memoria o localStorage con tiempo de expiración)
    try {
      const cacheKey = `musicfy_stream_cache_${youtubeId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { url, expiresAt } = JSON.parse(cached);
        if (Date.now() < expiresAt) {
          console.log('[YouTubeProvider] ✅ Usando stream desde caché local (expira en', Math.round((expiresAt - Date.now()) / 60000), 'minutos)');
          return url;
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (e) {
      console.warn('[YouTubeProvider] Error leyendo caché de stream:', e);
    }

    let resolvedUrl = null;

    // Intento 1: Backend serverless (Vercel) — usa Cobalt + Invidious + Piped + ytdl en paralelo
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/stream?id=${youtubeId}`, {}, 35000)
      if (res.ok) {
        const { url } = await res.json()
        if (url) {
          console.log('[YouTubeProvider] ✅ Stream resuelto via backend')
          resolvedUrl = url
        }
      }
    } catch (e) {
      console.warn('[YouTubeProvider] Backend falló, intentando Worker proxy...', e.message)
    }

    // Intento 2: Proxy liviano de Piped/Invidious (función serverless separada, sin deps pesadas)
    if (!resolvedUrl) {
      try {
        const isLocal = typeof window !== 'undefined' && 
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        const proxyBase = isLocal ? 'http://localhost:5000' : ''
        const proxyUrl = `${proxyBase}/api/piped-proxy?id=${youtubeId}`
        const res = await fetchWithTimeout(proxyUrl, {}, 15000)
        if (res.ok) {
          const data = await res.json()
          if (data.url) {
            console.log('[YouTubeProvider] ✅ Stream resuelto via piped-proxy')
            resolvedUrl = data.url
          }
        }
      } catch (e) {
        console.warn('[YouTubeProvider] Piped proxy falló:', e.message)
      }
    }

    if (resolvedUrl) {
      // Guardar en caché por 4 horas (los enlaces de Google Video expiran a las 6 horas)
      try {
        localStorage.setItem(`musicfy_stream_cache_${youtubeId}`, JSON.stringify({
          url: resolvedUrl,
          expiresAt: Date.now() + 4 * 60 * 60 * 1000 // 4 horas
        }));
      } catch (e) {
        console.warn('[YouTubeProvider] Error guardando en caché de stream:', e);
      }
      return resolvedUrl;
    }

    console.error('[YouTubeProvider] ❌ Todos los métodos de resolución fallaron')
    throw new Error('No se pudo obtener la URL del stream desde ninguna fuente')
  },
  
  async getMetadata(youtubeId) {
    // Si no está soportado en backend, retornar null o consultar metadata
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/metadata/${youtubeId}`, {}, 15000)
      if (!res.ok) return null
      return res.json()
    } catch {
      return null
    }
  }
}

// ─────────────────────────────────────────────
// PROVEEDOR UNIFICADO (combina ambos)
// ─────────────────────────────────────────────
export const HybridMusicProvider = {
  
  async search(query, options = { includeExternal: true, limit: 20 }) {
    const [localResults, youtubeResults] = await Promise.allSettled([
      LocalProvider.search(query, options.limit),
      options.includeExternal ? YouTubeProvider.search(query, 5) : Promise.resolve([])
    ])
    
    const local = localResults.status === 'fulfilled' ? localResults.value : []
    const external = youtubeResults.status === 'fulfilled' ? youtubeResults.value : []
    
    // Local primero, luego externos
    return [...local, ...external]
  },
  
  // Obtener URL reproducible (maneja caché, offline, y YouTube)
  async getPlayableUrl(song) {
    if (song.source === 'local' || !song.source) {
      const { CacheManager } = await import('../utils/cacheManager')
      return CacheManager.getOrCacheSong(song)
    }
    if (song.source === 'youtube') {
      return YouTubeProvider.getStreamUrl(song.youtube_id)
    }
    return song.url
  }
}

// ─────────────────────────────────────────────
// NORMALIZADORES (estructura común)
// ─────────────────────────────────────────────
function normalizeLocal(song) {
  return { ...song, source: song.source || 'local' }
}

function normalizeYouTube(item) {
  return {
    id: `yt_${item.id.videoId}`,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    album: '',
    cover_url: getHighResThumbnail(item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url),
    url: null,  // Se obtiene en tiempo real via getPlayableUrl
    youtube_id: item.id.videoId,
    source: 'youtube',
    duration: null,
    lyrics: null,
    background_url: null,
    created_at: item.snippet.publishedAt,
  }
}
