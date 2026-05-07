import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Shuffle, Repeat, Heart, ListMusic, MessageSquare, X } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import GlassButtonWrapper from './ui/GlassButtonWrapper';
import './PlayerBar.css';

export default function PlayerBar() {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const idleTimerRef = useRef(null);

  const { 
    currentSong, 
    isPlaying, 
    togglePlay, 
    playNext, 
    playPrevious,
    volume,
    currentTime,
    duration,
    setCurrentTime,
    setDuration
  } = usePlayerStore();

  const audioRef = useRef(null);

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

  // Scroll automático de las letras
  const lyricsContainerRef = useRef(null);
  useEffect(() => {
    if (showLyrics && lyricsContainerRef.current) {
      const activeLyric = lyricsContainerRef.current.querySelector('.lyric-line.active');
      if (activeLyric) {
        activeLyric.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, showLyrics]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.log("Error reproduciendo audio:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (!currentSong) return null;

  return (
    <>
      {/* Elemento de audio oculto */}
      <audio 
        ref={audioRef} 
        src={currentSong.url} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={playNext}
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
              <img src={currentSong.cover} alt="Portada" />
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
        
        {/* Fondo difuminado basado en el Artista o Portada */}
        <div className="fs-bg" style={{ backgroundImage: `url(${currentSong.artistImage || currentSong.cover})` }}></div>
        <div className="fs-overlay"></div>

        <button className="fs-close-btn" onClick={() => setIsFullScreen(false)}>
          <ChevronDown size={40} />
        </button>

        <div className="fs-content-wrapper">
          
          <div className="fs-left-panel">
            <div className="fs-main-info">
              <img src={currentSong.cover} alt="Portada" className="fs-cover" />
              <div className="fs-text">
                <h1 className="fs-title">{currentSong.title}</h1>
                <h2 className="fs-artist">{currentSong.artist}</h2>
              </div>
            </div>
          </div>

          {currentSong.lyrics && (
            <div className={`fs-right-panel fs-lyrics-container ${showLyrics ? 'visible' : ''}`} ref={lyricsContainerRef}>
              {currentSong.lyrics.map((line, idx) => {
                const isActive = currentTime >= line.time && (idx === currentSong.lyrics.length - 1 || currentTime < currentSong.lyrics[idx + 1].time);
                return (
                  <p key={idx} className={`lyric-line ${isActive ? 'active' : ''}`}>
                    {line.text}
                  </p>
                );
              })}
            </div>
          )}

        </div>

        {/* BARRA INFERIOR DE CONTROLES (Separada para que nunca se mueva a la derecha) */}
        <div className="fs-player-bottom">
          <div className="fs-progress-container">
            <span className="fs-time">{formatTime(currentTime)}</span>
            <input 
              type="range" 
              className="fs-progress-bar" 
              min="0" 
              max={duration || 100} 
              value={currentTime} 
              onChange={handleSeek}
            />
            <span className="fs-time">{formatTime(duration)}</span>
          </div>

          <div className="fs-controls-row">
            
            <div className="fs-controls-side">
              <button className="fs-icon-btn"><Heart size={28} /></button>
            </div>

            <div className="fs-controls">
              <button className="fs-ctrl-btn secondary"><Shuffle size={24} /></button>
              
              <button className="fs-ctrl-btn primary" onClick={playPrevious}>
                <SkipBack size={32} fill="currentColor" />
              </button>
              
              <button className="fs-ctrl-btn fs-play-pause" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                {isPlaying ? <Pause size={36} fill="black" /> : <Play size={36} fill="black" style={{marginLeft: '4px'}} />}
              </button>
              
              <button className="fs-ctrl-btn primary" onClick={playNext}>
                <SkipForward size={32} fill="currentColor" />
              </button>

              <button className="fs-ctrl-btn secondary"><Repeat size={24} /></button>
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
            SIDEBAR DE COLA DE REPRODUCCIÓN
            ================================== */}
        {showQueue && <div className="queue-overlay" onClick={(e) => { e.stopPropagation(); setShowQueue(false); }}></div>}
        <div className={`fs-queue-sidebar ${showQueue ? 'open' : ''}`}>
          <div className="queue-header">
            <h3>A continuación</h3>
            <button className="queue-close-btn" onClick={(e) => { e.stopPropagation(); setShowQueue(false); }}>
              <X size={28} />
            </button>
          </div>
          <div className="queue-list">
            <div className="queue-item active">
              <img src={currentSong.cover} alt="Cover" />
              <div className="queue-info">
                <h4>{currentSong.title}</h4>
                <p>{currentSong.artist}</p>
              </div>
            </div>
            <p className="queue-placeholder">Tus canciones recomendadas aparecerán aquí.</p>
          </div>
        </div>

      </div>
    </>
  );
}
