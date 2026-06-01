import { supabase } from '../supabaseClient'

export const AIRecommendations = {
  
  // Obtener recomendaciones híbridas personalizadas para el usuario
  async getRecommendations(userId, limit = 15) {
    try {
      // 1. Obtener historial reciente de reproducción de Supabase
      const { data: history, error: historyErr } = await supabase
        .from('play_history')
        .select('song_id, played_at')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(30);

      if (historyErr) throw historyErr;

      // 2. Traer todas las canciones disponibles para contrastar
      const { data: allSongs, error: songsErr } = await supabase
        .from('songs')
        .select('*');

      if (songsErr) throw songsErr;
      if (!allSongs || allSongs.length === 0) return [];

      // Si el historial está vacío, devolver las canciones más reproducidas o más nuevas por defecto
      if (!history || history.length === 0) {
        return allSongs
          .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
          .slice(0, limit);
      }

      // 3. Analizar perfil de escucha (frecuencias de género, BPM promedio y moods)
      const userProfile = {
        genres: {},
        moods: {},
        avgBpm: 0,
        bpmCount: 0
      };

      const historySongIds = history.map(h => h.song_id).filter(Boolean);
      const historySongs = allSongs.filter(s => historySongIds.includes(s.id));

      historySongs.forEach(song => {
        if (song.genre) {
          userProfile.genres[song.genre] = (userProfile.genres[song.genre] || 0) + 1;
        }
        if (song.mood) {
          userProfile.moods[song.mood] = (userProfile.moods[song.mood] || 0) + 1;
        }
        if (song.bpm) {
          userProfile.avgBpm += song.bpm;
          userProfile.bpmCount++;
        }
      });

      if (userProfile.bpmCount > 0) {
        userProfile.avgBpm = Math.round(userProfile.avgBpm / userProfile.bpmCount);
      } else {
        userProfile.avgBpm = 120; // Default
      }

      // 4. Calcular puntajes de afinidad para cada canción de la base de datos (excluyendo reproducidas recientemente)
      const scoredSongs = allSongs
        .filter(s => !historySongIds.includes(s.id)) // no recomendar lo que acaba de oír
        .map(song => {
          let score = 0;

          // Afinidades por Género (máximo +0.4)
          if (song.genre && userProfile.genres[song.genre]) {
            const freq = userProfile.genres[song.genre] / historySongs.length;
            score += Math.min(0.4, freq * 0.4);
          }

          // Afinidades por Mood (máximo +0.3)
          if (song.mood && userProfile.moods[song.mood]) {
            const freq = userProfile.moods[song.mood] / historySongs.length;
            score += Math.min(0.3, freq * 0.3);
          }

          // Proximidad de BPM (máximo +0.3)
          if (song.bpm && userProfile.avgBpm > 0) {
            const bpmDiff = Math.abs(song.bpm - userProfile.avgBpm);
            const bpmScore = Math.max(0, 1 - (bpmDiff / 40)); // tolerancia +-40bpm
            score += bpmScore * 0.3;
          }

          // Razón o justificación de recomendación
          let reason = 'Recomendado para ti';
          if (song.genre && userProfile.genres[song.genre] > 2) {
            reason = `Porque te encanta el género ${song.genre}`;
          } else if (song.mood && userProfile.moods[song.mood] > 2) {
            reason = `Canción ideal para tu estado de ánimo ${song.mood}`;
          }

          return {
            ...song,
            recoScore: score,
            recoReason: reason
          };
        });

      // 5. Ordenar por puntuación descendente y aplicar límites
      const recommendations = scoredSongs
        .sort((a, b) => b.recoScore - a.recoScore)
        .slice(0, limit);

      // 6. Almacenar temporalmente en Supabase ai_recommendations (caché optimizado para el usuario)
      try {
        const records = recommendations.map(rec => ({
          user_id: userId,
          song_id: rec.id,
          score: rec.recoScore,
          reason: rec.recoReason,
          algorithm: 'hybrid'
        }));

        if (records.length > 0) {
          // Limpiar caché vieja antes
          await supabase.from('ai_recommendations').delete().eq('user_id', userId);
          // Insertar nueva caché
          await supabase.from('ai_recommendations').insert(records);
        }
      } catch (cacheErr) {
        console.warn('[AI Recommendations] Error al guardar caché en la nube:', cacheErr);
      }

      return recommendations;
    } catch (err) {
      console.error('[AI Recommendations] Error general en recomendador:', err);
      return [];
    }
  }
}
