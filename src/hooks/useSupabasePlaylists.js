import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Hook para manejar playlists con Supabase
 * Reemplaza la lógica de localStorage con persistencia en la base de datos
 */
export const useSupabasePlaylists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  // Obtener usuario actual
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) fetchPlaylists(user.id);
    };
    getUser();
  }, []);

  // Cargar playlists del usuario
  const fetchPlaylists = async (userId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('playlists')
        .select(`
          *,
          playlist_songs(song_id, position)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (err) throw err;

      // Transformar datos: obtener detalles de canciones
      const playlistsWithSongs = await Promise.all(
        (data || []).map(async (playlist) => {
          const songIds = playlist.playlist_songs.map(ps => ps.song_id);
          let songs = [];
          
          if (songIds.length > 0) {
            const { data: songData } = await supabase
              .from('songs')
              .select('*')
              .in('id', songIds);
            songs = songData || [];
          }

          return {
            ...playlist,
            songs: songs,
            covers: songs.slice(0, 4).map(s => s.cover_url).filter(Boolean)
          };
        })
      );

      setPlaylists(playlistsWithSongs);
    } catch (err) {
      setError(err.message);
      console.error('Error cargando playlists:', err);
    } finally {
      setLoading(false);
    }
  };

  // Crear playlist
  const createPlaylist = async (name, description = '') => {
    if (!user) return null;
    try {
      const { data, error: err } = await supabase
        .from('playlists')
        .insert([
          {
            user_id: user.id,
            name,
            description: description || 'Lista personalizada',
            is_public: false
          }
        ])
        .select()
        .single();

      if (err) throw err;
      await fetchPlaylists(user.id);
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Error creando playlist:', err);
      return null;
    }
  };

  // Eliminar playlist
  const deletePlaylist = async (playlistId) => {
    if (!user) return false;
    try {
      const { error: err } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId)
        .eq('user_id', user.id);

      if (err) throw err;
      await fetchPlaylists(user.id);
      return true;
    } catch (err) {
      setError(err.message);
      console.error('Error eliminando playlist:', err);
      return false;
    }
  };

  // Actualizar nombre/descripción de playlist
  const updatePlaylist = async (playlistId, updates) => {
    if (!user) return false;
    try {
      const { error: err } = await supabase
        .from('playlists')
        .update({
          ...updates,
          updated_at: new Date()
        })
        .eq('id', playlistId)
        .eq('user_id', user.id);

      if (err) throw err;
      await fetchPlaylists(user.id);
      return true;
    } catch (err) {
      setError(err.message);
      console.error('Error actualizando playlist:', err);
      return false;
    }
  };

  // Agregar canción a playlist
  const addSongToPlaylist = async (playlistId, songId) => {
    if (!user) return false;
    try {
      // Obtener la máxima posición actual
      const { data: posData } = await supabase
        .from('playlist_songs')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      const nextPosition = (posData?.position ?? -1) + 1;

      const { error: err } = await supabase
        .from('playlist_songs')
        .insert([
          {
            playlist_id: playlistId,
            song_id: songId,
            position: nextPosition
          }
        ]);

      if (err) throw err;
      await fetchPlaylists(user.id);
      return true;
    } catch (err) {
      setError(err.message);
      console.error('Error agregando canción:', err);
      return false;
    }
  };

  // Eliminar canción de playlist
  const removeSongFromPlaylist = async (playlistId, songId) => {
    if (!user) return false;
    try {
      const { error: err } = await supabase
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('song_id', songId);

      if (err) throw err;
      await fetchPlaylists(user.id);
      return true;
    } catch (err) {
      setError(err.message);
      console.error('Error removiendo canción:', err);
      return false;
    }
  };

  return {
    playlists,
    loading,
    error,
    user,
    createPlaylist,
    deletePlaylist,
    updatePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    fetchPlaylists: () => user && fetchPlaylists(user.id)
  };
};
