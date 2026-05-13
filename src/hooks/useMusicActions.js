import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { uploadToR2, deleteFromR2 } from '../lib/cloudflareR2';

const WORKER_URL = 'https://musicfy.canonedu17.workers.dev';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const withTimeout = async (promise, timeoutMs = 30000) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Tiempo de espera agotado')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const sanitizeTitle = (title) => {
  const clean = String(title || 'track').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return clean || 'track';
};

const toNumericYear = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSupabaseId = (result) => {
  if (result == null) return null;
  if (typeof result === 'string' || typeof result === 'number') return result;
  if (Array.isArray(result)) return result[0]?.id ?? result[0] ?? null;
  if (result?.id) return result.id;
  return null;
};

const insertSongIntoSupabase = async (songData) => {
  const { data, error } = await withTimeout(
    supabase
      .from('songs')
      .insert([
        {
          title: songData.title,
          artist: songData.artist,
          album: songData.album,
          url: songData.url,
          cover_url: songData.cover_url,
          background_url: songData.background_url,
          lyrics: songData.lyrics,
          genre: songData.genre,
          year: songData.year,
          duration: songData.duration
        }
      ])
      .select('id')
      .single(),
    120000
  );

  if (error) {
    console.error('[Supabase fallback insert] error:', error);
    throw error;
  }

  return normalizeSupabaseId(data);
};

