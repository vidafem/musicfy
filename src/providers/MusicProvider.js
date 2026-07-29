import { supabase } from '../supabaseClient';
import { getHighResThumbnail } from '../utils/pipedService';
import { BACKEND_URL } from '../config';
import { fetchWithTimeout } from '../utils/fetchHelper';
import { stringToUuid } from '../utils/uuidHelper';

let dbSchemaSupportsSource = true;

// Nodos públicos de Piped/Invidious para consultas directas desde el cliente
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.video',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.colby.cloud'
];

// ─────────────────────────────────────────────
// PROVEEDOR LOCAL
// ─────────────────────────────────────────────
export const LocalProvider = {
  name: 'local',
  
  async search(query, limit = 20) {
    try {
      const cleanQuery = query ? String(query).trim() : '';
      
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
      
      const { data, error } = await q.eq('source', 'local').limit(limit);
      
      if (error) {
        if (error.message?.includes('column songs.source does not exist') || error.status === 400 || error.code === 'PGRST100') {
          dbSchemaSupportsSource = false;
        }
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
    const cached = localStorage.getItem('musicfy_cached_queue');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {}
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
};

// ─────────────────────────────────────────────
// PROVEEDOR YOUTUBE
// ─────────────────────────────────────────────
export const YouTubeProvider = {
  name: 'youtube',
  
  async search(query, limit = 10) {
    if (!query || !query.trim()) return [];
    const cleanQuery = query.trim();

    // 1. Intentar consulta directa desde el cliente a múltiples instancias de Piped
    for (const instance of PIPED_INSTANCES) {
      try {
        const url = `${instance}/search?q=${encodeURIComponent(cleanQuery)}&filter=music_songs`;
        const res = await fetchWithTimeout(url, {}, 8000);
        if (res.ok) {
          const data = await res.json();
          const items = data.items || data;
          if (Array.isArray(items) && items.length > 0) {
            console.log(`[YouTubeProvider] ✅ Búsqueda exitosa en cliente via ${instance}`);
            return items.slice(0, limit).map(normalizePipedItem);
          }
        }
      } catch (e) {
        console.warn(`[YouTubeProvider] Instancia Piped ${instance} falló:`, e.message);
      }
    }

    // 2. Fallback a backend si está disponible
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`, {}, 10000);
      if (res.ok) {
        const data = await res.json();
        return (data.items || []).map(normalizeYouTubeItem);
      }
    } catch (e) {
      console.error('[YouTubeProvider] Error al buscar via backend:', e);
    }

    return [];
  },
  
  async getStreamUrl(youtubeId) {
    if (!youtubeId) throw new Error('ID de YouTube no especificado');

    // 0. Caché local de 4 horas
    try {
      const cacheKey = `musicfy_stream_cache_${youtubeId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { url, expiresAt } = JSON.parse(cached);
        if (Date.now() < expiresAt) {
          console.log('[YouTubeProvider] ✅ Stream desde caché local');
          return url;
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (e) {}

    let resolvedUrl = null;

    // Intento 1: Consulta directa desde el navegador cliente a instancias Piped
    for (const instance of PIPED_INSTANCES) {
      try {
        const res = await fetchWithTimeout(`${instance}/streams/${youtubeId}`, {}, 8000);
        if (res.ok) {
          const data = await res.json();
          const audioStreams = data.audioStreams || [];
          if (audioStreams.length > 0) {
            // Ordenar por bitrate descendente
            audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            resolvedUrl = audioStreams[0].url;
            if (resolvedUrl) {
              console.log(`[YouTubeProvider] ✅ Stream resuelto directamente en cliente via ${instance}`);
              break;
            }
          }
        }
      } catch (e) {
        console.warn(`[YouTubeProvider] Falló stream en ${instance}:`, e.message);
      }
    }

    // Intento 2: Backend o proxy serverless
    if (!resolvedUrl) {
      try {
        const proxyUrl = `/api/piped-proxy?id=${youtubeId}`;
        const res = await fetchWithTimeout(proxyUrl, {}, 10000);
        if (res.ok) {
          const data = await res.json();
          if (data.url) resolvedUrl = data.url;
        }
      } catch (e) {}
    }

    if (resolvedUrl) {
      try {
        localStorage.setItem(`musicfy_stream_cache_${youtubeId}`, JSON.stringify({
          url: resolvedUrl,
          expiresAt: Date.now() + 4 * 60 * 60 * 1000
        }));
      } catch (e) {}
      return resolvedUrl;
    }

    throw new Error('No se pudo obtener la URL del stream desde ninguna fuente');
  }
};

// ─────────────────────────────────────────────
// PROVEEDOR UNIFICADO
// ─────────────────────────────────────────────
export const HybridMusicProvider = {
  async search(query, options = { includeExternal: true, limit: 20 }) {
    const [localResults, youtubeResults] = await Promise.allSettled([
      LocalProvider.search(query, options.limit),
      options.includeExternal ? YouTubeProvider.search(query, 8) : Promise.resolve([])
    ]);
    
    const local = localResults.status === 'fulfilled' ? localResults.value : [];
    const external = youtubeResults.status === 'fulfilled' ? youtubeResults.value : [];
    
    return [...local, ...external];
  },
  
  async getPlayableUrl(song) {
    if (song.source === 'local' || !song.source) {
      const { CacheManager } = await import('../utils/cacheManager');
      return CacheManager.getOrCacheSong(song);
    }
    if (song.source === 'youtube' || song.youtube_id) {
      const yid = song.youtube_id || (song.id?.startsWith('yt_') ? song.id.replace('yt_', '') : song.id);
      return YouTubeProvider.getStreamUrl(yid);
    }
    return song.url;
  }
};

function normalizeLocal(song) {
  return { ...song, source: song.source || 'local' };
}

function normalizePipedItem(item) {
  const yid = item.url ? item.url.replace('/watch?v=', '') : (item.id || item.videoId);
  return {
    id: stringToUuid(`yt_${yid}`), // UUID válido para PostgreSQL Supabase
    youtube_id: yid,
    title: item.title || 'Sin título',
    artist: item.uploaderName || item.channelTitle || 'Artista Desconocido',
    album: 'YouTube Music',
    cover_url: item.thumbnail || getHighResThumbnail(`https://i.ytimg.com/vi/${yid}/hqdefault.jpg`),
    url: null,
    source: 'youtube',
    duration: item.duration || 0,
    lyrics: null,
    background_url: null,
    created_at: new Date().toISOString()
  };
}

function normalizeYouTubeItem(item) {
  const yid = item.id?.videoId || item.id;
  return {
    id: stringToUuid(`yt_${yid}`),
    youtube_id: yid,
    title: item.snippet?.title || 'Sin título',
    artist: item.snippet?.channelTitle || 'Artista Desconocido',
    album: 'YouTube Music',
    cover_url: getHighResThumbnail(item.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`),
    url: null,
    source: 'youtube',
    duration: 0,
    lyrics: null,
    background_url: null,
    created_at: item.snippet?.publishedAt || new Date().toISOString()
  };
}

