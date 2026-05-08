import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Shuffle, Repeat, Heart, ListMusic, MessageSquare, X } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import GlassButtonWrapper from './ui/GlassButtonWrapper';
import './PlayerBar.css';
import './PlayerError.css';

export default function PlayerBar() {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const idleTimerRef = useRef(null);

  const { 
    currentSong, 
    queue,
    isPlaying, 
    togglePlay, 
    playNext, 
    playPrevious,
    volume,
    currentTime,
    duration,
    setCurrentTime,
    setDuration,
    fetchSongs,
    playSong,
    // Shuffle y Repeat
    isShuffled,
    repeatMode,
    toggleShuffle,
    toggleRepeat
  } = usePlayerStore();

  const { crossfadeEnabled, crossfadeTime, likedSongs, toggleLike } = useSettingsStore();
  const [isMixing, setIsMixing] = useState(false);
  const isMixingRef = useRef(false); // Ref para leer en effects sin dependencia
  const [activeChannel, setActiveChannel] = useState('A'); // 'A' o 'B'
  const [nextSongInfo, setNextSongInfo] = useState(null);
  const [uiTransition, setUiTransition] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [localCurrentTime, setLocalCurrentTime] = useState(0); // Tiempo local rápido para UI
  
  const audioARef = useRef(null);
  const audioBRef = useRef(null);

  // Wrapper para mantener el ref sincronizado con el state
  const setIsMixingSync = (val) => {
    isMixingRef.current = val;
    setIsMixing(val);
  };

  // Lógica de MIXER PROFESIONAL (Doble Canal Físico)
  useEffect(() => {
    const mainAudio = activeChannel === 'A' ? audioARef.current : audioBRef.current;
    if (mainAudio && isPlaying && crossfadeEnabled) {
      const timeLeft = duration - currentTime;
      
      if (timeLeft > 0 && timeLeft <= crossfadeTime) {
        setIsMixingSync(true);
        const secAudio = activeChannel === 'A' ? audioBRef.current : audioARef.current;

        if (!nextSongInfo) {
          const currentIndex = queue.findIndex(s => s.id === currentSong.id);
          const nextS = queue[(currentIndex + 1) % queue.length];
          if (nextS) {
            setNextSongInfo(nextS);
            secAudio.src = nextS.url;
            secAudio.volume = 0;
            secAudio.play().catch(() => {});
          }
        }

        const fadeRatio = timeLeft / crossfadeTime;
        mainAudio.volume = fadeRatio * volume;
        if (secAudio) {
          secAudio.volume = (0.2 + (1 - fadeRatio) * 0.8) * volume;
        }

        if (fadeRatio <= 0.4) setUiTransition(true);

        // FINALIZACIÓN: Solo rotamos el canal y avanzamos la canción.
        // El reseteo visual se hace en el useEffect de currentSong.id
        if (timeLeft <= 0.2) {
           const savedTime = secAudio.currentTime;
           const savedDuration = secAudio.duration;
           setActiveChannel(activeChannel === 'A' ? 'B' : 'A');
           playNext();
           // Adelantamos la barra de progreso al tiempo de la canción entrante
           setCurrentTime(savedTime);
           setDuration(savedDuration);
        }
      } else {
        mainAudio.volume = volume;
      }
    }
  }, [currentTime, duration, isPlaying, volume, crossfadeEnabled, crossfadeTime, queue, currentSong, activeChannel]);

  // Resetear el estado visual del Mixer SOLO cuando currentSong realmente cambia en el store
  // Esto evita el "flash" de la canción vieja por un frame
  const prevSongIdRef = useRef(null);
  useEffect(() => {
    if (!currentSong) return;
    if (prevSongIdRef.current !== null && prevSongIdRef.current !== currentSong.id) {
      // Pequeño retraso para que el navegador cargue la nueva imagen de fondo 
      // antes de quitar las capas de transición (evita el flash visual)
      setTimeout(() => {
        setNextSongInfo(null);
        setUiTransition(false);
        setIsMixingSync(false);
      }, 100);

      // Limpiar el canal que YA NO es activo para evitar el fantasma de audio
      const staleAudio = activeChannel === 'B' ? audioARef.current : audioBRef.current;
      if (staleAudio) {
        staleAudio.pause();
        staleAudio.src = '';
      }
      // RESET INSTANTÁNEO del scroll: evita que auto-scroll haga el viaje desde
      // la posición antigua hasta la nueva (el "flash" de scroll)
      if (lyricsContainerRef.current) {
        lyricsContainerRef.current.scrollTop = 0;
      }
    }
    prevSongIdRef.current = currentSong.id;
  }, [currentSong?.id]);

  // Sincronizar SRC con el Canal Activo
  // IMPORTANTE: isMixing NO está en las deps para que el mixer no interfiera
  useEffect(() => {
    const main = activeChannel === 'A' ? audioARef.current : audioBRef.current;
    if (!main || !currentSong || isMixingRef.current) return;
    // Comparación robusta: extraer solo el path/url sin dominio para evitar falsos positivos
    const normalize = (url) => {
      try { return new URL(url).pathname + new URL(url).search; } 
      catch { return url; }
    };
    const mainUrl = normalize(main.src);
    const songUrl = normalize(currentSong.url);
    if (mainUrl !== songUrl) {
      main.src = currentSong.url;
      if (isPlaying) main.play().catch(() => {});
    }
  }, [currentSong?.id, activeChannel]);


  // Sincronizar PLAY/PAUSE global
  useEffect(() => {
    const main = audioARef.current;
    const sec = audioBRef.current;
    if (isPlaying) {
      if (activeChannel === 'A') main?.play().catch(() => {});
      else sec?.play().catch(() => {});
    } else {
      main?.pause();
      sec?.pause();
    }
  }, [isPlaying, activeChannel]);

  const [nextCurrentTime, setNextCurrentTime] = useState(0);
  const [nextDuration, setNextDuration] = useState(0);

  const handleLoadedMetadata = (e) => {
    const audio = e.target;
    const isMainChannel = (activeChannel === 'A' && audio === audioARef.current) || 
                          (activeChannel === 'B' && audio === audioBRef.current);
    const isSecondaryChannel = (activeChannel === 'A' && audio === audioBRef.current) || 
                               (activeChannel === 'B' && audio === audioARef.current);
    if (isMainChannel && audio.duration) setDuration(audio.duration);
    if (isSecondaryChannel && audio.duration) setNextDuration(audio.duration);
  };

  const handleTimeUpdate = (e) => {
    const audio = e.target;
    const isMainChannel = (activeChannel === 'A' && audio === audioARef.current) || 
                          (activeChannel === 'B' && audio === audioBRef.current);
    const isSecondaryChannel = (activeChannel === 'A' && audio === audioBRef.current) || 
                               (activeChannel === 'B' && audio === audioARef.current);
    if (isMainChannel) {
      setLocalCurrentTime(audio.currentTime);
      setCurrentTime(audio.currentTime);
      if (audio.duration) setDuration(audio.duration);
    }
    // Rastrear el tiempo del canal secundario para la barra de progreso
    if (isSecondaryChannel) {
      setNextCurrentTime(audio.currentTime);
      if (audio.duration) setNextDuration(audio.duration);
    }
  };

  const handleAudioError = (e) => {
    const audio = e.target;
    
    // FILTRO ROBUSTO: Solo mostrar error si hay un src real que NO sea el del sitio actual
    // y si la canción actual existe. Esto evita el error al limpiar canales del mixer.
    const currentUrl = window.location.origin + '/';
    if (!audio.getAttribute('src') || audio.src === currentUrl || audio.src === window.location.href) {
      return;
    }
    
    console.error("Error real cargando audio:", audio.src);
    setErrorMessage("Error de conexión: No se pudo cargar la música.");
    
    if (isPlaying) setIsMixingSync(false);
    setTimeout(() => setErrorMessage(null), 6000);
  };

  // Cargar música real de la base de datos al iniciar
  useEffect(() => {
    fetchSongs();
  }, []);

  // Lógica de inactividad (Idle) para el modo TV
  useEffect(() => {
    if (!isFullScreen) {
      setIsIdle(false);
      return;
    }

    const resetIdle = () => {
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      
      // El idle funciona incluso si está la letra activada
      if (isPlaying) {
        idleTimerRef.current = setTimeout(() => {
          setIsIdle(true);
        }, 4000); 
      }
    };

    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('click', resetIdle);
    window.addEventListener('touchstart', resetIdle);

    resetIdle();

    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('click', resetIdle);
      window.removeEventListener('touchstart', resetIdle);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isFullScreen, isPlaying]);

  // Scroll automático de letras ACTUALES
  const lyricsContainerRef = useRef(null);
  useEffect(() => {
    if (showLyrics && lyricsContainerRef.current) {
      const activeLyric = lyricsContainerRef.current.querySelector('.lyric-line.active');
      if (activeLyric) {
        activeLyric.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, showLyrics]);

  // Scroll automático de letras ENTRANTES (para que al tomar el relevo esté en su sitio)
  const nextLyricsContainerRef = useRef(null);
  useEffect(() => {
    if (showLyrics && nextLyricsContainerRef.current) {
      const activeLyric = nextLyricsContainerRef.current.querySelector('.lyric-line.active');
      if (activeLyric) {
        // Scroll instantáneo (sin animar) para que esté alineado antes del relevo
        activeLyric.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }
  }, [nextCurrentTime, showLyrics]);

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    const activeAudio = activeChannel === 'A' ? audioARef.current : audioBRef.current;
    if (activeAudio) {
      activeAudio.currentTime = time;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Parsear letras (Soporta LRC Sincronizado y Texto Plano)
  // OPTIMIZADO: Solo se procesa cuando la canción cambia
  const parsedLyrics = useMemo(() => {
    if (!currentSong?.lyrics) return [];
    return currentSong.lyrics.split('\n').map((line, index) => {
      const timeMatch = line.match(/\[(\d+):(\d+\.\d+)\]/);
      if (timeMatch) {
        return { 
          time: parseInt(timeMatch[1]) * 60 + parseFloat(timeMatch[2]), 
          text: line.replace(/\[\d+:\d+\.\d+\]/, '').trim() 
        };
      }
      return { time: index * 0.001, text: line.trim() }; 
    }).filter(l => l.text).sort((a, b) => a.time - b.time);
  }, [currentSong?.id, currentSong?.lyrics]);

  if (!currentSong) return null;

  return (
    <>
      {/* Elemento de audio principal - SIN KEY para evitar saltos y errores AbortError */}
      <audio 
        ref={audioARef} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleAudioError}
        onEnded={() => {
          if (activeChannel === 'A' && !isMixing) playNext();
        }} 
      />
      <audio 
        ref={audioBRef} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleAudioError}
        onEnded={() => {
          if (activeChannel === 'B' && !isMixing) playNext();
        }} 
      />

      {/* ==================================
          MINI PÍLDORA PREVIA (Modo Desktop) 
          ================================== */}
      <div className={`mini-player-pill-container ${isFullScreen ? 'hidden' : ''}`} onClick={() => setIsFullScreen(true)}>
        <GlassButtonWrapper 
          radius="25" 
          depth="10" 
          blur="3" 
          strength="10" 
          background-color="rgba(15, 15, 15, 0.6)" 
          chromatic-aberration="2"
        >
          <div className="mini-pill-content">
            <div className="mini-album">
              <img src={currentSong.cover_url} alt="Portada" />
              {isPlaying && <div className="mini-playing-indicator"><span className="bar"></span><span className="bar"></span><span className="bar"></span></div>}
            </div>
            <div className="mini-info">
              <span className="mini-title">{currentSong.title}</span>
              <span className="mini-artist">{currentSong.artist}</span>
            </div>
          </div>
        </GlassButtonWrapper>
      </div>

      {/* ==================================
          FULLSCREEN TV PLAYER 
          ================================== */}
      <div className={`fullscreen-tv-player ${isFullScreen ? 'open' : ''} ${isIdle ? 'is-idle' : ''} ${showLyrics ? 'lyrics-mode' : ''}`}>
        
        {/* FONDO DINÁMICO (Capas) */}
        <div className={`fs-bg ${uiTransition ? 'fading-out' : ''}`} style={{ backgroundImage: `url(${currentSong.background_url || currentSong.cover_url})` }}></div>
        {nextSongInfo && <div className={`fs-bg next-bg ${uiTransition ? 'visible' : ''}`} style={{ backgroundImage: `url(${nextSongInfo.background_url || nextSongInfo.cover_url})` }}></div>}
        <div className="fs-overlay"></div>

        <button className="fs-close-btn" onClick={() => setIsFullScreen(false)}>
          <ChevronDown size={40} />
        </button>

        <div className="fs-content-wrapper">
          <div className="fs-left-panel">
            {/* Capa Actual */}
            <div className={`fs-main-info ${uiTransition ? 'fading-out' : ''}`}>
              <div className="premium-cover-container">
                <img src={currentSong.cover_url} alt="Portada" className="fs-cover animated-cover" />
                <div className="shine-overlay"></div>
              </div>
              <div className="fs-text">
                <h1 className="fs-title">{currentSong.title}</h1>
                <h2 className="fs-artist">{currentSong.artist}</h2>
              </div>
            </div>

            {/* Capa Entrante (Solo durante el Mix) */}
            {nextSongInfo && (
              <div className={`fs-main-info next-info ${uiTransition ? 'fading-in' : ''}`}>
                <div className="premium-cover-container">
                  <img src={nextSongInfo.cover_url} alt="Portada" className="fs-cover animated-cover" />
                  <div className="shine-overlay"></div>
                </div>
                <div className="fs-text">
                  <h1 className="fs-title">{nextSongInfo.title}</h1>
                  <h2 className="fs-artist">{nextSongInfo.artist}</h2>
                </div>
              </div>
            )}
          </div>

          {/* Letras canción ACTUAL (se desvanece con el Mixer) */}
          {parsedLyrics.length > 0 && (
            <div className={`fs-right-panel fs-lyrics-container ${showLyrics ? 'visible' : ''} ${uiTransition ? 'fading-out' : ''}`} ref={lyricsContainerRef}>
              {parsedLyrics.map((line, idx) => {
                // OFFSET DE SINCRONIZACIÓN: Añadimos 200ms para compensar el retardo de renderizado
                const displayTime = localCurrentTime + 0.2;
                const isActive = displayTime >= line.time && (idx === parsedLyrics.length - 1 || displayTime < parsedLyrics[idx + 1].time);
                return (
                  <p key={idx} className={`lyric-line ${isActive ? 'active' : ''}`}>
                    {line.text}
                  </p>
                );
              })}
            </div>
          )}

          {/* Letras canción ENTRANTE (aparece sincronizada con la portada nueva) */}
          {nextSongInfo && showLyrics && (() => {
            const nextLyrics = nextSongInfo.lyrics ? nextSongInfo.lyrics.split('\n').map((line, index) => {
              const timeMatch = line.match(/\[(\d+):(\d+\.\d+)\]/);
              if (timeMatch) {
                return { time: parseInt(timeMatch[1]) * 60 + parseFloat(timeMatch[2]), text: line.replace(/\[\d+:\d+\.\d+\]/, '').trim() };
              }
              return { time: index * 0.001, text: line.trim() };
            }).filter(l => l.text).sort((a, b) => a.time - b.time) : [];

            if (nextLyrics.length === 0) return null;

            return (
              <div ref={nextLyricsContainerRef} className={`fs-right-panel fs-lyrics-container next-lyrics-panel ${uiTransition ? 'fading-in' : ''}`}>
                {nextLyrics.map((line, idx) => {
                  // Sincronizar con el tiempo del canal secundario (canción entrante)
                  const displayTime = nextCurrentTime + 0.2;
                  const isActive = displayTime >= line.time && 
                    (idx === nextLyrics.length - 1 || displayTime < nextLyrics[idx + 1].time);
                  return (
                    <p key={idx} className={`lyric-line ${isActive ? 'active' : ''}`}>
                      {line.text}
                    </p>
                  );
                })}
              </div>
            );
          })()}

        </div>

        {/* BARRA INFERIOR DE CONTROLES */}
        <div className="fs-player-bottom">
          
          {/* AVISO DE ERROR (Si existe) */}
          {errorMessage && (
            <div className="player-error-toast">
              <X size={14} style={{ marginRight: '8px' }} />
              {errorMessage}
            </div>
          )}

          <div className="fs-progress-container">
            <span className="fs-time">{formatTime(uiTransition ? nextCurrentTime : currentTime)}</span>
            <input 
              type="range" 
              className={`fs-progress-bar ${uiTransition ? 'transitioning' : ''}`}
              min="0" 
              max={(uiTransition ? nextDuration : duration) || 100} 
              value={uiTransition ? nextCurrentTime : currentTime} 
              onChange={handleSeek}
            />
            <span className="fs-time">{formatTime(uiTransition ? nextDuration : duration)}</span>
          </div>

          <div className="fs-controls-row">
            
            <div className="fs-controls-side">
              <button
                className={`fs-icon-btn ${likedSongs.includes(currentSong?.id) ? 'active' : ''}`}
                onClick={() => currentSong && toggleLike(currentSong.id)}
                title="Me gusta"
              >
                <Heart size={28} fill={likedSongs.includes(currentSong?.id) ? 'currentColor' : 'none'} />
              </button>
              {crossfadeEnabled && (
                <span className={`mixer-indicator ${isMixing ? 'active-pulse' : ''}`}>
                  MIXER
                </span>
              )}
            </div>

            <div className="fs-controls">
              <button
                className={`fs-ctrl-btn secondary ${isShuffled ? 'active-mode' : ''}`}
                onClick={toggleShuffle}
                title="Aleatorio"
              >
                <Shuffle size={24} />
              </button>
              
              <button className="fs-ctrl-btn primary" onClick={playPrevious}>
                <SkipBack size={32} fill="currentColor" />
              </button>
              
              <button className="fs-ctrl-btn fs-play-pause" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                {isPlaying ? <Pause size={36} fill="black" /> : <Play size={36} fill="black" style={{marginLeft: '4px'}} />}
              </button>
              
              <button className="fs-ctrl-btn primary" onClick={playNext}>
                <SkipForward size={32} fill="currentColor" />
              </button>

              <button
                className={`fs-ctrl-btn secondary ${repeatMode !== 'none' ? 'active-mode' : ''}`}
                onClick={toggleRepeat}
                title={repeatMode === 'one' ? 'Repetir una' : repeatMode === 'all' ? 'Repetir todo' : 'Sin repetir'}
              >
                {repeatMode === 'one'
                  ? <Repeat size={24} strokeWidth={2.5} />
                  : <Repeat size={24} />}
                {repeatMode === 'one' && <span style={{ position: 'absolute', fontSize: '9px', fontWeight: 'bold', bottom: '2px', right: '2px' }}>1</span>}
              </button>
            </div>

            <div className="fs-controls-side right-side">
                <button 
                  className={`fs-icon-btn ${showLyrics ? 'active' : ''}`} 
                  onClick={(e) => { e.stopPropagation(); setShowLyrics(!showLyrics); setShowQueue(false); }}
                >
                  <MessageSquare size={28} fill={showLyrics ? "currentColor" : "none"} />
                </button>
                <button 
                  className={`fs-icon-btn ${showQueue ? 'active' : ''}`} 
                  onClick={(e) => { e.stopPropagation(); setShowQueue(!showQueue); setShowLyrics(false); }}
                >
                  <ListMusic size={28} />
                </button>
              </div>

          </div>
        </div>
        
        {/* ==================================
            SIDEBAR DE COLA DE REPRODUCCIÓN (Real)
            ================================== */}
        {showQueue && <div className="queue-overlay" onClick={(e) => { e.stopPropagation(); setShowQueue(false); }}></div>}
        <div className={`fs-queue-sidebar ${showQueue ? 'open' : ''}`}>
          <div className="queue-header">
            <h3>Librería Musicfy</h3>
            <button className="queue-close-btn" onClick={(e) => { e.stopPropagation(); setShowQueue(false); }}>
              <X size={28} />
            </button>
          </div>
          <div className="queue-list">
            {queue.map(song => (
              <div 
                key={song.id} 
                className={`queue-item ${currentSong?.id === song.id ? 'active' : ''}`}
                onClick={() => playSong(song)}
              >
                <img src={song.cover_url} alt="Cover" />
                <div className="queue-info">
                  <h4>{song.title}</h4>
                  <p>{song.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
