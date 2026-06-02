import React, { useState, useMemo, useEffect } from 'react';
import { Play, Pause, Heart, WifiOff, Download, Check, RefreshCw, MoreVertical } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useOfflineStore } from '../../store/useOfflineStore';
import { recommendationEngine } from '../../utils/recommendationEngine';
import { supabase } from '../../supabaseClient';
import { BACKEND_URL } from '../../config';
import { fetchWithTimeout } from '../../utils/fetchHelper';
import './Home.css';

export default function Home() {
  const queue = usePlayerStore(state => state.queue);
  const currentSong = usePlayerStore(state => state.currentSong);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const playSong = usePlayerStore(state => state.playSong);
  const togglePlay = usePlayerStore(state => state.togglePlay);
  const setActiveSongMenu = usePlayerStore(state => state.setActiveSongMenu);

  const playlists = useLibraryStore(state => state.playlists);
  const likedSongs = useLibraryStore(state => state.likedSongs);
  const toggleLike = useLibraryStore(state => state.toggleLike);
  const fetchPlaylists = useLibraryStore(state => state.fetchPlaylists);

  const isOfflineMode = useOfflineStore(state => state.isOfflineMode);
  const isNetworkOnline = useOfflineStore(state => state.isNetworkOnline);
  const downloadedIds = useOfflineStore(state => state.downloadedIds);
  const downloadedMetadata = useOfflineStore(state => state.downloadedMetadata);
  const downloadSong = useOfflineStore(state => state.downloadSong);
  const removeDownload = useOfflineStore(state => state.removeDownload);

  // Inicializar playlists si no hay
  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const [dbSongs, setDbSongs] = useState([]);
  const [youtubeTasteSongs, setYoutubeTasteSongs] = useState([]);

  // 1. Cargar todas las canciones locales de Supabase al iniciar
  useEffect(() => {
    const loadAllDbSongs = async () => {
      try {
        const { data, error } = await supabase
          .from('songs')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          const formatted = data.map(s => ({
            ...s,
            source: s.source || 'local',
            is_local: s.source !== 'youtube'
          }));
          setDbSongs(formatted);
        }
      } catch (err) {
        console.warn("[Home] Error cargando canciones de base de datos:", err);
      }
    };

    if (!isOfflineMode) {
      loadAllDbSongs();
    }
  }, [isOfflineMode]);

  // 2. Analizar perfil de gustos y cargar de fondo canciones de YouTube de artistas favoritos que falten en local
  useEffect(() => {
    if (isOfflineMode) return;

    const loadYoutubeTasteSongs = async () => {
      try {
        const profile = recommendationEngine.getProfile();
        const topArtists = profile.topArtists || [];
        if (topArtists.length === 0) return;

        // Cargar caché de mixes de YouTube
        let mixCache = {};
        try {
          const cached = localStorage.getItem('musicfy_taste_mix_cache');
          if (cached) mixCache = JSON.parse(cached);
        } catch (e) {}
        const fetchedSongs = [];
        let cacheChanged = false;

        // Revisar los primeros 3 artistas favoritos
        for (const artist of topArtists.slice(0, 3)) {
          // Contar cuántos temas tenemos de este artista en DB
          const localCount = dbSongs.filter(s => s.artist?.toLowerCase() === artist.toLowerCase()).length;
          
          // Si tenemos menos de 3 canciones de este artista en la biblioteca local,
          // asumimos que es un artista escuchado de YouTube, por lo que resolvemos sus canciones de YouTube.
          if (localCount < 3) {
            if (mixCache[artist] && mixCache[artist].length > 0) {
              fetchedSongs.push(...mixCache[artist]);
            } else {
              console.log(`[Home] Artista favorito "${artist}" sin suficientes canciones locales. Buscando en YouTube Music...`);
              const res = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(artist)}&type=song`);
              if (res.ok) {
                const data = await res.json();
                const artistSongs = (data.items || []).slice(0, 12).map(item => {
                  const yid = item.id.videoId;
                  return {
                    id: yid,
                    title: item.snippet.title,
                    artist: item.snippet.channelTitle,
                    cover_url: item.snippet.thumbnails?.high?.url || '',
                    url: null,
                    source: 'youtube',
                    youtube_id: yid,
                    is_external: true,
                    is_video: false
                  };
                });
                
                if (artistSongs.length > 0) {
                  mixCache[artist] = artistSongs;
                  cacheChanged = true;
                  fetchedSongs.push(...artistSongs);
                }
              }
            }
          }
        }

        if (cacheChanged) {
          localStorage.setItem('musicfy_taste_mix_cache', JSON.stringify(mixCache));
        }

        if (fetchedSongs.length > 0) {
          setYoutubeTasteSongs(fetchedSongs);
        }

      } catch (err) {
        console.warn("[Home] Error cargando canciones de gusto en segundo plano:", err);
      }
    };

    // Esperamos un momento a que dbSongs esté listo para no hacer peticiones de más
    if (dbSongs.length > 0) {
      loadYoutubeTasteSongs();
    }
  }, [dbSongs, isOfflineMode]);

  // Selección de canciones candidato: si está en offline, usamos descargadas.
  // Sino, combinamos todas las canciones locales (dbSongs) y las dinámicas de YouTube (youtubeTasteSongs) para que el recomendador tenga un pool rico.
  const allSongs = useMemo(() => {
    if (isOfflineMode) {
      return downloadedMetadata;
    }
    const baseList = dbSongs.length > 0 ? dbSongs : queue;
    
    // Combinar y deduplicar por ID
    const combined = [...baseList, ...youtubeTasteSongs];
    const uniqueMap = new Map(combined.map(s => [s.id, s]));
    return Array.from(uniqueMap.values());
  }, [isOfflineMode, downloadedMetadata, dbSongs, youtubeTasteSongs, queue]);

  // Saludo dinámico según la hora
  const greeting = useMemo(() => recommendationEngine.getGreeting(), []);

  // 6 Accesos rápidos de la rejilla superior
  const topGrid = useMemo(() => {
    return recommendationEngine.getTopGrid(allSongs, likedSongs, playlists);
  }, [allSongs, likedSongs, playlists]);

  // Mixes dinámicos
  const mixes = useMemo(() => {
    return recommendationEngine.getMixes(allSongs);
  }, [allSongs]);

  // Escuchado recientemente
  const recentlyPlayed = useMemo(() => {
    return recommendationEngine.getRecentlyPlayed(allSongs);
  }, [allSongs]);

  // Canciones recomendadas
  const recommendedTracks = useMemo(() => {
    return recommendationEngine.getRecommendedTracks(allSongs, likedSongs);
  }, [allSongs, likedSongs]);

  // Handler para reproducir un grupo de canciones (Mixes / Playlists)
  const handlePlayMix = (mixSongs) => {
    if (!mixSongs || mixSongs.length === 0) return;
    
    // Si la canción actual ya está en este mix y está pausada, reanudar
    const hasCurrent = mixSongs.some(s => s.id === currentSong?.id);
    if (hasCurrent) {
      togglePlay();
    } else {
      // Reproducir la primera canción del mix y cargar el mix como cola de reproducción
      playSong(mixSongs[0]);
      usePlayerStore.getState().setQueue(mixSongs);
    }
  };

  const handleSongClick = (song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      playSong(song);
    }
  };

  return (
    <div className="spotify-home-page">
      {/* Banner de Modo Offline */}
      {isOfflineMode && (
        <div className="offline-banner">
          <WifiOff size={16} />
          <span>Estás en Modo Offline. Solo se muestra la música descargada.</span>
        </div>
      )}

      <div className="home-content-scroll scrollbar-hidden">
        {/* Encabezado con Saludo */}
        <header className="home-header-spotify">
          <h1 className="greeting-title">{greeting}</h1>
        </header>

        {/* Rejilla Superior de 6 Accesos Rápidos */}
        <section className="top-grid-section">
          <div className="spotify-grid">
            {topGrid.map((item) => {
              const hasSongs = item.songs && item.songs.length > 0;
              const isPlayingHere = isPlaying && item.songs.some(s => s.id === currentSong?.id);

              return (
                <div 
                  key={item.id} 
                  className={`grid-card ${isPlayingHere ? 'playing' : ''}`}
                  onClick={() => hasSongs && handlePlayMix(item.songs)}
                >
                  <div className="grid-card-left">
                    {item.type === 'liked' ? (
                      <div className="liked-gradient-box">
                        <Heart size={20} fill="white" color="white" />
                      </div>
                    ) : item.coverUrl ? (
                      <img src={item.coverUrl} alt="" className="grid-card-cover" />
                    ) : (
                      <div className="grid-card-placeholder">🎵</div>
                    )}
                  </div>
                  <div className="grid-card-right">
                    <span className="grid-card-title">{item.title}</span>
                    {hasSongs && (
                      <button className="grid-play-bubble">
                        {isPlayingHere ? (
                          <Pause size={14} fill="black" color="black" />
                        ) : (
                          <Play size={14} fill="black" color="black" style={{ marginLeft: '2px' }} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Carrusel 1: Mixes Recomendados */}
        {mixes.length > 0 && (
          <section className="home-section-spotify">
            <h2 className="section-title-spotify">Tus mixes diarios</h2>
            <div className="horizontal-scroll scrollbar-hidden">
              {mixes.map((mix) => {
                const isPlayingHere = isPlaying && mix.songs.some(s => s.id === currentSong?.id);

                return (
                  <div key={mix.id} className="scroll-card">
                    <div className="scroll-card-cover-wrapper" onClick={() => handlePlayMix(mix.songs)}>
                      {mix.coverUrl ? (
                        <img src={mix.coverUrl} alt={mix.title} className="scroll-card-cover" />
                      ) : (
                        <div className="scroll-card-placeholder">🎵</div>
                      )}
                      <button className={`card-play-bubble ${isPlayingHere ? 'visible' : ''}`}>
                        {isPlayingHere ? (
                          <Pause size={18} fill="black" color="black" />
                        ) : (
                          <Play size={18} fill="black" color="black" style={{ marginLeft: '3px' }} />
                        )}
                      </button>
                    </div>
                    <div className="scroll-card-info">
                      <h4 className="scroll-card-title">{mix.title}</h4>
                      <p className="scroll-card-desc">{mix.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Carrusel 2: Escuchado Recientemente */}
        {recentlyPlayed.length > 0 && (
          <section className="home-section-spotify">
            <h2 className="section-title-spotify">Escuchado recientemente</h2>
            <div className="horizontal-scroll scrollbar-hidden">
              {recentlyPlayed.map((song) => {
                const isActive = currentSong?.id === song.id;
                const isDownloaded = downloadedIds.includes(song.id);

                return (
                  <div key={song.id} className={`scroll-card ${isActive ? 'active' : ''}`}>
                    <div className="scroll-card-cover-wrapper" onClick={() => handleSongClick(song)}>
                      <img src={song.cover_url} alt="" className="scroll-card-cover" />
                      <button className={`card-play-bubble ${isActive && isPlaying ? 'visible' : ''}`}>
                        {isActive && isPlaying ? (
                          <Pause size={18} fill="black" color="black" />
                        ) : (
                          <Play size={18} fill="black" color="black" style={{ marginLeft: '3px' }} />
                        )}
                      </button>
                      <button 
                        className="card-options-bubble"
                        onClick={(e) => { e.stopPropagation(); setActiveSongMenu(song); }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                    <div className="scroll-card-info">
                      <h4 className="scroll-card-title flex-title">
                        {song.title}
                        {isDownloaded && <span className="green-dl-dot" title="Descargado offline">▼</span>}
                      </h4>
                      <p className="scroll-card-desc">{song.artist}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Carrusel 3: Recomendado Para Ti */}
        {recommendedTracks.length > 0 && (
          <section className="home-section-spotify">
            <h2 className="section-title-spotify flex-header-inline">
              <span>Recomendados para hoy</span>
            </h2>
            <div className="horizontal-scroll scrollbar-hidden">
              {recommendedTracks.map((song) => {
                const isActive = currentSong?.id === song.id;
                const isDownloaded = downloadedIds.includes(song.id);

                return (
                  <div key={song.id} className={`scroll-card ${isActive ? 'active' : ''}`}>
                    <div className="scroll-card-cover-wrapper" onClick={() => handleSongClick(song)}>
                      <img src={song.cover_url} alt="" className="scroll-card-cover" />
                      <button className={`card-play-bubble ${isActive && isPlaying ? 'visible' : ''}`}>
                        {isActive && isPlaying ? (
                          <Pause size={18} fill="black" color="black" />
                        ) : (
                          <Play size={18} fill="black" color="black" style={{ marginLeft: '3px' }} />
                        )}
                      </button>
                      <button 
                        className="card-options-bubble"
                        onClick={(e) => { e.stopPropagation(); setActiveSongMenu(song); }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                    <div className="scroll-card-info">
                      <h4 className="scroll-card-title flex-title">
                        {song.title}
                        {isDownloaded && <span className="green-dl-dot" title="Descargado offline">▼</span>}
                      </h4>
                      <p className="scroll-card-desc">{song.artist}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Caso en que no haya canciones en la base de datos */}
        {allSongs.length === 0 && (
          <div className="home-empty-spotify">
            <div className="empty-musical-note">🎵</div>
            <h3>No hay música disponible</h3>
            {isOfflineMode ? (
              <p>No tienes canciones descargadas para escuchar offline. Ve a tu configuración o conéctate a internet.</p>
            ) : (
              <p>Puedes subir canciones y configurar carátulas en tu panel de administración.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
