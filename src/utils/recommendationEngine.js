/**
 * Musicfy Smart Taste & Recommendation Agent
 * Rastrear reproducciones de usuario, perfilar sus gustos y generar mixes dinámicos.
 */

const HISTORY_KEY = 'musicfy_play_history';
const PROFILE_KEY = 'musicfy_taste_profile';

export const recommendationEngine = {
  // Registrar una reproducción de canción
  recordPlay(songId, allSongs = []) {
    if (!songId || allSongs.length === 0) return;

    // 1. Cargar historial
    let history = [];
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      history = stored ? JSON.parse(stored) : [];
    } catch (e) {
      history = [];
    }

    // Agregar nueva entrada al inicio
    history.unshift({ songId, timestamp: Date.now() });
    
    // Limitar el historial a 100 elementos
    history = history.slice(0, 100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    // 2. Analizar gustos y actualizar perfil
    const songMap = new Map(allSongs.map(s => [s.id, s]));
    const artistCounts = {};
    const genreCounts = {};

    history.forEach(item => {
      const song = songMap.get(item.songId);
      if (song) {
        if (song.artist) {
          artistCounts[song.artist] = (artistCounts[song.artist] || 0) + 1;
        }
        if (song.genre) {
          genreCounts[song.genre] = (genreCounts[song.genre] || 0) + 1;
        }
      }
    });

    // Ordenar y tomar los tops
    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    const profile = {
      topArtists,
      topGenres,
      lastPlayedId: songId,
      updatedAt: Date.now()
    };

    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    console.log('[Agent] Perfil de gustos actualizado:', profile);
  },

  // Obtener el saludo según la hora local
  getGreeting() {
    const hours = new Date().getHours();
    if (hours < 12) return 'Buenos días';
    if (hours < 19) return 'Buenas tardes';
    return 'Buenas noches';
  },

  // Obtener el perfil de gustos guardado
  getProfile() {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      return stored ? JSON.parse(stored) : { topArtists: [], topGenres: [] };
    } catch {
      return { topArtists: [], topGenres: [] };
    }
  },

  // Generar la rejilla de los 6 accesos directos superiores
  getTopGrid(allSongs = [], likedIds = [], playlists = []) {
    if (allSongs.length === 0) return [];
    
    const profile = this.getProfile();
    const songMap = new Map(allSongs.map(s => [s.id, s]));
    const gridItems = [];

    // 1. Tus Favoritos (Liked Songs)
    const favoriteSongs = allSongs.filter(s => likedIds.includes(s.id));
    gridItems.push({
      id: 'liked_songs',
      title: 'Tus favoritos',
      type: 'liked',
      coverUrl: favoriteSongs[0]?.cover_url || null, // Se puede usar gradiente en UI
      songs: favoriteSongs
    });

    // 2. Recientes (Recently Played)
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {}
    
    // Obtener las últimas canciones únicas de historial
    const uniqueHistoryIds = [...new Set(history.map(h => h.songId))].slice(0, 20);
    const recentSongs = uniqueHistoryIds.map(id => songMap.get(id)).filter(Boolean);

    gridItems.push({
      id: 'recently_played',
      title: 'Recientes',
      type: 'recent',
      coverUrl: recentSongs[0]?.cover_url || '/icon.png',
      songs: recentSongs.length > 0 ? recentSongs : allSongs.slice(0, 10)
    });

    // 3. Playlist del Top Artista
    if (profile.topArtists && profile.topArtists.length > 0) {
      const topArtist = profile.topArtists[0];
      const artistSongs = allSongs.filter(s => s.artist === topArtist);
      gridItems.push({
        id: `artist_mix_${encodeURIComponent(topArtist)}`,
        title: `Mix de ${topArtist}`,
        type: 'artist_mix',
        coverUrl: artistSongs[0]?.cover_url || null,
        songs: artistSongs
      });
    } else {
      // Placeholder si no hay historial
      const randomArtist = allSongs[Math.floor(Math.random() * allSongs.length)]?.artist || 'Vibe';
      const artistSongs = allSongs.filter(s => s.artist === randomArtist);
      gridItems.push({
        id: 'vibe_mix',
        title: `Vibe Mix`,
        type: 'artist_mix',
        coverUrl: artistSongs[0]?.cover_url || null,
        songs: artistSongs
      });
    }

    // 4. Playlist del Top Género
    if (profile.topGenres && profile.topGenres.length > 0) {
      const topGenre = profile.topGenres[0];
      const genreSongs = allSongs.filter(s => s.genre === topGenre);
      gridItems.push({
        id: `genre_mix_${encodeURIComponent(topGenre)}`,
        title: `Mix ${topGenre}`,
        type: 'genre_mix',
        coverUrl: genreSongs[0]?.cover_url || null,
        songs: genreSongs
      });
    } else {
      gridItems.push({
        id: 'daily_mix_1',
        title: 'Mix Diario 1',
        type: 'daily_mix',
        coverUrl: allSongs[1]?.cover_url || null,
        songs: allSongs.slice(0, 15)
      });
    }

    // 5 y 6. Añadir playlists creadas por el usuario, o en su defecto Mixes temáticos
    let playlistIndex = 0;
    while (gridItems.length < 6) {
      if (playlists && playlists[playlistIndex]) {
        const pl = playlists[playlistIndex];
        gridItems.push({
          id: `playlist_${pl.id}`,
          title: pl.title,
          type: 'user_playlist',
          coverUrl: pl.songs?.[0]?.cover_url || null,
          songs: pl.songs || []
        });
        playlistIndex++;
      } else {
        // Rellenar con mezclas genéricas
        const idx = gridItems.length + 1;
        gridItems.push({
          id: `daily_mix_${idx}`,
          title: idx === 5 ? 'Sad Songs' : 'Travel List',
          type: 'daily_mix',
          coverUrl: allSongs[(idx * 3) % allSongs.length]?.cover_url || null,
          songs: allSongs.slice((idx * 2) % allSongs.length, ((idx * 2) % allSongs.length) + 12)
        });
      }
    }

    return gridItems.slice(0, 6);
  },

  // Generar mixes inteligentes (para carrusel recomendado)
  getMixes(allSongs = []) {
    if (allSongs.length === 0) return [];
    
    const profile = this.getProfile();
    const mixes = [];

    // Mix 1: Mix de tu Artista Favorito
    if (profile.topArtists && profile.topArtists.length > 0) {
      const art = profile.topArtists[0];
      mixes.push({
        id: 'mix_art_1',
        title: `Mix de ${art}`,
        description: `Disfruta de ${art} y artistas similares en esta selección.`,
        coverUrl: allSongs.find(s => s.artist === art)?.cover_url || '/icon.png',
        songs: allSongs.filter(s => s.artist === art)
      });
    }

    // Mix 2: Mix de tu Segundo Artista Favorito
    if (profile.topArtists && profile.topArtists.length > 1) {
      const art = profile.topArtists[1];
      mixes.push({
        id: 'mix_art_2',
        title: `Mix de ${art}`,
        description: `Lo mejor de ${art} combinado con recomendaciones frescas.`,
        coverUrl: allSongs.find(s => s.artist === art)?.cover_url || '/icon.png',
        songs: allSongs.filter(s => s.artist === art)
      });
    }

    // Mix 3: Mix de tu Género Favorito
    if (profile.topGenres && profile.topGenres.length > 0) {
      const gen = profile.topGenres[0];
      mixes.push({
        id: 'mix_gen_1',
        title: `Mix ${gen}`,
        description: `Tu dosis diaria de ritmo ${gen} personalizada.`,
        coverUrl: allSongs.find(s => s.genre === gen)?.cover_url || '/icon.png',
        songs: allSongs.filter(s => s.genre === gen)
      });
    }

    // Mix 4: Mix de tu Segundo Género Favorito
    if (profile.topGenres && profile.topGenres.length > 1) {
      const gen = profile.topGenres[1];
      mixes.push({
        id: 'mix_gen_2',
        title: `Mix ${gen}`,
        description: `Grandes éxitos de ${gen} seleccionados especialmente.`,
        coverUrl: allSongs.find(s => s.genre === gen)?.cover_url || '/icon.png',
        songs: allSongs.filter(s => s.genre === gen)
      });
    }

    // Si tenemos menos de 4 mixes, rellenamos con mixes temáticos/diarios
    const defaultMixTypes = [
      { title: 'Mix Melancólico', desc: 'Melodías suaves para relajarte.', genre: 'Sad' },
      { title: 'Mix Energía', desc: 'Sube el volumen y motívate con este ritmo.', genre: 'Electronic' },
      { title: 'Mix de Viaje', desc: 'Acompaña tu camino con la mejor música.', genre: 'Pop' }
    ];

    let typeIdx = 0;
    while (mixes.length < 4 && typeIdx < defaultMixTypes.length) {
      const type = defaultMixTypes[typeIdx];
      const matchSongs = allSongs.filter(s => s.genre?.toLowerCase().includes(type.genre.toLowerCase()) || s.title?.toLowerCase().includes(type.genre.toLowerCase()));
      const songs = matchSongs.length > 0 ? matchSongs : allSongs.slice(typeIdx * 3, (typeIdx * 3) + 10);
      mixes.push({
        id: `default_mix_${typeIdx}`,
        title: type.title,
        description: type.desc,
        coverUrl: songs[0]?.cover_url || '/icon.png',
        songs
      });
      typeIdx++;
    }

    return mixes;
  },

  // Obtener historial de canciones reproducidas ordenadas
  getRecentlyPlayed(allSongs = []) {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {}

    const songMap = new Map(allSongs.map(s => [s.id, s]));
    const list = [];
    const seen = new Set();

    history.forEach(item => {
      const song = songMap.get(item.songId);
      if (song && !seen.has(song.id)) {
        seen.add(song.id);
        list.push(song);
      }
    });

    return list.slice(0, 12);
  },

  // Obtener recomendaciones de canciones individuales (que no estén en historial reciente)
  getRecommendedTracks(allSongs = [], likedIds = []) {
    if (allSongs.length === 0) return [];
    
    const profile = this.getProfile();
    const recent = this.getRecentlyPlayed(allSongs);
    const recentIds = new Set(recent.map(s => s.id));

    // Filtrar canciones que ya ha escuchado mucho recientemente
    let candidates = allSongs.filter(s => !recentIds.has(s.id));
    if (candidates.length === 0) candidates = allSongs;

    // Si tiene género favorito, ordenar priorizando ese género
    if (profile.topGenres && profile.topGenres.length > 0) {
      const favoriteGenre = profile.topGenres[0];
      candidates.sort((a, b) => {
        const aMatch = a.genre === favoriteGenre ? 1 : 0;
        const bMatch = b.genre === favoriteGenre ? 1 : 0;
        return bMatch - aMatch;
      });
    }

    return candidates.slice(0, 10);
  }
};
