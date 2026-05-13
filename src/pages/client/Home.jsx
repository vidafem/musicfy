import React, { useState, useMemo, useEffect } from 'react';
import { Play, Pause, Heart, ChevronRight } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import './Home.css';

/**
 * PÁGINA DE INICIO - DISEÑO ESTILO SPOTIFY
 * 
 * Características:
 * - Fondo dinámico que cambia según el artista destacado
 * - Playlists inteligentes agrupadas por artista
 * - Solo contenido personalizado (sin todas las canciones)
 * - Alternancia de fotos y nombres en playlists
 */
export default function Home() {
  const queue = usePlayerStore(state => state.queue);
  const currentSong = usePlayerStore(state => state.currentSong);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playSong = usePlayerStore(state => state.playSong);
  const togglePlay = usePlayerStore(state => state.togglePlay);
  const playbackHistory = usePlayerStore(state => state.playbackHistory);
  
  const likedSongs = useLibraryStore(state => state.likedSongs);
  const toggleLike = useLibraryStore(state => state.toggleLike);

  // Estado para alternar fotos/nombres en artistas
  const [artistDisplayMode, setArtistDisplayMode] = useState({});

  // ==========================================
  // LÓGICA INTELIGENTE: Agrupar por artista
  // ==========================================
  const artistPlaylists = useMemo(() => {
    if (!queue.length) return [];

    // Agrupar canciones por artista
    const grouped = {};
    queue.forEach(song => {
      if (!grouped[song.artist]) {
        grouped[song.artist] = [];
      }
      grouped[song.artist].push(song);
    });

    // Convertir a array y ordenar por cantidad de canciones (artistas más escuchados primero)
    return Object.entries(grouped)
      .map(([artist, songs]) => ({
        artist,
        songs: songs.slice(0, 6), // Mostrar máximo 6 canciones por artista
        totalSongs: songs.length,
        coverUrl: songs[0]?.cover_url, // Usar la portada del primer track
        backgroundUrl: songs[0]?.background_url // Para el fondo dinámico
      }))
      .sort((a, b) => {
        // Priorizar artistas escuchados recientemente
        const aRecent = playbackHistory.filter(s => s.artist === a.artist).length;
        const bRecent = playbackHistory.filter(s => s.artist === b.artist).length;
        return bRecent - aRecent;
      })
      .slice(0, 8); // Mostrar máximo 8 artistas
  }, [queue, playbackHistory]);

  // ==========================================
  // RECOMENDACIONES: Basadas en canciones más escuchadas
  // ==========================================
  const recommendations = useMemo(() => {
    if (!playbackHistory.length) return queue.slice(0, 8);

    // Contar frecuencia de canciones
    const songFreq = {};
    playbackHistory.forEach(song => {
      songFreq[song.id] = (songFreq[song.id] || 0) + 1;
    });

    // Ordenar por frecuencia
    return queue
      .filter(song => songFreq[song.id])
      .sort((a, b) => (songFreq[b.id] || 0) - (songFreq[a.id] || 0))
      .slice(0, 8);
  }, [playbackHistory, queue]);

  // ==========================================
  // FAVORITOS: Canciones marcadas con corazón
  // ==========================================
  const favoritesSongs = useMemo(() => {
    return queue.filter(song => likedSongs.includes(song.id)).slice(0, 8);
  }, [queue, likedSongs]);

  // ==========================================
  // FONDO DINÁMICO
  // ==========================================
  const dynamicBackground = useMemo(() => {
    // Usar background_url de la canción actual o del artista destacado
    if (currentSong?.background_url) {
      return currentSong.background_url;
    }
    if (artistPlaylists.length > 0 && artistPlaylists[0].backgroundUrl) {
      return artistPlaylists[0].backgroundUrl;
    }
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  }, [currentSong, artistPlaylists]);

  // ==========================================
  // HANDLERS
  // ==========================================
  const handleSongClick = (song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      playSong(song);
    }
  };

  const toggleArtistMode = (artist) => {
    setArtistDisplayMode(prev => ({
      ...prev,
      [artist]: !prev[artist]
    }));
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="home-page">
      {/* Fondo dinámico con gradiente */}
      <div 
        className="home-hero-background" 
        style={{
          backgroundImage: typeof dynamicBackground === 'string'
            ? dynamicBackground.includes('linear')
              ? dynamicBackground
              : `url('${dynamicBackground}')`
            : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="home-hero-overlay"></div>
      </div>

      {/* Contenido principal */}
      <div className="home-content-scroll">
        {/* SECCIÓN: REPRODUCIENDO AHORA */}
        {currentSong && (
          <section className="home-hero-section">
            <div className="home-hero-content">
              <div className="home-hero-cover">
                <img src={currentSong.cover_url} alt={currentSong.title} />
                <button 
                  className="home-hero-play-btn"
                  onClick={() => togglePlay()}
                >
                  {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" />}
                </button>
              </div>
              <div className="home-hero-info">
                <span className="home-label">REPRODUCIENDO AHORA</span>
                <h1 className="home-current-title">{currentSong.title}</h1>
                <p className="home-current-artist">{currentSong.artist}</p>
                <button 
                  className={`home-like-btn ${likedSongs.includes(currentSong.id) ? 'liked' : ''}`}
                  onClick={() => toggleLike(currentSong.id)}
                >
                  <Heart size={20} fill={likedSongs.includes(currentSong.id) ? 'currentColor' : 'none'} />
                  {likedSongs.includes(currentSong.id) ? 'Te encanta' : 'Me encanta'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* SECCIÓN: ARTISTAS DESTACADOS */}
        {artistPlaylists.length > 0 && (
          <section className="home-section">
            <h2 className="home-section-title">Tus Artistas Favoritos</h2>
            <div className="home-artists-grid">
              {artistPlaylists.map((playlist) => {
                const showCover = artistDisplayMode[playlist.artist] ?? true;
                return (
                  <div 
                    key={playlist.artist} 
                    className="home-artist-card"
                    onClick={() => toggleArtistMode(playlist.artist)}
                  >
                    <div className={`home-artist-visual ${showCover ? 'show-cover' : 'show-name'}`}>
                      {showCover ? (
                        <>
                          <img src={playlist.coverUrl} alt={playlist.artist} className="home-artist-cover" />
                          <div className="home-artist-overlay"></div>
                        </>
                      ) : (
                        <div className="home-artist-name-display">
                          <h3>{playlist.artist}</h3>
                          <span>{playlist.totalSongs} canciones</span>
                        </div>
                      )}
                    </div>
                    <div className="home-artist-footer">
                      <span className="home-artist-title">{playlist.artist}</span>
                      <ChevronRight size={18} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SECCIÓN: CANCIONES RECOMENDADAS (Basadas en reproducción) */}
        {recommendations.length > 0 && (
          <section className="home-section">
            <h2 className="home-section-title">Recomendado Para Ti</h2>
            <div className="home-songs-carousel">
              {recommendations.map((song) => {
                const isActive = currentSong?.id === song.id;
                return (
                  <div
                    key={song.id}
                    className={`home-song-card ${isActive ? 'active' : ''}`}
                    onClick={() => handleSongClick(song)}
                  >
                    <div className="home-song-cover-wrapper">
                      <img src={song.cover_url} alt={song.title} className="home-song-cover" />
                      <div className="home-song-play-overlay">
                        {isActive && isPlaying ? (
                          <div className="home-mini-bars">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        ) : (
                          <Play size={20} fill="white" />
                        )}
                      </div>
                    </div>
                    <div className="home-song-info">
                      <h4 className="home-song-title">{song.title}</h4>
                      <p className="home-song-artist">{song.artist}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SECCIÓN: TUS FAVORITOS */}
        {favoritesSongs.length > 0 && (
          <section className="home-section">
            <h2 className="home-section-title">Tus Favoritos ❤️</h2>
            <div className="home-songs-list">
              {favoritesSongs.map((song, index) => {
                const isActive = currentSong?.id === song.id;
                return (
                  <div
                    key={song.id}
                    className={`home-list-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSongClick(song)}
                  >
                    <span className="home-list-index">{index + 1}</span>
                    <div className="home-list-cover">
                      <img src={song.cover_url} alt={song.title} />
                    </div>
                    <div className="home-list-info">
                      <h4 className="home-list-title">{song.title}</h4>
                      <p className="home-list-artist">{song.artist}</p>
                    </div>
                    <button
                      className={`home-list-like ${likedSongs.includes(song.id) ? 'liked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(song.id);
                      }}
                    >
                      <Heart size={16} fill={likedSongs.includes(song.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* MENSAJE VACÍO */}
        {queue.length === 0 && (
          <div className="home-empty-state">
            <div className="home-empty-icon">🎵</div>
            <h3>Aquí no hay nada todavía</h3>
            <p>Sube tus primeras canciones desde el panel de administración</p>
          </div>
        )}
      </div>
    </div>
  );
}
