import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import YoutubeMusicApi from 'youtube-music-api';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Inicializar la API de YouTube Music (con la corrección ortográfica de la librería)
const ytApi = new YoutubeMusicApi();
let isApiInitialized = false;

async function initYtApi() {
  try {
    await ytApi.initalize();
    isApiInitialized = true;
    console.log('[YouTube Music API] Inicializada exitosamente.');
  } catch (err) {
    console.error('[YouTube Music API] Falló al inicializar:', err.message);
  }
}

initYtApi();

// Endpoint de búsqueda
app.get('/api/search', async (req, res) => {
  const { q, type } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Falta el parámetro de búsqueda (q)' });
  }

  try {
    if (!isApiInitialized) {
      await initYtApi();
    }

    const searchType = (type === 'video' || type === 'playlist' || type === 'album' || type === 'artist') ? type : 'song';
    console.log(`[Search] Buscando ${searchType} para: "${q}"`);
    
    const searchPromise = ytApi.search(q, searchType);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout de búsqueda en YouTube Music (4s)')), 4000)
    );
    
    const searchResult = await Promise.race([searchPromise, timeoutPromise]);
    
    if (searchType === 'playlist' || searchType === 'album') {
      const items = (searchResult.content || []).map(item => {
        return {
          browseId: item.browseId,
          playlistId: item.playlistId || item.browseId?.replace(/^VL/, ''),
          title: item.title || item.name,
          author: item.author || (Array.isArray(item.artist) ? item.artist.map(a => a.name).join(', ') : item.artist?.name) || item.artist || 'Artista Desconocido',
          type: item.type || searchType,
          trackCount: item.trackCount || 0,
          thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url || item.thumbnails?.[0]?.url || ''
        };
      });
      return res.json({ items });
    }

    if (searchType === 'artist') {
      const items = (searchResult.content || []).map(item => {
        return {
          browseId: item.browseId,
          name: item.name || item.title,
          thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url || item.thumbnails?.[0]?.url || '',
          type: 'artist'
        };
      });
      return res.json({ items });
    }

    // Normalizar resultados de canciones/videos
    const items = (searchResult.content || []).map(item => {
      const artistName = Array.isArray(item.artist) 
        ? item.artist.map(a => a.name).join(', ') 
        : (item.artist?.name || item.artist || 'Artista Desconocido');

      return {
        id: { videoId: item.videoId },
        snippet: {
          title: item.name,
          channelTitle: artistName,
          thumbnails: {
            high: { url: item.thumbnails?.[0]?.url || item.thumbnails?.url || '' }
          },
          publishedAt: new Date().toISOString()
        }
      };
    });

    res.json({ items });
  } catch (error) {
    console.error('[Search] Error en búsqueda:', error);
    res.status(500).json({ error: 'Error en la búsqueda de YouTube Music', details: error.message });
  }
});

// Endpoint para obtener canciones de una playlist o álbum externo usando yt-dlp
app.get('/api/playlist/tracks', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro de ID de playlist (id)' });
  }

  console.log(`[PlaylistTracks] Obteniendo canciones para playlist/album ID: ${id}`);

  const cleanId = id.startsWith('VL') ? id.substring(2) : id;
  const playlistUrl = `https://www.youtube.com/playlist?list=${cleanId}`;

  const localYtdlp = path.join(process.cwd(), 'yt-dlp.exe');
  const useLocal = fs.existsSync(localYtdlp);
  const executable = useLocal ? `"${localYtdlp}"` : 'yt-dlp';
  const cmd = `${executable} --dump-single-json --flat-playlist "${playlistUrl}"`;

  exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[PlaylistTracks] Error al ejecutar yt-dlp para ${id}:`, error);
      return res.status(500).json({ 
        error: 'No se pudieron extraer los metadatos de la playlist.', 
        details: error.message 
      });
    }

    try {
      const data = JSON.parse(stdout);
      const tracks = (data.entries || []).map((entry, idx) => {
        // Encontrar miniatura de mejor calidad disponible
        const thumbUrl = entry.thumbnails?.[entry.thumbnails.length - 1]?.url || entry.thumbnails?.[0]?.url || '';
        
        return {
          id: entry.id,
          title: entry.title,
          artist: entry.uploader || entry.channel || 'Artista Desconocido',
          cover_url: thumbUrl,
          url: null, // Let usePlayerStore resolve it
          source: 'youtube',
          youtube_id: entry.id,
          is_external: true,
          is_video: false,
          duration: entry.duration || 0,
          position: idx + 1
        };
      });

      res.json({
        title: data.title || 'Playlist de YouTube',
        description: data.description || '',
        trackCount: tracks.length,
        cover_url: tracks[0]?.cover_url || '',
        tracks
      });
    } catch (err) {
      res.status(500).json({ error: 'Error al procesar la respuesta de la playlist.', details: err.message });
    }
  });
});

// Endpoint de streaming con yt-dlp
app.get('/api/stream', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro de ID de video (id)' });
  }

  console.log(`[Stream] Obteniendo URL de stream para video: ${id}`);

  const localYtdlp = path.join(process.cwd(), 'yt-dlp.exe');
  const useLocal = fs.existsSync(localYtdlp);
  const executable = useLocal ? `"${localYtdlp}"` : 'yt-dlp';

  const videoUrl = `https://www.youtube.com/watch?v=${id}`;
  const cmd = `${executable} -f bestaudio -g "${videoUrl}"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Stream] Error al ejecutar yt-dlp para ${id}:`, error);
      console.error(`[Stream] stderr:`, stderr);
      
      // Fallback: si falla yt-dlp local, podemos intentar devolver un enlace directo predeterminado o error
      return res.status(500).json({ 
        error: 'No se pudo extraer la URL del stream de audio.', 
        details: error.message,
        stderr: stderr
      });
    }

    const streamUrl = stdout.trim();
    if (!streamUrl) {
      return res.status(500).json({ error: 'yt-dlp no devolvió ninguna URL' });
    }

    console.log(`[Stream] URL resuelta exitosamente para ${id}`);
    res.json({ url: streamUrl });
  });
});

app.listen(PORT, () => {
  console.log(`[Musicfy Backend] Servidor ejecutándose en http://localhost:${PORT}`);
});
