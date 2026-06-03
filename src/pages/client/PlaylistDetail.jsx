import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, Play, Shuffle, Search, ArrowLeft, Plus, MoreHorizontal, Clock, Music, ArrowDownCircle, Trash2 } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useOfflineStore } from '../../store/useOfflineStore';
import { supabase } from '../../supabaseClient';
import { BACKEND_URL } from '../../config';
import { fetchWithTimeout } from '../../utils/fetchHelper';
import './PlaylistDetail.css';

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const queue = usePlayerStore(state => state.queue);
  const currentSong = usePlayerStore(state => state.currentSong);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playSong = usePlayerStore(state => state.playSong);
  const setActiveSongMenu = usePlayerStore(state => state.setActiveSongMenu);

  const playlists = useLibraryStore(state => state.playlists);
  const likedSongs = useLibraryStore(state => state.likedSongs);
  const isSongLiked = useLibraryStore(state => state.isSongLiked);
  const fetchPlaylists = useLibraryStore(state => state.fetchPlaylists);
  const addSongToPlaylist = useLibraryStore(state => state.addSongToPlaylist);
  const toggleLike = useLibraryStore(state => state.toggleLike);

  // Estados de descargas offline
  const isOfflineMode = useOfflineStore(state => state.isOfflineMode);
  const downloadedIds = useOfflineStore(state => state.downloadedIds);
  const activeDownloads = useOfflineStore(state => state.activeDownloads);
  const downloadProgress = useOfflineStore(state => state.downloadProgress);
  const downloadSong = useOfflineStore(state => state.downloadSong);
  const removeDownload = useOfflineStore(state => state.removeDownload);
  const downloadPlaylist = useOfflineStore(state => state.downloadPlaylist);

  const isUuid = useMemo(() => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id), [id]);
  const [externalPlaylist, setExternalPlaylist] = useState(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [likedSongsList, setLikedSongsList] = useState([]);
  const [likedLoading, setLikedLoading] = useState(false);

  useEffect(() => {
    if (id === 'liked') {
      const loadLikedSongsDetail = async () => {
        setLikedLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data, error } = await supabase
              .from('likes')
              .select(`
                song_id,
                songs (*)
              `)
              .eq('user_id', user.id);
            
            if (!error && data) {
              const songs = data.map(item => item.songs).filter(Boolean).map(s => ({
                ...s,
                source: s.source || 'local',
                is_local: s.source !== 'youtube'
              }));
              setLikedSongsList(songs);
            }
          }
        } catch (e) {
          console.error("Error loading liked songs detail:", e);
        } finally {
          setLikedLoading(false);
        }
      };
      loadLikedSongsDetail();
    } else if (!isUuid && id) {
      setExternalLoading(true);
      fetchWithTimeout(`${BACKEND_URL}/playlist/tracks?id=${id}`, {}, 30000)
        .then(res => res.json())
        .then(data => {
          setExternalPlaylist({
            id: id,
            title: data.title,
            cover_url: data.cover_url,
            songs: data.tracks || [],
            is_external: true
          });
        })
        .catch(err => console.error("Error loading external playlist:", err))
        .finally(() => setExternalLoading(false));
    }
  }, [id, isUuid, likedSongs]);

  const playlist = useMemo(() => {
    if (id === 'liked') {
      return {
        id: 'liked',
        title: 'Tus me gusta',
        cover_url: likedSongsList[0]?.cover_url || '/icon.png',
        songs: likedSongsList,
        is_liked_playlist: true
      };
    }
    return isUuid ? playlists.find(p => p.id === id) : externalPlaylist;
  }, [playlists, id, isUuid, externalPlaylist, likedSongsList]);

  // Checar si toda la playlist está descargada
  const isPlaylistDownloaded = useMemo(() => {
    if (!playlist || !playlist.songs || playlist.songs.length === 0) return false;
    return playlist.songs.every(song => downloadedIds.includes(song.id));
  }, [playlist, downloadedIds]);

  const isPlaylistDownloading = useMemo(() => {
    if (!playlist || !playlist.songs) return false;
    return playlist.songs.some(song => activeDownloads.has(song.id));
  }, [playlist, activeDownloads]);

  const playlistSongs = useMemo(() => {
    if (!playlist) return [];
    const search = query.trim().toLowerCase();
    if (!search) return playlist.songs;
    return playlist.songs.filter(song =>
      song.title.toLowerCase().includes(search) || song.artist.toLowerCase().includes(search)
    );
  }, [playlist, query]);

  const availableSongs = useMemo(() => {
    if (!playlist) return [];
    const ids = new Set(playlist.songs.map(song => song.id));
    return queue.filter(song => !ids.has(song.id));
  }, [playlist, queue]);

  if (!playlist) {
    return (
      <div className="playlist-detail-page empty">
        <button className="back-btn-simple" onClick={() => navigate('/library')}>
          <ArrowLeft size={24} />
        </button>
        <div className="empty-message">
          <Music size={64} opacity={0.2} />
          <p>Cargando playlist...</p>
        </div>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (playlist.songs.length) {
      usePlayerStore.getState().setQueue(playlist.songs);
      playSong(playlist.songs[0]);
    }
  };

  const handleShuffle = () => {
    if (!playlist.songs.length) return;
    const shuffled = [...playlist.songs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    usePlayerStore.getState().setQueue(shuffled);
    playSong(shuffled[0]);
  };

  return (
    <div className="playlist-detail-page">
      
      {/* HEADER DINÁMICO */}
      <header 
        className="playlist-header" 
        style={{ 
          opacity: Math.max(0, 1 - scrollY / 340),
          transform: `translateY(${scrollY * 0.4}px)`
        }}
      >
        <div className="header-background">
          {playlist.is_external ? (
            <div className="bg-tile tile-0" style={{ backgroundImage: `url(${playlist.cover_url})`, width: '100%', height: '100%', filter: 'blur(50px) brightness(0.4)', backgroundSize: 'cover', position: 'absolute', inset: 0 }}></div>
          ) : (
            playlist.songs.slice(0, 4).map((song, i) => (
              <img key={i} src={song.cover_url} alt="" className={`bg-tile tile-${i}`} />
            ))
          )}
          <div className="header-overlay"></div>
        </div>

        <nav className="header-nav" style={{ opacity: 1, transform: `translateY(${-scrollY * 0.4}px)` }}>
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
        </nav>

        <div className="header-content">
          <div className="playlist-cover-art">
            {playlist.songs.length > 0 ? (
              playlist.is_external ? (
                <img src={playlist.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
              ) : (
                <div className="cover-grid">
                  {playlist.songs.slice(0, 4).map((s, i) => (
                    <img key={i} src={s.cover_url} alt="" />
                  ))}
                </div>
              )
            ) : (
              <div className="cover-placeholder"><Music size={48} /></div>
            )}
          </div>
          
          <div className="playlist-info">
            <span className="playlist-label">{playlist.is_external ? 'YOUTUBE ALBUM / PLAYLIST' : 'PLAYLIST'}</span>
            <h1 className="playlist-title">{playlist.title}</h1>
            <div className="playlist-meta">
              <div className="user-badge">{playlist.is_external ? 'YT' : 'M'}</div>
              <span className="user-name">{playlist.is_external ? 'YOUTUBE MUSIC' : 'TU BIBLIOTECA'}</span>
              <span className="dot">•</span>
              <span className="song-count">{playlist.songs.length} canciones</span>
            </div>
          </div>
        </div>
      </header>

      {/* ACCIONES */}
      <div className="playlist-actions-bar">
        <div className="actions-left">
          <button className="play-btn-main" onClick={handlePlayAll}>
            {isPlaying && playlist.songs.some(s => s.id === currentSong?.id) ? (
              <div className="playing-bars"><span/><span/><span/></div>
            ) : (
              <Play fill="black" size={24} />
            )}
          </button>
          <button className="action-icon-btn" onClick={handleShuffle} title="Aleatorio">
            <Shuffle size={24} />
          </button>
          <button 
            className={`action-icon-btn download-playlist-btn ${isPlaylistDownloaded ? 'downloaded' : ''}`}
            onClick={() => {
              if (isPlaylistDownloaded) {
                if (window.confirm('¿Deseas eliminar las descargas offline de esta playlist?')) {
                  playlist.songs.forEach(s => removeDownload(s.id));
                }
              } else {
                downloadPlaylist(playlist.title, playlist.songs);
              }
            }}
            title="Descargar playlist"
          >
            {isPlaylistDownloading ? (
              <span className="spinner-download-icon">⏳</span>
            ) : isPlaylistDownloaded ? (
              <ArrowDownCircle size={24} fill="#1db954" color="black" />
            ) : (
              <ArrowDownCircle size={24} />
            )}
          </button>
          {!playlist.is_liked_playlist && !playlist.is_external && (
            <button 
              className="action-icon-btn delete-playlist-btn" 
              onClick={async () => {
                if (window.confirm('¿Deseas eliminar esta playlist por completo?')) {
                  const deletePlaylist = useLibraryStore.getState().deletePlaylist;
                  await deletePlaylist(playlist.id);
                  navigate('/library');
                }
              }}
              title="Eliminar playlist"
              style={{ color: '#ff4444' }}
            >
              <Trash2 size={24} />
            </button>
          )}
        </div>

        <div className="actions-right">
          {showSearch ? (
            <div className="search-box-expand">
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Buscar en playlist" 
                autoFocus 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => !query && setShowSearch(false)}
              />
            </div>
          ) : (
            <button className="action-icon-btn" onClick={() => setShowSearch(true)}>
              <Search size={20} />
            </button>
          )}
        </div>
      </div>

      {/* LISTA DE CANCIONES */}
      <main className="playlist-main-content">
        <div className="songs-table">
          <div className="table-header-row">
            <span className="col-idx">#</span>
            <span className="col-title">TÍTULO</span>
            <span className="col-album">ÁLBUM</span>
            <span className="col-duration"><Clock size={16} /></span>
          </div>

          <div className="songs-list">
            {playlistSongs.map((song, index) => {
              const isActive = currentSong?.id === song.id;
              const isLiked = isSongLiked(song);
              const isDownloaded = downloadedIds.includes(song.id);
              const isDownloading = activeDownloads.has(song.id);
              const isAvailable = !isOfflineMode || isDownloaded;
              
              return (
                <div 
                  key={song.id} 
                  className={`song-row ${isActive ? 'active' : ''} ${!isAvailable ? 'offline-disabled' : ''}`}
                  onClick={() => {
                    if (!isAvailable) {
                      alert('Esta canción no está descargada para reproducirse offline.');
                      return;
                    }
                    playSong(song);
                  }}
                >
                  <div className="col-idx">
                    {isActive && isPlaying ? (
                       <div className="mini-bars-active"><span/><span/><span/></div>
                    ) : (
                      <span className="idx-num">{index + 1}</span>
                    )}
                    <Play className="idx-play" size={14} fill="currentColor" />
                  </div>

                  <div className="col-title">
                    <img src={song.cover_url} alt="" className="song-thumb" />
                    <div className="song-details">
                      <span className="song-name">{song.title}</span>
                      <span className="song-artist">
                        {isDownloaded && <span className="green-dl-dot-small" title="Descargado offline">▼</span>}
                        {song.artist}
                      </span>
                    </div>
                  </div>

                  <div className="col-album">
                    <span>{song.album || 'Single'}</span>
                  </div>

                  <div className="col-duration">
                    <div className="song-download-wrapper" onClick={(e) => e.stopPropagation()}>
                      {isDownloading ? (
                        <span className="dl-pct-text">{downloadProgress[song.id] || 0}%</span>
                      ) : isDownloaded ? (
                        <button className="song-download-btn downloaded" onClick={() => removeDownload(song.id)} title="Eliminar descarga">
                          <ArrowDownCircle size={15} fill="#1db954" color="black" />
                        </button>
                      ) : (
                        <button className="song-download-btn" onClick={() => downloadSong(song)} title="Descargar canción">
                          <ArrowDownCircle size={15} />
                        </button>
                      )}
                    </div>
                    <button 
                      className={`song-like-btn ${isLiked ? 'liked' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleLike(song); }}
                    >
                      <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
                    </button>
                    <span className="duration-text">
                      {song.duration ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}` : '3:45'}
                    </span>
                    <button className="song-more-btn" onClick={(e) => { e.stopPropagation(); setActiveSongMenu(song, playlist); }}>
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {availableSongs.length > 0 && !playlist.is_external && (
          <section className="recommendations-section">
            <h3>Recomendado</h3>
            <p>Basado en el título de esta playlist</p>
            <div className="rec-list">
               {availableSongs.slice(0, 5).map(song => (
                 <div key={song.id} className="rec-row">
                    <img src={song.cover_url} alt="" />
                    <div className="rec-info">
                      <span className="rec-name">{song.title}</span>
                      <span className="rec-artist">{song.artist}</span>
                    </div>
                    <button className="add-btn" onClick={() => addSongToPlaylist(playlist.id, song)}>
                      Agregar
                    </button>
                 </div>
               ))}
            </div>
          </section>
        )}
      </main>

    </div>
  );
}
