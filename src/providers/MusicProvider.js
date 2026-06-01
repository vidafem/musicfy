import { supabase } from '../supabaseClient'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

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
    // El Worker de Cloudflare hace de proxy para la YouTube Data API / Piped
    const res = await fetch(`${WORKER_URL}/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items || []).map(normalizeYouTube)
  },
  
  async getStreamUrl(youtubeId) {
    // El Worker devuelve una URL de stream segura (sin exponer API key)
    const res = await fetch(`${WORKER_URL}/youtube/stream/${youtubeId}`)
    if (!res.ok) throw new Error('No se pudo obtener la URL del stream')
    const { url } = await res.json()
    return url
  },
  
  async getMetadata(youtubeId) {
    const res = await fetch(`${WORKER_URL}/youtube/metadata/${youtubeId}`)
    if (!res.ok) return null
    return res.json()
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
    cover_url: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
    url: null,  // Se obtiene en tiempo real via getPlayableUrl
    youtube_id: item.id.videoId,
    source: 'youtube',
    duration: null,
    lyrics: null,
    background_url: null,
    created_at: item.snippet.publishedAt,
  }
}
