import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Hook para manejar likes (canciones favoritas) con Supabase
 * Reemplaza la lógica de localStorage con persistencia en la base de datos
 */
export const useSupabaseLikes = () => {
  const [likedSongs, setLikedSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  // Obtener usuario y cargar likes
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) fetchLikes(user.id);
    };
    getUser();
  }, []);

  // Cargar likes del usuario
  const fetchLikes = async (userId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('song_id')
        .eq('user_id', userId);

      if (error) throw error;
      setLikedSongs((data || []).map(like => like.song_id));
    } catch (err) {
      console.error('Error cargando likes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle like
  const toggleLike = async (songId) => {
    if (!user) return false;

    const isLiked = likedSongs.includes(songId);

    try {
      if (isLiked) {
        // Remover like
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('song_id', songId);

        if (error) throw error;
        setLikedSongs(prev => prev.filter(id => id !== songId));
      } else {
        // Agregar like
        const { error } = await supabase
          .from('likes')
          .insert([
            {
              user_id: user.id,
              song_id: songId
            }
          ]);

        if (error) throw error;
        setLikedSongs(prev => [...prev, songId]);
      }
      return true;
    } catch (err) {
      console.error('Error toggling like:', err);
      return false;
    }
  };

  // Agregar múltiples likes
  const addMultipleLikes = async (songIds) => {
    if (!user) return false;
    try {
      const newLikes = songIds
        .filter(id => !likedSongs.includes(id))
        .map(song_id => ({ user_id: user.id, song_id }));

      if (newLikes.length === 0) return true;

      const { error } = await supabase
        .from('likes')
        .insert(newLikes);

      if (error) throw error;
      await fetchLikes(user.id);
      return true;
    } catch (err) {
      console.error('Error adding multiple likes:', err);
      return false;
    }
  };

  return {
    likedSongs,
    loading,
    user,
    toggleLike,
    addMultipleLikes,
    fetchLikes: () => user && fetchLikes(user.id)
  };
};
