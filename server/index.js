import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import YoutubeMusicApi from 'youtube-music-api';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import ytdl from '@distube/ytdl-core';
import { search as ytSearch, videoInfo, getFormats } from 'youtube-ext';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const ytApi = new YoutubeMusicApi();

let initPromise = null;
let isApiInitialized = false;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://musicfy-sigma.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('http://10.') ||
      origin.startsWith('http://172.') ||
      origin.endsWith('.vercel.app');

    callback(isAllowed ? null : new Error('Bloqueado por CORS'), isAllowed);
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

app.use(express.json());

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} (${timeoutMs / 1000}s)`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

async function initYtApi() {
  if (isApiInitialized) return true;
  if (!initPromise) {
    initPromise = ytApi.initalize()
      .then(() => {
        isApiInitialized = true;
        console.log('[YouTube Music API] Inicializada exitosamente.');
        return true;
      })
      .catch((err) => {
        initPromise = null;
        console.error('[YouTube Music API] Fallo al inicializar:', err.message);
        return false;
      });
  }
  return initPromise;
}

function isValidYouTubeId(id = '') {
  return /^[a-zA-Z0-9_-]{6,20}$/.test(String(id));
}

function bestThumbnail(thumbnails) {
  if (!thumbnails) return '';
  const unwrap = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return unwrap(value.url);
  };
  if (Array.isArray(thumbnails)) {
    return unwrap(thumbnails[thumbnails.length - 1]) || unwrap(thumbnails[0]);
  }
  return unwrap(thumbnails);
}

function normalizeMusicItem(item) {
  const artistName = Array.isArray(item.artist)
    ? item.artist.map((artist) => artist.name || artist).join(', ')
    : (item.artist?.name || item.artist || item.author || 'Artista Desconocido');

  return {
    id: { videoId: item.videoId || item.id },
    snippet: {
      title: item.name || item.title || 'Cancion Desconocida',
      channelTitle: artistName,
      thumbnails: {
        high: { url: bestThumbnail(item.thumbnails) }
      },
      publishedAt: new Date().toISOString()
    }
  };
}

function normalizeExtVideo(item) {
  return {
    id: { videoId: item.id },
    snippet: {
      title: item.title,
      channelTitle: item.channel?.name || 'Artista Desconocido',
      thumbnails: {
        high: { url: bestThumbnail(item.thumbnails) }
      },
      publishedAt: new Date().toISOString()
    }
  };
}

function normalizePlaylistItem(item, searchType) {
  return {
    browseId: item.browseId || item.id,
    playlistId: item.playlistId || item.id || item.browseId?.replace(/^VL/, ''),
    title: item.title || item.name,
    author: item.author || (Array.isArray(item.artist) ? item.artist.map((a) => a.name).join(', ') : item.artist?.name) || item.artist || 'Artista Desconocido',
    type: item.type || searchType,
    trackCount: item.trackCount || item.videoCount || 0,
    thumbnail: bestThumbnail(item.thumbnails)
  };
}

async function searchYouTubeMusic(q, searchType) {
  const initTimeout = isServerless ? 3000 : 6000;
  const searchTimeout = isServerless ? 4000 : 12000;
  const ready = await withTimeout(initYtApi(), initTimeout, 'Timeout inicializando YouTube Music');
  if (!ready) throw new Error('YouTube Music API no inicializada');
  const result = await withTimeout(ytApi.search(q, searchType), searchTimeout, 'Timeout de busqueda en YouTube Music');
  return result.content || [];
}

async function searchWithYoutubeExt(q, searchType) {
  const timeoutMs = isServerless ? 4000 : 12000;
  const result = await withTimeout(ytSearch(q), timeoutMs, 'Timeout de busqueda alternativa en YouTube');
  if (searchType === 'playlist' || searchType === 'album') {
    return (result.playlists || []).map((item) => normalizePlaylistItem(item, searchType));
  }
  return (result.videos || []).map(normalizeExtVideo);
}

async function resolveStreamWithYoutubeExt(id) {
  const timeoutMs = isServerless ? 3500 : 12000;
  const info = await withTimeout(
    videoInfo(`https://www.youtube.com/watch?v=${id}`),
    timeoutMs,
    'Timeout obteniendo informacion de video'
  );
  const formats = await withTimeout(
    getFormats(info.stream, {
      filterBy: (format) => Boolean(format.url) && Boolean(format.mimeType?.includes('audio'))
    }),
    timeoutMs,
    'Timeout decodificando formatos de audio'
  );

  const bestAudio = formats
    .filter((format) => format.url)
    .sort((a, b) => (b.bitrate || b.averageBitrate || 0) - (a.bitrate || a.averageBitrate || 0))[0];

  if (!bestAudio?.url) throw new Error('No se encontro stream de audio');
  return bestAudio.url;
}

