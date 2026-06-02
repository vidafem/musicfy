import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, Play, Heart, Music, Loader2, X, Mic2, Radio, Video, Headphones, MoreVertical } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { supabase } from '../../supabaseClient';
import { fetchFromPiped, getHighResThumbnail } from '../../utils/pipedService';
import { recommendationEngine } from '../../utils/recommendationEngine';
import { BACKEND_URL } from '../../config';
import './Search.css';

// Caché en memoria para búsquedas instantáneas
const searchCache = {};

const GENRE_CONFIG = {
  'Reggaetón': { color: '#EB1E32', icon: 'Mic2' },
  'Reggaeton': { color: '#EB1E32', icon: 'Mic2' },
  'Pop': { color: '#8C19FF', icon: 'Headphones' },
  'Trap': { color: '#1DB954', icon: 'Music' },
  'Hip Hop': { color: '#F59B23', icon: 'Mic2' },
  'Electrónica': { color: '#477DFF', icon: 'Radio' },
  'K-Pop': { color: '#FF4632', icon: 'Headphones' },
  'R&B': { color: '#16A39A', icon: 'Music' },
  'Rock': { color: '#213165', icon: 'Music' },
  'Salsa': { color: '#8D67AD', icon: 'Music' },
  'Bachata': { color: '#E8115B', icon: 'Music' },
  'Vallenato': { color: '#F037A5', icon: 'Music' },
  'Dembow': { color: '#BC5900', icon: 'Music' },
  'Urbano': { color: '#1DB954', icon: 'Music' },
  'Urbano latino': { color: '#00A38D', icon: 'Music' },
  'Pop Latino': { color: '#E8115B', icon: 'Music' },
  'Jazz': { color: '#1E3264', icon: 'Music' },
  'Clásica': { color: '#7D4B32', icon: 'Music' },
  'Metal': { color: '#E91429', icon: 'Music' },
  'Lo-Fi': { color: '#A56752', icon: 'Music' },
  'Regional Mexicano': { color: '#D84000', icon: 'Music' }
};