const insertSongViaRest = async (songData) => {
  const response = await withTimeout(
    fetch(`${SUPABASE_URL}/rest/v1/songs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify([
        {
          title: songData.title,
          artist: songData.artist,
          album: songData.album,
          url: songData.url,
          cover_url: songData.cover_url,
          background_url: songData.background_url,
          lyrics: songData.lyrics,
          genre: songData.genre,
          year: songData.year,
          duration: songData.duration
        }
      ])
    }),
    120000
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`REST fallback failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  return normalizeSupabaseId(json?.[0]);
};

const toDuration = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function useMusicActions() {
  const [statusModal, setStatusModal] = useState({ show: false, title: '', steps: [], type: 'loading' });
  const [isUploading, setIsUploading] = useState(false);
  const uploadLockRef = useRef(false);
  const recentUploadsRef = useRef(new Map());

  const updateStatusStep = (stepIndex, status) => {
    setStatusModal((prev) => {
      const newSteps = [...prev.steps];
      if (newSteps[stepIndex]) newSteps[stepIndex].status = status;
      return { ...prev, steps: newSteps };
    });
  };

  const uploadSong = async ({
    file,
    metadata,
    coverUrl,
    currentSessionTimestamp,
    onProgress
  }) => {
    if (!file) throw new Error('No hay archivo para subir');

    // Generamos un identificador único seguro (sin usar el nombre original que puede traer espacios/caracteres raros)
    const fileHash = Math.random().toString(36).substring(2, 8);
    const seed = `${currentSessionTimestamp}_${file.size}_${fileHash}`;
    const safeTitle = sanitizeTitle(metadata.title);
    const uploadedKeys = [];

    let finalMp3Url;
    let finalCoverUrl;
    let finalBackgroundUrl;

    try {
      onProgress?.(5);

      const uploadTasks = [];

      // MP3 Task
      const mp3Path = `music/${safeTitle}_${seed}.mp3`;
      uploadedKeys.push(mp3Path);
      uploadTasks.push(withTimeout(uploadToR2(file, mp3Path), 120000).then(u => { 
        finalMp3Url = u; 
        onProgress?.(45); 
      }));

      // Cover Task
      if (coverUrl) {
        if (coverUrl.includes(import.meta.env.VITE_R2_PUBLIC_URL)) {
          finalCoverUrl = coverUrl;
        } else {
          uploadTasks.push((async () => {
            try {
              const fetchUrl = coverUrl.startsWith('data:') || coverUrl.startsWith('blob:') ? coverUrl : `${WORKER_URL}/proxy-image?url=${encodeURIComponent(coverUrl)}`;
              const res = await withTimeout(fetch(fetchUrl), 30000);
              if (res.ok) {
                const b = await res.blob();
                const ext = (b.type || '').includes('video') ? 'mp4' : 'jpg';
                const p = `covers/${safeTitle}_${seed}.${ext}`;
                finalCoverUrl = await withTimeout(uploadToR2(b, p), 90000);
                uploadedKeys.push(p);
              } else { finalCoverUrl = coverUrl; }
            } catch { finalCoverUrl = coverUrl; }
            onProgress?.(70);
          })());
        }
      } else { onProgress?.(70); }

      // Background Task
      if (metadata.background_url) {
        if (metadata.background_url.includes(import.meta.env.VITE_R2_PUBLIC_URL)) {
          finalBackgroundUrl = metadata.background_url;
        } else {
          uploadTasks.push((async () => {
            try {
              const fetchUrl = metadata.background_url.startsWith('data:') || metadata.background_url.startsWith('blob:') ? metadata.background_url : `${WORKER_URL}/proxy-image?url=${encodeURIComponent(metadata.background_url)}`;
              const res = await withTimeout(fetch(fetchUrl), 30000);
              if (res.ok) {
                const b = await res.blob();
                const p = `backgrounds/${safeTitle}_bg_${seed}.jpg`;
                finalBackgroundUrl = await withTimeout(uploadToR2(b, p), 90000);
                uploadedKeys.push(p);
              } else { finalBackgroundUrl = metadata.background_url; }
            } catch { finalBackgroundUrl = metadata.background_url; }
            onProgress?.(85);
          })());
        }
      } else { onProgress?.(85); }

      console.log("[R2] ⚡ Iniciando ráfaga paralela...");
      await Promise.all(uploadTasks);
      console.log("[R2] ✅ Subida terminada.");

      const songData = {
        title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
        artist: metadata.artist || 'Artista Desconocido',
        album: metadata.album || '',
        genre: metadata.genre || '',
        year: toNumericYear(metadata.year),
        lyrics: metadata.lyrics || '',
        cover_url: finalCoverUrl,
        background_url: finalBackgroundUrl,
        url: finalMp3Url,
        duration: toDuration(metadata.duration)
      };

      console.log("[Supabase] 🚀 Usando vía rápida (RPC)...", songData);
      
      let finalResult = null;
      let attempts = 2;
      let lastError = null;

      while (attempts > 0) {
        try {
          // Vía rápida con tiempo de gracia extendido
          const { data: newId, error: rpcError } = await withTimeout(
            supabase.rpc('quick_add_song', {
              p_title: songData.title,
              p_artist: songData.artist,
              p_album: songData.album,
              p_url: songData.url,
              p_cover_url: songData.cover_url,
              p_background_url: songData.background_url,
              p_lyrics: songData.lyrics,
              p_genre: songData.genre,
              p_year: songData.year,
              p_duration: songData.duration
            }),
            90000 // 90 SEGUNDOS - Paciencia extrema para el servidor
          );

          if (rpcError) {
            throw rpcError;
          }

          let insertedId = normalizeSupabaseId(newId);
          if (!insertedId) {
            console.warn('[Supabase] RPC no devolvió ID (quizá retorna void). Buscando ID por URL...');
            const { data: fetchedSong, error: fetchError } = await supabase
              .from('songs')
              .select('id')
              .eq('url', songData.url)
              .single();
              
            if (!fetchError && fetchedSong?.id) {
              insertedId = fetchedSong.id;
            } else {
              throw new Error('No se obtuvo ID de Supabase desde el RPC ni se pudo recuperar');
            }
          }

          finalResult = { ...songData, id: insertedId };
          break;
        } catch (err) {
          lastError = err;
          console.warn(`[Supabase] RPC no disponible. Intentando fallback directo... (${attempts} restantes)`);
          console.error('[Supabase] Detalle del error en RPC:', err);
          if (attempts <= 1) {
            try {
              const fallbackId = await insertSongIntoSupabase(songData);
              if (!fallbackId) {
                throw new Error('Fallback directo no devolvió ID');
              }
              finalResult = { ...songData, id: fallbackId };
              break;
            } catch (fallbackError) {
              lastError = fallbackError;
              console.error('[Supabase] Fallback directo falló:', fallbackError);

              try {
                const restId = await insertSongViaRest(songData);
                if (!restId) {
                  throw new Error('REST fallback no devolvió ID');
                }
                finalResult = { ...songData, id: restId };
                break;
              } catch (restError) {
                lastError = restError;
                console.error('[Supabase] REST fallback falló:', restError);
              }
            }
          }
          attempts -= 1;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      if (!finalResult) {
        const details = lastError?.message || lastError?.details || JSON.stringify(lastError);
        throw new Error(`Error al guardar en Supabase: ${details}`);
      }

      console.log('[Supabase] ✅ Canción registrada con ID:', finalResult.id);
      onProgress?.(100);
      return finalResult;
    } catch (error) {
      console.error('[useMusicActions] uploadSong falló:', error);
      // Revertimos archivos subidos si falla el insert o cualquier etapa final.
      for (const key of uploadedKeys.reverse()) {
        try {
          await deleteFromR2(key);
        } catch {
          // noop
        }
      }
      throw error;
    }
  };

  const handleUpload = async ({ file, metadata, coverUrl, currentSessionTimestamp, onComplete }) => {
    if (!file) return;
    if (uploadLockRef.current) return;

    const uploadToken = `${file.name}:${file.size}:${file.lastModified || 0}:${currentSessionTimestamp}`;
    const now = Date.now();
    const lastAt = recentUploadsRef.current.get(uploadToken);
    if (lastAt && now - lastAt < 120000) return;

    recentUploadsRef.current.set(uploadToken, now);
    uploadLockRef.current = true;
    setIsUploading(true);

    const steps = [
      { label: 'Subiendo archivo MP3 (R2)', status: 'pending' },
      { label: 'Espejando Portada (R2)', status: 'pending' },
      { label: 'Espejando Fondo TV (R2)', status: 'pending' },
      { label: 'Guardando en Supabase', status: 'pending' }
    ];
    setStatusModal({ show: true, title: 'Publicando Obra Maestra', steps, type: 'loading' });

    try {
      updateStatusStep(0, 'active');
      const onProgress = (p) => {
        if (p >= 45) updateStatusStep(0, 'done');
        if (p > 45 && p < 70) updateStatusStep(1, 'active');
        if (p >= 70) updateStatusStep(1, 'done');
        if (p > 70 && p < 85) updateStatusStep(2, 'active');
        if (p >= 85) updateStatusStep(2, 'done');
        if (p > 85) updateStatusStep(3, 'active');
      };

      await uploadSong({ file, metadata, coverUrl, currentSessionTimestamp, onProgress });
      updateStatusStep(3, 'done');
      setStatusModal((prev) => ({ ...prev, type: 'success' }));
      onComplete?.();
    } catch (error) {
      recentUploadsRef.current.delete(uploadToken);
      setStatusModal({
        show: true,
        title: 'Error al sincronizar',
        steps: [{ label: error.message || 'Error en la operacion', status: 'error' }],
        type: 'error'
      });
    } finally {
      uploadLockRef.current = false;
      setIsUploading(false);
    }
  };

  const handleDelete = async (song, onComplete) => {
    if (!window.confirm(`¿Borrar permanentemente "${song.title}"?`)) return;

    const steps = [
      { label: 'Eliminando archivo MP3 (R2)', status: 'pending' },
      { label: 'Eliminando Portada (R2)', status: 'pending' },
      { label: 'Eliminando Fondo TV (R2)', status: 'pending' },
      { label: 'Limpiando registro en Supabase', status: 'pending' }
    ];
    setStatusModal({ show: true, title: 'Eliminando musica y archivos', steps, type: 'loading' });

    try {
      const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
      const getKey = (url) => (url?.includes(publicUrl) ? url.replace(`${publicUrl}/`, '') : null);

      const mp3Key = getKey(song.url);
      const coverKey = getKey(song.cover_url);
      const bgKey = getKey(song.background_url);

      updateStatusStep(0, 'active');
      if (mp3Key) await deleteFromR2(mp3Key);
      updateStatusStep(0, 'done');

      updateStatusStep(1, 'active');
      if (coverKey) await deleteFromR2(coverKey);
      updateStatusStep(1, 'done');

      updateStatusStep(2, 'active');
      if (bgKey) await deleteFromR2(bgKey);
      updateStatusStep(2, 'done');

      updateStatusStep(3, 'active');
      // Limpieza manual de referencias para evitar Conflict
      await supabase.from('playlist_songs').delete().eq('song_id', song.id);
      await supabase.from('likes').delete().eq('song_id', song.id);
      await supabase.from('profiles').update({ last_played_id: null }).eq('last_played_id', song.id);

      const { error } = await supabase.from('songs').delete().eq('id', song.id);
      if (error) throw error;
      updateStatusStep(3, 'done');

      setStatusModal((prev) => ({ ...prev, type: 'success' }));
      onComplete?.();
    } catch (error) {
      setStatusModal({
        show: true,
        title: 'Error al eliminar',
        steps: [{ label: error.message, status: 'error' }],
        type: 'error'
      });
    }
  };

  const handleUpdate = async ({ song, metadata, coverUrl, onComplete }) => {
    try {
      const { error } = await supabase
        .from('songs')
        .update({
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          genre: metadata.genre,
          year: metadata.year,
          lyrics: metadata.lyrics,
          cover_url: coverUrl,
          background_url: metadata.background_url
        })
        .eq('id', song.id);

      if (error) throw error;
      onComplete?.();
    } catch (err) {
      console.error('Error al actualizar:', err);
      alert('No se pudo actualizar la informacion.');
    }
  };

  const handleDeleteBulk = async (songsList, onComplete) => {
    if (!songsList || songsList.length === 0) return;
    if (!window.confirm(`¿Borrar permanentemente ${songsList.length} canciones y todos sus archivos?`)) return;

    const ids = songsList.map(s => s.id);
    const steps = [
      { label: 'Limpiando referencias (Perfil/Playlists/Likes)', status: 'pending' },
      { label: `Eliminando ${songsList.length} archivos de R2`, status: 'pending' },
      { label: 'Borrando registros finales de canciones', status: 'pending' }
    ];
    setStatusModal({ show: true, title: 'Borrando Lote Completo', steps, type: 'loading' });

    try {
      updateStatusStep(0, 'active');
      // 1. Limpiamos referencias para evitar el error 409 Conflict
      await supabase.from('playlist_songs').delete().in('song_id', ids);
      await supabase.from('likes').delete().in('song_id', ids);
      // Limpiamos el historial de reproducción de los perfiles
      await supabase.from('profiles').update({ last_played_id: null }).in('last_played_id', ids);
      updateStatusStep(0, 'done');

      updateStatusStep(1, 'active');
      const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
      const getKey = (url) => (url?.includes(publicUrl) ? url.replace(`${publicUrl}/`, '') : null);

      for (const song of songsList) {
        const keys = [getKey(song.url), getKey(song.cover_url), getKey(song.background_url)].filter(Boolean);
        for (const key of keys) {
          try { await deleteFromR2(key); } catch (e) { console.warn(`[R2] Fallo: ${key}`, e); }
        }
      }
      updateStatusStep(1, 'done');

      updateStatusStep(2, 'active');
      const { error } = await supabase.from('songs').delete().in('id', ids);
      if (error) throw error;
      updateStatusStep(2, 'done');

      setStatusModal((prev) => ({ ...prev, type: 'success' }));
      onComplete?.();
    } catch (error) {
      setStatusModal({
        show: true,
        title: 'Error en borrado masivo',
        steps: [{ label: error.message, status: 'error' }],
        type: 'error'
      });
    }
  };

  return {
    statusModal,
    setStatusModal,
    isUploading,
    handleUpload,
    handleUpdate,
    handleDelete,
    handleDeleteBulk,
    uploadSong
  };
}