async function resolveStreamWithYtdlCore(id) {
  const timeoutMs = isServerless ? 4000 : 12000;
  const info = await withTimeout(
    ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`),
    timeoutMs,
    'Timeout obteniendo formatos con ytdl-core'
  );
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'highestaudio',
    filter: 'audioonly'
  });
  if (!format?.url) throw new Error('ytdl-core no devolvio URL de audio');
  return format.url;
}

function resolveStreamWithYtDlp(id) {
  return new Promise((resolve, reject) => {
    const localYtdlp = path.join(process.cwd(), 'yt-dlp.exe');
    const executable = fs.existsSync(localYtdlp) ? localYtdlp : 'yt-dlp';
    const child = execFile(
      executable,
      ['-f', 'bestaudio', '-g', `https://www.youtube.com/watch?v=${id}`],
      { timeout: 25000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        const streamUrl = stdout.trim().split(/\r?\n/).find(Boolean);
        streamUrl ? resolve(streamUrl) : reject(new Error('yt-dlp no devolvio ninguna URL'));
      }
    );
    child.on('error', reject);
  });
}

async function resolveStreamWithPiped(id) {
  const instances = (process.env.PIPED_API_URLS || [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.syncpundit.io',
    'https://api-piped.mha.fi'
  ].join(','))
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const errors = [];
  for (const baseUrl of instances) {
    try {
      const response = await withTimeout(
        fetch(`${baseUrl}/streams/${id}`, {
          headers: { Accept: 'application/json' }
        }),
        12000,
        `Timeout consultando Piped ${baseUrl}`
      );
      if (!response.ok) {
        errors.push(`${baseUrl}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const stream = (data.audioStreams || [])
        .filter((item) => item.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (stream?.url) return stream.url;
      errors.push(`${baseUrl}: sin audioStreams`);
    } catch (error) {
      errors.push(`${baseUrl}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | ') || 'Piped no devolvio stream');
}

async function resolveStreamWithPipedParallel(id) {
  const instances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.syncpundit.io',
    'https://api-piped.mha.fi',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.colby.host',
    'https://pipedapi.leptons.xyz',
    'https://piped-api.lunar.icu',
    'https://watchapi.whatever.social'
  ];

  const fetchFromInstance = async (baseUrl) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${baseUrl}/streams/${id}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const stream = (data.audioStreams || [])
        .filter((item) => item.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (stream?.url) return stream.url;
      throw new Error('Sin audioStreams');
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    return await Promise.any(instances.map(url => fetchFromInstance(url)));
  } catch (err) {
    throw new Error('Todos los espejos de Piped fallaron');
  }
}

async function resolveStreamWithInvidious(id) {
  const instances = [
    'https://inv.nadeko.net',
    'https://invidious.fdn.fr',
    'https://inv.tux.pizza',
    'https://invidious.protokoll-11.de',
    'https://iv.ggtyler.dev',
    'https://invidious.privacyredirect.com',
    'https://invidious.lunar.icu',
    'https://vid.puffyan.us',
    'https://invidious.nerdvpn.de'
  ];

  const fetchFromInstance = async (baseUrl) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${baseUrl}/api/v1/videos/${id}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // Invidious returns adaptiveFormats with audio
      const audioFormats = (data.adaptiveFormats || [])
        .filter((f) => f.type && f.type.startsWith('audio/') && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (audioFormats.length > 0 && audioFormats[0].url) return audioFormats[0].url;
      throw new Error('Sin formatos de audio en Invidious');
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    return await Promise.any(instances.map(url => fetchFromInstance(url)));
  } catch (err) {
    throw new Error('Todos los espejos de Invidious fallaron');
  }
}

async function resolveStreamWithCobalt(id) {
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt-api.hyper.lol',
    'https://cobalt.api.timelessnesses.me'
  ];

  const fetchFromCobalt = async (baseUrl) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${id}`,
          downloadMode: 'audio',
          audioFormat: 'best'
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // Cobalt returns { status: 'tunnel'|'redirect', url: '...' }
      if (data.url) return data.url;
      if (data.audio) return data.audio;
      throw new Error('Cobalt no devolvió URL: ' + JSON.stringify(data.status || data));
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    return await Promise.any(cobaltInstances.map(url => fetchFromCobalt(url)));
  } catch (err) {
    throw new Error('Todos los espejos de Cobalt fallaron');
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    serverless: isServerless,
    initialized: isApiInitialized,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/search', async (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ error: 'Falta el parametro de busqueda (q)' });

  const searchType = ['video', 'playlist', 'album', 'artist'].includes(type) ? type : 'song';
  console.log(`[Search] Buscando ${searchType} para: "${q}"`);

  try {
    let content = [];
    try {
      content = await searchYouTubeMusic(q, searchType);
    } catch (primaryError) {
      console.warn('[Search] Fallback a youtube-ext:', primaryError.message);
      const fallbackItems = await searchWithYoutubeExt(q, searchType);
      return res.json({ items: fallbackItems, source: 'youtube-ext' });
    }

    if (searchType === 'playlist' || searchType === 'album') {
      return res.json({ items: content.map((item) => normalizePlaylistItem(item, searchType)) });
    }

    if (searchType === 'artist') {
      return res.json({
        items: content.map((item) => ({
          browseId: item.browseId,
          name: item.name || item.title,
          thumbnail: bestThumbnail(item.thumbnails),
          type: 'artist'
        }))
      });
    }

    res.json({ items: content.map(normalizeMusicItem) });
  } catch (error) {
    console.error('[Search] Error en busqueda:', error);
    res.status(200).json({ items: [], error: error.message });
  }
});

app.get('/api/playlist/tracks', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el parametro de ID de playlist (id)' });

  const cleanId = String(id).startsWith('VL') ? String(id).substring(2) : String(id);
  const playlistUrl = `https://www.youtube.com/playlist?list=${cleanId}`;
  const localYtdlp = path.join(process.cwd(), 'yt-dlp.exe');
  const executable = fs.existsSync(localYtdlp) ? localYtdlp : 'yt-dlp';

  execFile(executable, ['--dump-single-json', '--flat-playlist', playlistUrl], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[PlaylistTracks] Error al ejecutar yt-dlp para ${id}:`, error);
      return res.status(200).json({
        title: 'Playlist de YouTube',
        description: '',
        trackCount: 0,
        cover_url: '',
        tracks: [],
        error: stderr || error.message
      });
    }

    try {
      const data = JSON.parse(stdout);
      const tracks = (data.entries || []).map((entry, idx) => ({
        id: entry.id,
        title: entry.title,
        artist: entry.uploader || entry.channel || 'Artista Desconocido',
        cover_url: bestThumbnail(entry.thumbnails),
        url: null,
        source: 'youtube',
        youtube_id: entry.id,
        is_external: true,
        is_video: false,
        duration: entry.duration || 0,
        position: idx + 1
      }));

      res.json({
        title: data.title || 'Playlist de YouTube',
        description: data.description || '',
        trackCount: tracks.length,
        cover_url: tracks[0]?.cover_url || '',
        tracks
      });
    } catch (err) {
      res.status(200).json({ title: 'Playlist de YouTube', trackCount: 0, tracks: [], error: err.message });
    }
  });
});

app.get('/api/stream', async (req, res) => {
  const { id } = req.query;
  if (!isValidYouTubeId(id)) return res.status(400).json({ error: 'ID de video invalido' });

  console.log(`[Stream] Obteniendo URL de stream para video: ${id}`);

  if (isServerless) {
    // En serverless: ejecutar TODOS los resolvers en paralelo con Promise.any
    // para que el primero que responda gane. Timeout global de 25s.
    const resolverEntries = [
      ['cobalt', () => resolveStreamWithCobalt(id)],
      ['invidious', () => resolveStreamWithInvidious(id)],
      ['piped-parallel', () => resolveStreamWithPipedParallel(id)],
      ['youtube-ext', () => resolveStreamWithYoutubeExt(id)],
      ['ytdl-core', () => resolveStreamWithYtdlCore(id)]
    ];

    const resolverPromises = resolverEntries.map(async ([name, fn]) => {
      try {
        const url = await fn();
        if (!url) throw new Error('URL vacía');
        console.log(`[Stream] ✅ URL resuelta con ${name} para ${id}`);
        return { url, source: name };
      } catch (err) {
        console.warn(`[Stream] ❌ ${name} fallo para ${id}:`, err.message);
        throw err;
      }
    });

    try {
      const result = await withTimeout(
        Promise.any(resolverPromises),
        25000,
        'Timeout global de resolución de stream'
      );
      return res.json(result);
    } catch (err) {
      console.error(`[Stream] Todos los resolvers fallaron para ${id}:`, err.message);
      return res.status(503).json({
        error: 'No se pudo extraer la URL del stream de audio.',
        details: err.errors ? err.errors.map(e => e.message) : [err.message]
      });
    }
  } else {
    // En modo local: ejecución secuencial con fallbacks (más opciones disponibles)
    const resolvers = [
      ['youtube-ext', resolveStreamWithYoutubeExt],
      ['ytdl-core', resolveStreamWithYtdlCore],
      ['piped-api', resolveStreamWithPiped],
      ['yt-dlp', resolveStreamWithYtDlp]
    ];

    const errors = [];
    for (const [name, resolver] of resolvers) {
      try {
        const url = await resolver(id);
        console.log(`[Stream] URL resuelta con ${name} para ${id}`);
        return res.json({ url, source: name });
      } catch (error) {
        errors.push(`${name}: ${error.message}`);
        console.warn(`[Stream] ${name} fallo para ${id}:`, error.message);
      }
    }

    res.status(503).json({
      error: 'No se pudo extraer la URL del stream de audio.',
      details: errors
    });
  }
});

if (!isServerless) {
  app.listen(PORT, () => {
    console.log(`[Musicfy Backend] Servidor ejecutandose en http://localhost:${PORT}`);
  });
}

export default app;