const getGenreStyle = (genre = '') => {
  const normalized = genre.trim();
  const foundKey = Object.keys(GENRE_CONFIG).find(k => k.toLowerCase() === normalized.toLowerCase());
  return GENRE_CONFIG[foundKey || normalized] || { color: '#535353', icon: 'Music' };
};

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [playlistsAndAlbums, setPlaylistsAndAlbums] = useState([]);
  const [favoriteArtists, setFavoriteArtists] = useState([]);
  const [favoriteGenres, setFavoriteGenres] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState('Música');

  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const cached = localStorage.getItem('musicfy_search_history');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const { currentSong, isPlaying, playSong, togglePlay, setActiveSongMenu } = usePlayerStore();
  const { likedSongs, toggleLike, isSongLiked } = useLibraryStore();

  useEffect(() => {
    loadExploreData();
  }, []);

  const loadExploreData = async () => {
    try {
      const { data: songsData } = await supabase
        .from('songs')
        .select('artist, genre, cover_url')
        .limit(250);

      const profile = recommendationEngine.getProfile();
      
      const artistCovers = {};
      const allUniqueArtists = new Set();
      const allUniqueGenres = new Set();
      
      if (songsData) {
        songsData.forEach(s => {
          if (s.artist) {
            allUniqueArtists.add(s.artist);
            if (!artistCovers[s.artist] && s.cover_url) {
              artistCovers[s.artist] = s.cover_url;
            }
          }
          if (s.genre) {
            allUniqueGenres.add(s.genre);
          }
        });
      }

      // Definir géneros favoritos (los del perfil, completados con los de la DB)
      const topGenres = [...new Set([...(profile.topGenres || []), ...allUniqueGenres])].slice(0, 8);
      
      // Definir artistas favoritos (los del perfil, completados con los de la DB)
      const topArtists = [...new Set([...(profile.topArtists || []), ...allUniqueArtists])].slice(0, 8);

      setFavoriteGenres(topGenres);
      
      // Cargar caché de avatares oficiales
      let avatarCache = {};
      try {
        const cached = localStorage.getItem('musicfy_artist_avatars_cache');
        if (cached) avatarCache = JSON.parse(cached);
      } catch (e) {}

      const artistsWithCovers = [];
      const artistsToFetch = [];

      topArtists.forEach(artist => {
        if (avatarCache[artist]) {
          artistsWithCovers.push({
            name: artist,
            image: avatarCache[artist]
          });
        } else {
          // Fallback a cover local o default temporal
          artistsWithCovers.push({
            name: artist,
            image: artistCovers[artist] || `https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=300&auto=format&fit=crop`
          });
          artistsToFetch.push(artist);
        }
      });

      setFavoriteArtists([...artistsWithCovers]);

      // Buscar avatares oficiales ausentes en segundo plano
      if (artistsToFetch.length > 0) {
        Promise.allSettled(
          artistsToFetch.map(async (artist) => {
            const res = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(artist)}&type=artist`);
            if (res.ok) {
              const data = await res.json();
              const firstArtist = data.items?.[0];
              if (firstArtist && firstArtist.thumbnail) {
                const highRes = getHighResThumbnail(firstArtist.thumbnail);
                return { artist, image: highRes };
              }
            }
            return { artist, image: artistCovers[artist] || '/icon.png' };
          })
        ).then(results => {
          let cacheChanged = false;
          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
              const { artist, image } = r.value;
              avatarCache[artist] = image;
              cacheChanged = true;
            }
          });
          if (cacheChanged) {
            localStorage.setItem('musicfy_artist_avatars_cache', JSON.stringify(avatarCache));
            
            // Actualizar la lista en pantalla
            const updatedArtists = topArtists.map(artist => ({
              name: artist,
              image: avatarCache[artist] || artistCovers[artist] || '/icon.png'
            }));
            setFavoriteArtists(updatedArtists);
          }
        });
      }
      
    } catch (err) {
      console.error("Error loading explore data:", err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        performSearch();
      } else {
        setResults([]);
        setPlaylistsAndAlbums([]);
        setHasSearched(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const performSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const cacheKey = `${trimmed}_${activeFilter}`;
    
    // Si ya está en caché, cargar instantáneamente (0ms)
    if (searchCache[cacheKey]) {
      const cached = searchCache[cacheKey];
      setResults(cached.results);
      setPlaylistsAndAlbums(cached.playlistsAndAlbums);
      setLoading(false);
      setHasSearched(true);
    } else {
      setLoading(true);
    }
    
    setHasSearched(true);

    try {
      console.log("[Search] Iniciando búsqueda híbrida para:", trimmed, "Filtro:", activeFilter);

      // Limpiar playlists previas al iniciar búsqueda nueva no-cacheada
      if (!searchCache[cacheKey]) {
        setPlaylistsAndAlbums([]);
      }

      // 1. Ejecutar búsqueda local en Supabase con un solo .or()
      const localPromise = (async () => {
        let localRequest = supabase.from('songs').select('*');
        if (activeFilter === 'Videos') {
          localRequest = localRequest.eq('is_video', true);
        }
        try {
          const res = await Promise.race([
            localRequest.or(`title.ilike.%${trimmed}%,artist.ilike.%${trimmed}%,genre.ilike.%${trimmed}%,album.ilike.%${trimmed}%`).limit(50),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de Supabase (5s)')), 5000))
          ]);
          let localSongs = (res.error ? [] : (res.data || [])).map(song => ({
            ...song,
            source: song.source || 'local',
            is_local: true
          }));
          if (activeFilter === 'Música') {
            localSongs = localSongs.filter(song => !song.is_video);
          }
          return localSongs;
        } catch (localErr) {
          console.warn("Búsqueda local falló o excedió el tiempo límite:", localErr);
          return [];
        }
      })();

      // 2. Ejecutar búsqueda externa de canciones en YouTube Music
      const youtubeSongsPromise = (async () => {
        try {
          const filterParam = activeFilter === 'Videos' ? 'music_videos' : 'songs';
          const ytData = await Promise.race([
            fetchFromPiped(`/search?q=${encodeURIComponent(trimmed)}&filter=${filterParam}`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de YouTube Music (5s)')), 5000))
          ]);
          return (ytData?.items || []).map(item => {
            if (!item.url) return null;
            const yid = item.url.split('=')[1] || item.url.split('/').pop();
            return {
              id: yid,
              title: item.title || 'Canción Desconocida',
              artist: item.uploaderName || 'Artista Desconocido',
              cover_url: item.thumbnail || '',
              url: null,
              source: 'youtube',
              youtube_id: yid,
              is_external: true,
              is_video: activeFilter === 'Videos',
              duration_text: item.duration ? Math.floor(item.duration / 60) + ":" + (item.duration % 60).toString().padStart(2, '0') : ''
            };
          }).filter(Boolean);
        } catch (ytErr) {
          console.error("Error o timeout al buscar canciones en YouTube:", ytErr);
          return [];
        }
      })();

      // 3. Esperar por las canciones y actualizar la interfaz inmediatamente
      const [localSongs, youtubeSongs] = await Promise.all([localPromise, youtubeSongsPromise]);
      
      // Evitar sobreescribir si el usuario ya cambió la búsqueda
      if (query.trim() !== trimmed) return;

      const combinedSongs = [...localSongs, ...youtubeSongs];
      setResults(combinedSongs);
      setLoading(false);

      // Guardar en el caché temporalmente
      if (!searchCache[cacheKey]) {
        searchCache[cacheKey] = { results: combinedSongs, playlistsAndAlbums: [] };
      } else {
        searchCache[cacheKey].results = combinedSongs;
      }

      // 4. Si el filtro es Música, buscar playlists/álbumes de fondo
      if (activeFilter === 'Música') {
        const playlistPromise = Promise.race([
          fetchFromPiped(`/search?q=${encodeURIComponent(trimmed)}&filter=playlists`),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Playlists (5s)')), 5000))
        ]).catch(() => ({ items: [] }));

        const albumPromise = Promise.race([
          fetchFromPiped(`/search?q=${encodeURIComponent(trimmed)}&filter=albums`),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Albums (5s)')), 5000))
        ]).catch(() => ({ items: [] }));

        const [playlistData, albumData] = await Promise.all([playlistPromise, albumPromise]);
        
        if (query.trim() !== trimmed) return;

        const externalPlaylists = [
          ...(playlistData?.items || []).map(p => ({ ...p, type: 'playlist' })),
          ...(albumData?.items || []).map(a => ({ ...a, type: 'album' }))
        ];

        setPlaylistsAndAlbums(externalPlaylists);
        
        // Actualizar caché completo
        searchCache[cacheKey] = {
          results: combinedSongs,
          playlistsAndAlbums: externalPlaylists
        };
      }

    } catch (err) {
      console.error("Error crítico en performSearch:", err);
      setLoading(false);
    }
  };

  // Re-ejecutar búsqueda si cambia el filtro
  useEffect(() => {
    if (query.trim()) {
      performSearch();
    }
  }, [activeFilter]);

  // --- GESTIÓN DE HISTORIAL ---
  const addToHistory = (item, type = 'song') => {
    const historyItem = type === 'song' ? {
      id: item.id,
      title: item.title,
      artist: item.artist,
      cover_url: item.cover_url,
      source: item.source || 'local',
      youtube_id: item.youtube_id || null,
      is_video: item.is_video || false,
      type: 'song',
      timestamp: Date.now()
    } : {
      playlistId: item.playlistId,
      title: item.title,
      uploaderName: item.uploaderName || item.author,
      thumbnail: item.thumbnail,
      trackCount: item.trackCount,
      type: item.type || 'playlist',
      timestamp: Date.now()
    };

    setSearchHistory(prev => {
      const filtered = prev.filter(x => {
        if (type === 'song') {
          return x.type !== 'song' || x.id !== item.id;
        } else {
          return x.type === 'song' || x.playlistId !== item.playlistId;
        }
      });
      const updated = [historyItem, ...filtered].slice(0, 15);
      localStorage.setItem('musicfy_search_history', JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('musicfy_search_history');
  };

  const removeFromHistory = (e, index) => {
    e.stopPropagation();
    setSearchHistory(prev => {
      const updated = prev.filter((_, idx) => idx !== index);
      localStorage.setItem('musicfy_search_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handlePlaySong = (song) => {
    // Sincronizar la cola de reproducción con los resultados de la búsqueda actual
    const songIndex = results.findIndex(r => r.id === song.id);
    if (songIndex !== -1) {
      usePlayerStore.getState().setQueue(results);
    }
    playSong(song);
    addToHistory(song, 'song');
  };

  const handlePlaylistClick = (item) => {
    addToHistory(item, item.type || 'playlist');
    navigate(`/library/playlist/${item.playlistId}`);
  };

  return (
    <div className="search-page">
      <div className="search-header">
        <h1 className="search-title">Buscar</h1>
        
        <div className="search-input-wrapper">
          <SearchIcon className="search-bar-icon" size={20} />
          <input 
            type="text" 
            placeholder="¿Qué quieres escuchar hoy?" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-bar-input"
          />
          {query && <X size={20} className="clear-search" onClick={() => setQuery('')} />}
        </div>

        <div className="search-filters-chips">
          {['Música', 'Videos'].map(filter => (
            <button 
              key={filter}
              className={`filter-chip ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="search-content">
        {!hasSearched ? (
          <div className="explore-section">
            
            {/* HISTORIAL DE BÚSQUEDAS RECIENTES */}
            {searchHistory.length > 0 && (
              <div className="search-history-section">
                <div className="history-header">
                  <h3 className="section-subtitle" style={{ margin: 0 }}>Búsquedas Recientes</h3>
                  <button className="clear-history-btn" onClick={clearHistory}>Limpiar búsqueda</button>
                </div>
                <div className="history-list">
                  {searchHistory.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="history-row" 
                      onClick={() => {
                        if (item.type === 'song') {
                          playSong(item);
                        } else {
                          navigate(`/library/playlist/${item.playlistId}`);
                        }
                      }}
                    >
                      <img 
                        src={item.cover_url || item.thumbnail} 
                        alt="" 
                        className={item.type === 'song' ? 'history-img-song' : 'history-img-playlist'}
                        onError={(e) => { e.target.src = '/icon.png'; }}
                      />
                      <div className="history-info">
                        <span className="history-title">{item.title}</span>
                        <span className="history-subtitle">
                          {item.type === 'song' 
                            ? `${item.artist || 'Artista Desconocido'} • Canción` 
                            : `${item.uploaderName || 'Artista Desconocido'} • ${item.type === 'album' ? 'Álbum' : 'Playlist'}`
                          }
                        </span>
                      </div>
                      <button className="remove-history-btn" onClick={(e) => removeFromHistory(e, idx)}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN DE CANTANTES */}
            {favoriteArtists.length > 0 && (
              <div className="explore-artists-block" style={{ marginTop: searchHistory.length > 0 ? '30px' : '10px' }}>
                <h3 className="section-subtitle">Tus Cantantes</h3>
                <div className="explore-artists-grid">
                  {favoriteArtists.map(artist => (
                    <div 
                      key={artist.name} 
                      className="explore-artist-card"
                      onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
                    >
                      <div className="artist-avatar-wrapper">
                        <img 
                          src={artist.image} 
                          alt={artist.name} 
                          className="artist-avatar-img" 
                          onError={(e) => { e.target.src = '/icon.png'; }}
                        />
                      </div>
                      <span className="artist-avatar-name">{artist.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN DE GÉNEROS */}
            {favoriteGenres.length > 0 && (
              <div className="explore-genres-block" style={{ marginTop: '30px' }}>
                <h3 className="section-subtitle">Explorar Géneros</h3>
                <div className="genre-grid">
                  {favoriteGenres.map(genre => {
                    const style = getGenreStyle(genre);
                    return (
                      <div 
                        key={genre} 
                        className="genre-card"
                        style={{ backgroundColor: style.color }}
                        onClick={() => {
                          setQuery(genre);
                          setActiveFilter('Música');
                        }}
                      >
                        <span className="genre-name">{genre}</span>
                        <div className="genre-img-container">
                           <Music size={60} className="genre-icon-bg" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="search-results">
            {loading ? (
              <div className="loading-state"><Loader2 className="animate-spin" /></div>
            ) : (results.length > 0 || playlistsAndAlbums.length > 0) ? (
              <div className="results-list">
                
                {/* CARRUSEL DE ALBUMES Y PLAYLISTS DE YOUTUBE */}
                {playlistsAndAlbums.length > 0 && activeFilter === 'Música' && (
                  <div className="external-playlists-section">
                    <h3 className="section-subtitle" style={{ marginTop: 0 }}>Álbumes y Playlists de YouTube</h3>
                    <div className="external-playlists-carousel">
                      {playlistsAndAlbums.map((item, idx) => (
                        <div 
                          key={item.playlistId || idx} 
                          className="external-playlist-card"
                          onClick={() => handlePlaylistClick(item)}
                        >
                          <div className="card-cover-wrapper">
                            <img 
                              className="card-cover" 
                              src={item.thumbnail} 
                              alt={item.title} 
                              onError={(e) => { e.target.src = '/icon.png'; }}
                            />
                            <span className="card-badge">{item.type}</span>
                          </div>
                          <div className="card-info">
                            <h4 className="card-title">{item.title}</h4>
                            <p className="card-author">{item.uploaderName}</p>
                            {item.trackCount > 0 && (
                              <span className="card-tracks">{item.trackCount} canciones</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* LISTA DE CANCIONES */}
                {results.length > 0 && (
                  <div className="songs-list-results" style={{ marginTop: '10px' }}>
                    {results.map(song => {
                      const isLocal = song.source !== 'youtube';
                      return (
                        <div key={song.id} className="search-song-row" onClick={() => handlePlaySong(song)}>
                          <img 
                            src={song.cover_url} 
                            alt="" 
                            onError={(e) => { e.target.src = '/icon.png'; }}
                          />
                          <div className="song-info">
                            <span className={`song-title ${isLocal ? 'local-title' : 'youtube-title'}`}>
                              {song.title}
                              {isLocal ? <span className="l-badge">L</span> : <span className="yt-badge">YT</span>}
                            </span>
                            <div className="song-artists-links">
                              {(song.artist || 'Artista Desconocido').split(/[,&/]| ft\. | feat\. /i).map((name, i, arr) => (
                                <React.Fragment key={name.trim()}>
                                  <span 
                                    className="artist-link" 
                                    onClick={(e) => { e.stopPropagation(); navigate(`/artist/${name.trim()}`); }}
                                  >
                                    {name.trim()}
                                  </span>
                                  {i < arr.length - 1 && <span className="separator">, </span>}
                                </React.Fragment>
                              ))}
                              <span className="song-extra-info"> {song.genre ? `• ${song.genre}` : (isLocal ? '• Single' : '')}</span>
                            </div>
                          </div>
                          <button className="like-btn" onClick={(e) => { e.stopPropagation(); toggleLike(song); }}>
                            <Heart size={18} fill={isSongLiked(song) ? "var(--accent-color)" : "none"} color={isSongLiked(song) ? "var(--accent-color)" : "white"} />
                          </button>
                          <button className="song-options-btn" onClick={(e) => { e.stopPropagation(); setActiveSongMenu(song); }}>
                            <MoreVertical size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            ) : (
              <div className="no-results">No se encontraron resultados para "{query}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
