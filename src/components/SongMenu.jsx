import React, { useState, useEffect } from 'react';
import { Play, ListMusic, Plus, FolderPlus, X, Heart } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useLibraryStore } from '../store/useLibraryStore';
import './SongMenu.css';

export default function SongMenu() {
  const song = usePlayerStore(state => state.activeSongMenu);
  const closeMenu = usePlayerStore(state => state.closeSongMenu);
  
  const { playSong, queue, setQueue } = usePlayerStore();
  const { playlists, addSongToPlaylist, toggleLike, likedSongs, createPlaylist } = useLibraryStore();

  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Reset view when menu opens/closes
  useEffect(() => {
    if (song) {
      setShowPlaylistSelector(false);
    }
  }, [song]);

  // Auto-hide toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  if (!song) return null;

  const isLiked = likedSongs.includes(song.id);

  const handlePlayNow = () => {
    playSong(song);
    closeMenu();
  };

  const handleAddToQueue = () => {
    if (queue.some(s => s.id === song.id)) {
      setToastMessage('Ya está en la cola de reproducción');
      return;
    }
    setQueue([...queue, song]);
    setToastMessage('Agregado a la cola');
  };

  const handleAddToPlaylist = (playlistId, playlistName) => {
    closeMenu();
    addSongToPlaylist(playlistId, song);
  };

  const handleCreateNewPlaylist = async () => {
    const name = prompt('Nombre de la nueva playlist:');
    if (name && name.trim()) {
      closeMenu();
      const newPl = await createPlaylist(name.trim());
      if (newPl) {
        addSongToPlaylist(newPl.id, song);
      }
    }
  };

  const handleToggleLike = async () => {
    await toggleLike(song);
    setToastMessage(isLiked ? 'Eliminado de Favoritos' : 'Agregado a Favoritos');
  };

  return (
    <div className="song-menu-overlay" onClick={closeMenu}>
      <div className="song-menu-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Toast interno */}
        {toastMessage && <div className="song-menu-toast">{toastMessage}</div>}

        <header className="menu-song-header">
          <img src={song.cover_url} alt="" className="menu-song-cover" onError={(e) => { e.target.src = '/icon.png'; }} />
          <div className="menu-song-info">
            <h3 className="menu-song-title">{song.title}</h3>
            <p className="menu-song-artist">{song.artist}</p>
          </div>
          <button className="menu-close-btn" onClick={closeMenu}>
            <X size={20} />
          </button>
        </header>

        <div className="menu-options-list">
          {!showPlaylistSelector ? (
            <>
              <button className="menu-option-item" onClick={handlePlayNow}>
                <Play size={18} fill="currentColor" />
                <span>Reproducir ahora</span>
              </button>
              
              <button className="menu-option-item" onClick={handleAddToQueue}>
                <ListMusic size={18} />
                <span>Agregar a la cola</span>
              </button>

              <button className="menu-option-item" onClick={handleToggleLike}>
                <Heart size={18} fill={isLiked ? "currentColor" : "none"} color={isLiked ? "var(--accent-color)" : "white"} />
                <span>{isLiked ? 'Eliminado de Favoritos' : 'Marcar como Favorito'}</span>
              </button>

              <button className="menu-option-item" onClick={() => setShowPlaylistSelector(true)}>
                <Plus size={18} />
                <span>Agregar a una playlist...</span>
              </button>
            </>
          ) : (
            <div className="playlist-selector-view">
              <div className="selector-back-row">
                <button className="selector-back-btn" onClick={() => setShowPlaylistSelector(false)}>
                  ← Volver
                </button>
                <h4>Selecciona una Playlist</h4>
              </div>
              <div className="playlists-scroll-list">
                <button className="menu-playlist-item create-new-playlist-btn" onClick={handleCreateNewPlaylist}>
                  <div className="playlist-icon-square create-new-icon">
                    <Plus size={16} />
                  </div>
                  <span>Crear nueva playlist</span>
                </button>

                {playlists.map(pl => (
                  <button key={pl.id} className="menu-playlist-item" onClick={() => handleAddToPlaylist(pl.id, pl.title)}>
                    <div className="playlist-icon-square">
                      <FolderPlus size={16} />
                    </div>
                    <span>{pl.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button className="menu-cancel-btn" onClick={closeMenu}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
