import { create } from 'zustand';
import { supabase } from '../supabaseClient';

export const useLibraryStore = create((set, get) => ({
  playlists: (() => {
    try {
      const cached = localStorage.getItem('musicfy_playlists_cache');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  })(),
  likedSongs: [], // Array of song UUIDs
  likedYtSongs: [], // Array of YouTube videoIds
  likedUrls: [], // Array of local song URLs
  dbSongs: [], // Cache de todas las canciones de Supabase
  isLoading: false,

  isSongLiked: (song) => {
    if (!song) return false;
    const { likedSongs, likedYtSongs, likedUrls } = get();
    if (likedSongs.includes(song.id)) return true;
    const yid = song.youtube_id || (song.source === 'youtube' ? song.id : null);
    if (yid && likedYtSongs && likedYtSongs.includes(yid)) return true;
    if (song.url && likedUrls && likedUrls.includes(song.url)) return true;
    return false;
  },

  fetchPlaylists: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Ya mostramos el caché al inicio, no hace falta poner isLoading: true si ya hay datos
    if (get().playlists.length === 0) set({ isLoading: true });

    try {
      // Fetch playlists con canciones en UNA SOLA consulta (Mucho más rápido)
      const { data, error } = await supabase
        .from('playlists')
        .select(`
          *,
          playlist_songs (
            position,
            songs (*)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const playlistsWithSongs = data.map(pl => ({
        ...pl,
        title: pl.name,
        songs: pl.playlist_songs
          ? pl.playlist_songs
              .sort((a, b) => a.position - b.position)
              .map(ps => ps.songs)
              .filter(Boolean)
          : []
      }));

      set({ playlists: playlistsWithSongs });
      localStorage.setItem('musicfy_playlists_cache', JSON.stringify(playlistsWithSongs));
    } catch (error) {
      console.error('Error fetching playlists:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchDbSongs: async () => {
    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formatted = data.map(s => ({
          ...s,
          source: s.source || 'local',
          is_local: s.source !== 'youtube'
        }));
        set({ dbSongs: formatted });
      }
    } catch (err) {
      console.warn('[LibraryStore] Error fetching db songs:', err);
    }
  },

  createPlaylist: async (name, description = '') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert('Debes iniciar sesión para crear playlists.');
        return null;
    }

    try {
      const { data, error } = await supabase
        .from('playlists')
        .insert([{
          user_id: user.id,
          name,
          is_public: false
        }])
        .select()
        .single();

      if (error) throw error;

      const newPlaylist = { ...data, title: data.name, songs: [] };
      const updatedPlaylists = [newPlaylist, ...get().playlists];
      set({ playlists: updatedPlaylists });
      localStorage.setItem('musicfy_playlists_cache', JSON.stringify(updatedPlaylists));
      return newPlaylist;
    } catch (error) {
      console.error('Error creando playlist:', error);
      alert(`Error al crear playlist: ${error.message || 'Verifica que hayas ejecutado el SQL en Supabase y tengas la extensión uuid-ossp activada.'}`);
      return null;
    }
  },

  deletePlaylist: async (id) => {
    try {
      // 1. Eliminar relaciones en playlist_songs primero (evita restricción de clave foránea)
      const { error: relError } = await supabase
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', id);

      if (relError) throw relError;

      // 2. Eliminar la playlist
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // 3. Actualizar estado y caché
      const updatedPlaylists = get().playlists.filter(pl => pl.id !== id);
      set({ playlists: updatedPlaylists });
      localStorage.setItem('musicfy_playlists_cache', JSON.stringify(updatedPlaylists));
    } catch (error) {
      console.error('Error deleting playlist:', error);
      alert(`Error al eliminar playlist: ${error.message}`);
    }
  },

  ensureSongInDb: async (song) => {
    if (!song) return null;
    const { stringToUuid, isUuid } = await import('../utils/uuidHelper');

    const isYouTube = song.source === 'youtube' || song.is_external;
    const yid = song.youtube_id || (isYouTube ? song.id : null);
    const validUuid = isUuid(song.id) ? song.id : stringToUuid(song.id || yid || song.url);

    // Verificar si la canción ya existe en la BD por ID
    const { data: existing } = await supabase
      .from('songs')
      .select('id')
      .eq('id', validUuid)
      .maybeSingle();

    if (existing) {
      return existing.id;
    }

    if (isYouTube && yid) {
      const { data: existingYt } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_id', yid)
        .maybeSingle();

      if (existingYt) return existingYt.id;
    }

    // Insertar nueva canción con UUID determinista
    const { data, error } = await supabase
      .from('songs')
      .upsert([{
        id: validUuid,
        title: song.title || 'Sin título',
        artist: song.artist || 'Artista Desconocido',
        url: song.url || (isYouTube && yid ? `https://www.youtube.com/watch?v=${yid}` : 'local_file'),
        cover_url: song.cover_url || '',
        background_url: song.background_url || song.cover_url || '',
        duration: song.duration || 0,
        lyrics: song.lyrics || '[Streaming]',
        source: isYouTube ? 'youtube' : (song.source || 'local'),
        youtube_id: isYouTube ? yid : null,
        is_video: song.is_video || false,
        video_url: song.video_url || (isYouTube && yid ? `https://www.youtube.com/watch?v=${yid}` : null)
      }], { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      console.error('[ensureSongInDb] Error registrando canción:', error);
      return validUuid;
    }

    const songId = data.id;
    const newSongObj = {
      ...data,
      source: data.source || 'youtube',
      is_local: data.source !== 'youtube'
    };

    set(state => ({
      dbSongs: [newSongObj, ...state.dbSongs.filter(s => s.id !== songId)]
    }));


    // Fetch and save lyrics asynchronously in the background if they weren't provided
    if (!song.lyrics && song.title) {
      (async () => {
        try {
          const cleanArtist = song.artist && song.artist !== 'Artista Desconocido' ? song.artist : '';
          let lrcUrl = cleanArtist 
            ? `https://lrclib.net/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(song.title)}`
            : `https://lrclib.net/api/search?q=${encodeURIComponent(song.title)}`;
          const res = await fetch(lrcUrl);
          if (res.ok) {
            const lrcData = await res.json();
            if (lrcData && lrcData.length > 0) {
              const fetchedLyrics = lrcData[0].syncedLyrics || lrcData[0].plainLyrics || null;
              if (fetchedLyrics) {
                await supabase
                  .from('songs')
                  .update({ lyrics: fetchedLyrics })
                  .eq('id', songId);
                console.log(`[ensureSongInDb] Letras descargadas y guardadas en segundo plano para: ${song.title}`);
              }
            }
          }
        } catch (e) {
          console.warn("[ensureSongInDb] Error al descargar letras en segundo plano:", e);
        }
      })();
    }

    return songId;
  },

  addSongToPlaylist: async (playlistId, song) => {
    try {
      const songId = await get().ensureSongInDb(song);
      if (!songId) throw new Error('No se pudo verificar o guardar la canción en la base de datos');

      // Get current max position
      const playlist = get().playlists.find(p => p.id === playlistId);
      const position = (playlist?.songs?.length || 0) + 1;

      const { error } = await supabase
        .from('playlist_songs')
        .insert([{
          playlist_id: playlistId,
          song_id: songId,
          position
        }]);

      if (error) throw error;

      // Update local state and cache
      const updatedPlaylists = get().playlists.map(p => {
        if (p.id === playlistId) {
          const fullSong = { ...song, id: songId }; 
          return { ...p, songs: [...p.songs, fullSong] };
        }
        return p;
      });
      set({ playlists: updatedPlaylists });
      localStorage.setItem('musicfy_playlists_cache', JSON.stringify(updatedPlaylists));
      return true;
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      throw error;
    }
  },

  removeSongFromPlaylist: async (playlistId, songId) => {
    try {
      const { error } = await supabase
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('song_id', songId);

      if (error) throw error;

      // Update local state and cache
      const updatedPlaylists = get().playlists.map(p => {
        if (p.id === playlistId) {
          return { ...p, songs: p.songs.filter(s => s.id !== songId) };
        }
        return p;
      });
      set({ playlists: updatedPlaylists });
      localStorage.setItem('musicfy_playlists_cache', JSON.stringify(updatedPlaylists));

      // Garbage Collector Check: si es de youtube y ya no está en ninguna playlist ni likes, borrar de la tabla songs
      const { data: songData } = await supabase
        .from('songs')
        .select('source')
        .eq('id', songId)
        .maybeSingle();

      if (songData && songData.source === 'youtube') {
        const { count: plCount } = await supabase
          .from('playlist_songs')
          .select('*', { count: 'exact', head: true })
          .eq('song_id', songId);

        const { count: likeCount } = await supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('song_id', songId);

        if ((plCount || 0) === 0 && (likeCount || 0) === 0) {
          console.log(`[GC] Eliminando canción huérfana de YouTube de la DB: ${songId}`);
          await supabase.from('songs').delete().eq('id', songId);
        }
      }
    } catch (error) {
      console.error('Error removing song from playlist:', error);
    }
  },

  fetchLikes: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('likes')
        .select(`
          song_id,
          songs (youtube_id, url)
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const likedIds = data.map(l => l.song_id);
      const likedYtIds = data.map(l => l.songs?.youtube_id).filter(Boolean);
      const likedUrls = data.map(l => l.songs?.url).filter(Boolean);

      set({ 
        likedSongs: likedIds,
        likedYtSongs: likedYtIds,
        likedUrls: likedUrls
      });
    } catch (error) {
      console.error('Error fetching likes:', error);
    }
  },

  toggleLike: async (songOrId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert('Debes iniciar sesión para guardar favoritos.');
        return;
    }

    let song = songOrId;
    if (typeof songOrId === 'string') {
      const { queue } = (await import('./usePlayerStore')).usePlayerStore.getState();
      const foundInQueue = queue.find(s => s.id === songOrId);
      if (foundInQueue) {
        song = foundInQueue;
      } else {
        const foundInLibrary = get().playlists.flatMap(p => p.songs).find(s => s.id === songOrId);
        if (foundInLibrary) {
          song = foundInLibrary;
        } else {
          if (songOrId.length === 36) {
            const { data: dbSong } = await supabase
              .from('songs')
              .select('*')
              .eq('id', songOrId)
              .maybeSingle();
            if (dbSong) {
              song = {
                ...dbSong,
                source: dbSong.source || 'local'
              };
            } else {
              song = { id: songOrId };
            }
          } else {
            song = { id: songOrId };
          }
        }
      }
    }

    const { likedSongs, likedYtSongs, likedUrls } = get();
    
    let isLiked = false;
    let dbSongId = null;
    
    const isYouTube = song.source === 'youtube' || song.is_external;
    const yid = song.youtube_id || (isYouTube ? song.id : null);

    try {
      // 1. Buscar si la canción ya existe en la base de datos de Supabase
      let songIdInDb = null;
      if (isYouTube && yid) {
        const { data: existingSong } = await supabase
          .from('songs')
          .select('id')
          .eq('youtube_id', yid)
          .maybeSingle();
        if (existingSong) songIdInDb = existingSong.id;
      } else if (song.id && song.id.length === 36) {
        songIdInDb = song.id;
      } else if (song.url) {
        const { data: existingSong } = await supabase
          .from('songs')
          .select('id')
          .eq('url', song.url)
          .maybeSingle();
        if (existingSong) songIdInDb = existingSong.id;
      }

      // 2. Si existe la canción, ver si tiene un Like activo
      if (songIdInDb) {
        const { data: existingLike } = await supabase
          .from('likes')
          .select('song_id')
          .eq('user_id', user.id)
          .eq('song_id', songIdInDb)
          .maybeSingle();
          
        if (existingLike) {
          isLiked = true;
          dbSongId = songIdInDb;
        }
      }

      if (isLiked && dbSongId) {
        // Eliminar Like
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('song_id', dbSongId);

        if (error) throw error;

        const updatedLikedSongs = likedSongs.filter(id => id !== dbSongId);
        const updatedLikedYt = yid ? likedYtSongs.filter(id => id !== yid) : likedYtSongs;
        const updatedLikedUrls = song.url ? likedUrls.filter(u => u !== song.url) : likedUrls;

        set({ 
          likedSongs: updatedLikedSongs,
          likedYtSongs: updatedLikedYt,
          likedUrls: updatedLikedUrls
        });

        // Garbage Collector Check para canciones de YouTube
        const { data: songData } = await supabase
          .from('songs')
          .select('source')
          .eq('id', dbSongId)
          .maybeSingle();

        if (songData && songData.source === 'youtube') {
          const { count: plCount } = await supabase
            .from('playlist_songs')
            .select('*', { count: 'exact', head: true })
            .eq('song_id', dbSongId);

          const { count: likeCount } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('song_id', dbSongId);

          if ((plCount || 0) === 0 && (likeCount || 0) === 0) {
            console.log(`[GC] Eliminando canción huérfana de YouTube (post-unlike) de la DB: ${dbSongId}`);
            await supabase.from('songs').delete().eq('id', dbSongId);
          }
        }
      } else {
        // Agregar Like
        let finalSongId = song.id;
        if (typeof song !== 'string') {
            finalSongId = await get().ensureSongInDb(song);
        }
        
        if (!finalSongId) return;

        const { error } = await supabase
          .from('likes')
          .insert([{
            user_id: user.id,
            song_id: finalSongId
          }]);

        if (error) throw error;

        set({ 
          likedSongs: [...likedSongs, finalSongId],
          likedYtSongs: yid ? [...likedYtSongs, yid] : likedYtSongs,
          likedUrls: song.url ? [...likedUrls, song.url] : likedUrls
        });
      }
      
      // Sincronizar useSettingsStore
      const { useSettingsStore } = await import('./useSettingsStore');
      useSettingsStore.setState({ likedSongs: get().likedSongs });

    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }
}));
