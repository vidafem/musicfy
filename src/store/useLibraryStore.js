import { create } from 'zustand';
import { supabase } from '../supabaseClient';

export const useLibraryStore = create((set, get) => ({
  playlists: (() => {
    try {
      const cached = localStorage.getItem('musicfy_playlists_cache');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  })(),
  likedSongs: [], // Array of song IDs
  isLoading: false,

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
      set((state) => ({ playlists: [newPlaylist, ...state.playlists] }));
      return newPlaylist;
    } catch (error) {
      console.error('Error creando playlist:', error);
      alert(`Error al crear playlist: ${error.message || 'Verifica que hayas ejecutado el SQL en Supabase y tengas la extensión uuid-ossp activada.'}`);
      return null;
    }
  },

  deletePlaylist: async (id) => {
    try {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        playlists: state.playlists.filter(pl => pl.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting playlist:', error);
    }
  },

  ensureSongInDb: async (song) => {
    // If it already has a UUID, we assume it's in the DB
    if (song.id && song.id.length === 36) { // Basic UUID check
        return song.id;
    }

    // Check by URL or Title/Artist
    const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('url', song.url)
        .maybeSingle();

    if (existing) return existing.id;

    // Insert new song
    const { data, error } = await supabase
        .from('songs')
        .insert([{
            title: song.title,
            artist: song.artist,
            url: song.url,
            cover_url: song.cover_url,
            duration: song.duration || 0,
            lyrics: song.lyrics || '[Streaming]'
        }])
        .select('id')
        .single();

    if (error) {
        console.error('Error ensuring song in DB:', error);
        return null;
    }
    return data.id;
  },

  addSongToPlaylist: async (playlistId, song) => {
    try {
      const songId = await get().ensureSongInDb(song);
      if (!songId) return;

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

      // Update local state
      set((state) => ({
        playlists: state.playlists.map(p => {
          if (p.id === playlistId) {
            // We need the full song object for the UI
            // If the song passed already has metadata, use it. 
            // If it was just an ID, we'd need to fetch it, but here we usually have the object.
            const fullSong = { ...song, id: songId }; 
            return { ...p, songs: [...p.songs, fullSong] };
          }
          return p;
        })
      }));
    } catch (error) {
      console.error('Error adding song to playlist:', error);
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

      set((state) => ({
        playlists: state.playlists.map(p => {
          if (p.id === playlistId) {
            return { ...p, songs: p.songs.filter(s => s.id !== songId) };
          }
          return p;
        })
      }));
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
        .select('song_id')
        .eq('user_id', user.id);

      if (error) throw error;

      set({ likedSongs: data.map(l => l.song_id) });
    } catch (error) {
      console.error('Error fetching likes:', error);
    }
  },

  toggleLike: async (song) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert('Debes iniciar sesión para guardar favoritos.');
        return;
    }

    const { likedSongs } = get();
    // We need to handle both song objects and just IDs for UI compatibility
    const songId = typeof song === 'string' ? song : song.id;
    const isLiked = likedSongs.includes(songId);

    try {
      if (isLiked) {
        // Remove like
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('song_id', songId);

        if (error) throw error;

        set({ likedSongs: likedSongs.filter(id => id !== songId) });
      } else {
        // Add like
        // Ensure song is in DB first if it's an object
        let finalSongId = songId;
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

        set({ likedSongs: [...likedSongs, finalSongId] });
      }
      
      // Update useSettingsStore to keep it in sync (since UI might still use it)
      const { useSettingsStore } = await import('./useSettingsStore');
      useSettingsStore.setState({ likedSongs: get().likedSongs });

    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }
}));
