import React, { useState, useMemo } from 'react';
import { Heart, Plus, ChevronRight, Music, ListMusic, Play } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import './Library.css';

/**
 * BIBLIOTECA PERSONAL DEL USUARIO
 * 
 * No muestra todas las canciones del sistema.
 * Muestra carpetas personales: Me Gusta y Playlists creadas por el usuario.
 */
export default function Library() {
  const [showLiked, setShowLiked] = useState(false);
  
  // OPTIMIZACIÓN: Selectores para evitar re-renders innecesarios
  const queue = usePlayerStore(state => state.queue);
  const currentSong = usePlayerStore(state => state.currentSong);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playSong = usePlayerStore(state => state.playSong);
  const togglePlay = usePlayerStore(state => state.togglePlay);

  const likedSongs = useSettingsStore(state => state.likedSongs);
  const toggleLike = useSettingsStore(state => state.toggleLike);

  // OPTIMIZACIÓN: Memoizar la lista de favoritos para no filtrar en cada renderizado
  const likedList = useMemo(() => {
    return queue.filter(s => likedSongs.includes(s.id));
  }, [queue, likedSongs]);

  const handleSongClick = (song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      playSong(song);
    }
  };

  return (
    <div className="library-page">

      {/* Encabezado */}
      <div className="library-header">
        <h1 className="library-title">Tu Biblioteca</h1>
      </div>

      {/* Botón crear playlist */}
      <button className="library-new-playlist-btn">
        <div className="new-playlist-icon"><Plus size={22} /></div>
        <div className="new-playlist-text">
          <span className="new-playlist-label">Nueva Playlist</span>
          <span className="new-playlist-sub">Crea una lista personalizada</span>
        </div>
        <ChevronRight size={18} className="new-playlist-arrow" />
      </button>

      <div className="library-section-title">Colecciones</div>

      {/* Carpeta Me Gusta */}
      <div className="library-folder" onClick={() => setShowLiked(!showLiked)}>
        <div className="folder-icon liked-icon">
          <Heart size={22} fill="currentColor" />
        </div>
        <div className="folder-info">
          <span className="folder-name">Me Gusta</span>
          <span className="folder-count">{likedList.length} canciones</span>
        </div>
        <ChevronRight
          size={18}
          className={`folder-arrow ${showLiked ? 'open' : ''}`}
        />
      </div>

      {/* Lista expandible de Me Gusta */}
      {showLiked && (
        <div className="library-liked-list">
          {likedList.length === 0 ? (
            <div className="library-empty-inline">
              <Heart size={28} />
              <p>Aún no has marcado canciones.<br />
                <span>Presiona ❤️ en el reproductor para agregar.</span>
              </p>
            </div>
          ) : (
            likedList.map((song) => {
              const isActive = currentSong?.id === song.id;
              return (
                <div
                  key={song.id}
                  className={`liked-song-row ${isActive ? 'active' : ''}`}
                  onClick={() => handleSongClick(song)}
                >
                  <div className="liked-cover-wrapper">
                    <img src={song.cover_url} alt={song.title} className="liked-cover" />
                    <div className="liked-play-overlay">
                      {isActive && isPlaying
                        ? <div className="mini-bars"><span /><span /><span /></div>
                        : <Play size={14} fill="white" />
                      }
                    </div>
                  </div>
                  <div className="liked-song-text">
                    <span className={`liked-song-name ${isActive ? 'active' : ''}`}>
                      {song.title}
                    </span>
                    <span className="liked-song-artist">{song.artist}</span>
                  </div>
                  <button
                    className="liked-remove-btn"
                    onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}
                    title="Quitar de Me Gusta"
                  >
                    <Heart size={16} fill="currentColor" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Placeholder para playlists futuras */}
      <div className="library-section-title" style={{ marginTop: '30px' }}>Playlists</div>
      <div className="library-placeholder">
        <ListMusic size={36} />
        <p>Tus playlists aparecerán aquí.</p>
        <span>Usa el botón "Nueva Playlist" para comenzar.</span>
      </div>

    </div>
  );
}
