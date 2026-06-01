import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Plus, Search, Play, ChevronRight, X, Trash2 } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useOfflineStore } from '../../store/useOfflineStore';
import './Library.css';

export default function Library() {
  const [activeTab, setActiveTab] = useState('playlists');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [playlistQuery, setPlaylistQuery] = useState('');

  const queue = usePlayerStore(state => state.queue);
  const currentSong = usePlayerStore(state => state.currentSong);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playSong = usePlayerStore(state => state.playSong);
  const togglePlay = usePlayerStore(state => state.togglePlay);

  const playlists = useLibraryStore(state => state.playlists);
  const likedSongs = useLibraryStore(state => state.likedSongs);
  const fetchPlaylists = useLibraryStore(state => state.fetchPlaylists);
  const fetchLikes = useLibraryStore(state => state.fetchLikes);
  const createPlaylist = useLibraryStore(state => state.createPlaylist);
  const deletePlaylist = useLibraryStore(state => state.deletePlaylist);
  const toggleLike = useLibraryStore(state => state.toggleLike);

  // Estados Offline
  const isOfflineMode = useOfflineStore(state => state.isOfflineMode);
  const downloadedIds = useOfflineStore(state => state.downloadedIds);

  useEffect(() => {
    fetchPlaylists();
    fetchLikes();
  }, []);

  const handleCreatePlaylist = async () => {
    const title = newPlaylistTitle.trim();
    if (!title) return;

    await createPlaylist(title, 'Lista personalizada');
    
    setNewPlaylistTitle('');
    setShowCreateModal(false);
  };

  const handleDeletePlaylist = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta playlist?')) {
        await deletePlaylist(id);
    }
  };

  const playlistCards = useMemo(() => {
    return playlists.map((playlist) => {
      // Filtrar canciones si estamos en offline
      const songs = isOfflineMode
        ? playlist.songs.filter(s => downloadedIds.includes(s.id))
        : playlist.songs;
      const covers = songs.slice(0, 4).map(song => song.cover_url).filter(Boolean);
      const isDownloaded = songs.length > 0 && songs.every(s => downloadedIds.includes(s.id));
      
      return {
        ...playlist,
        songs,
        isDownloaded,
        covers: covers.length > 0 ? covers : Array(4).fill(null)
      };
    }).filter(pl => !isOfflineMode || pl.songs.length > 0);
  }, [playlists, isOfflineMode, downloadedIds]);

  const filteredPlaylists = useMemo(() => {
    if (!playlistQuery.trim()) return playlistCards;
    const query = playlistQuery.toLowerCase();
    return playlistCards.filter(playlist =>
      playlist.title.toLowerCase().includes(query) ||
      (playlist.description && playlist.description.toLowerCase().includes(query)) ||
      playlist.songs.some(s => s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query))
    );
  }, [playlistCards, playlistQuery]);

  const likedList = useMemo(() => {
    const list = queue.filter(song => likedSongs.includes(song.id));
    if (isOfflineMode) {
      return list.filter(song => downloadedIds.includes(song.id));
    }
    return list;
  }, [queue, likedSongs, isOfflineMode, downloadedIds]);

  const handleSongClick = (song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      playSong(song);
    }
  };

  return (
    <div className="library-page">
      <div className={`library-header-row ${isSearching ? 'is-searching' : ''}`}>
        {!isSearching ? (
          <>
            <div>
              <h1 className="library-title">Tu Biblioteca</h1>
            </div>
            <button className="library-search-toggle" onClick={() => setIsSearching(true)} title="Buscar en biblioteca">
              <Search size={20} />
            </button>
          </>
        ) : (
          <div className="library-search-expand">
            <Search size={20} className="search-icon-inside" />
            <input 
              type="text" 
              autoFocus
              placeholder="Buscar canciones, artistas, playlists..."
              value={playlistQuery}
              onChange={(e) => setPlaylistQuery(e.target.value)}
              onBlur={() => !playlistQuery && setIsSearching(false)}
            />
            <button className="search-close-btn" onClick={() => { setPlaylistQuery(''); setIsSearching(false); }}>
              <X size={20} />
            </button>
          </div>
        )}
      </div>

      <div className="library-section-title" style={{ marginTop: '10px' }}>Me gusta</div>
      <div className="library-folder" onClick={() => setShowCreateModal(false)}>
        <div className="folder-icon liked-icon">
          <Heart size={20} fill="currentColor" />
        </div>
        <div className="folder-info">
          <span className="folder-name">Tus me gusta</span>
          <span className="folder-count">{likedList.length} canciones</span>
        </div>
      </div>

      <div className="library-liked-list">
        {likedList.map((song) => {
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
                    : <Play size={12} fill="white" />
                  }
                </div>
              </div>
              <div className="liked-song-text">
                <span className={`liked-song-name ${isActive ? 'active' : ''}`}>
                  {song.title}
                </span>
                <span className="liked-song-artist">
                  {downloadedIds.includes(song.id) && <span className="green-dl-dot-small" style={{ color: '#1db954', marginRight: '6px', fontSize: '0.65rem' }}>▼</span>}
                  {song.artist}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="library-tabs">
        {['playlists', 'artistas', 'podcasts'].map((tab) => (
          <button
            key={tab}
            className={`library-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'playlists' ? 'Playlists' : tab === 'artistas' ? 'Artistas' : 'Podcasts'}
          </button>
        ))}
      </div>

      {showCreateModal && (
        <div className="library-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="library-modal-content" onClick={e => e.stopPropagation()}>
            <h3>Nueva Playlist</h3>
            <p>Dale un nombre a tu colección.</p>
            <input
              type="text"
              autoFocus
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              placeholder="Nombre de la playlist"
              onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
            />
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="modal-btn-create" onClick={handleCreatePlaylist}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'playlists' && (
        <div className="library-empty-state">
          <p>Esta sección se verá aquí cuando agregues más contenido.</p>
        </div>
      )}

      {activeTab === 'playlists' && (
        <>
          {filteredPlaylists.length === 0 ? (
            <div className="library-empty-state">
              <p>No tienes playlists aún. Crea una nueva y agrégale canciones.</p>
            </div>
          ) : (
            <div className="library-playlist-list">
              {filteredPlaylists.map((playlist) => (
                <div key={playlist.id} className="playlist-list-item">
                  <Link to={`/library/playlist/${playlist.id}`} className="playlist-list-link">
                    <div className="playlist-list-covers">
                      {playlist.covers.map((cover, index) => (
                        <div key={index} className={`cover-item cover-item-${index + 1}`}>
                          {cover ? <img src={cover} alt={`${playlist.title} cover ${index + 1}`} /> : <div className="cover-placeholder" />}
                        </div>
                      ))}
                    </div>
                    <div className="playlist-list-info">
                      <span className="playlist-list-kind">Playlist</span>
                      <strong>{playlist.title}</strong>
                      <span>{playlist.songs.length} canciones</span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="playlist-list-remove"
                    onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(playlist.id); }}
                    title="Eliminar playlist"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Botón flotante para crear playlist */}
      <button className="library-fab" onClick={() => setShowCreateModal(true)} title="Crear nueva playlist">
        <Plus size={20} />
      </button>
    </div>
  );
}
