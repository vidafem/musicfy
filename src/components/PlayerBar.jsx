import React, { useRef, useEffect, useState } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, ChevronDown, Shuffle, Repeat, 
  Heart, ListMusic, MessageSquare, Activity, X, Monitor, Smartphone, Volume2 
} from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useLibraryStore } from '../store/useLibraryStore';
import GlassButtonWrapper from './ui/GlassButtonWrapper';
import { useMixer } from '../hooks/useMixer';
import { useLyrics } from '../hooks/useLyrics';
import { useIdle } from '../hooks/useIdle';
import './PlayerBar.css';
import './PlayerError.css';

export default function PlayerBar({ mobileDockMode = 'player', onMobileDockModeChange }) {
  const isFullScreen = usePlayerStore(state => state.isFullScreen);
  const setIsFullScreen = usePlayerStore(state => state.setIsFullScreen);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  
  const currentSong = usePlayerStore(state => state.currentSong);
  const queue = usePlayerStore(state => state.queue);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const togglePlay = usePlayerStore(state => state.togglePlay);
  const playNext = usePlayerStore(state => state.playNext);
  const playPrevious = usePlayerStore(state => state.playPrevious);
  const volume = usePlayerStore(state => state.volume);
  const currentTime = usePlayerStore(state => state.currentTime);
  const duration = usePlayerStore(state => state.duration);
  const playbackUpdatedAt = usePlayerStore(state => state.playbackUpdatedAt);
  const setCurrentTime = usePlayerStore(state => state.setCurrentTime);
  const setDuration = usePlayerStore(state => state.setDuration);
  const fetchSongs = usePlayerStore(state => state.fetchSongs);
  const playSong = usePlayerStore(state => state.playSong);
  
  const isShuffled = useSettingsStore(state => state.isShuffled);
  const repeatMode = useSettingsStore(state => state.repeatMode);
  const toggleShuffle = usePlayerStore(state => state.toggleShuffle);
  const toggleRepeat = usePlayerStore(state => state.toggleRepeat);
  
  const deviceId = usePlayerStore(state => state.deviceId);
  const activeDeviceId = usePlayerStore(state => state.activeDeviceId);
  const initConnect = usePlayerStore(state => state.initConnect);
  const onlineDevices = usePlayerStore(state => state.onlineDevices);
  const transferPlayback = usePlayerStore(state => state.transferPlayback);
  const broadcastState = usePlayerStore(state => state.broadcastState);
  const mixerState = usePlayerStore(state => state.mixerState);
  const setMixerState = usePlayerStore(state => state.setMixerState);
  const clearMixerState = usePlayerStore(state => state.clearMixerState);
  const user = useAuthStore(state => state.user);
  
  const showDeviceSelector = usePlayerStore(state => state.showDeviceSelector);
  const setShowDeviceSelector = usePlayerStore(state => state.setShowDeviceSelector);
  const [showVolumeHud, setShowVolumeHud] = useState(false);
  const volumeHudTimerRef = useRef(null);

  // Efecto para mostrar HUD de volumen al cambiar
  useEffect(() => {
    setShowVolumeHud(true);
    if (volumeHudTimerRef.current) clearTimeout(volumeHudTimerRef.current);
    volumeHudTimerRef.current = setTimeout(() => setShowVolumeHud(false), 2000);
    return () => { if (volumeHudTimerRef.current) clearTimeout(volumeHudTimerRef.current); };
  }, [volume]);
  const crossfadeEnabled = useSettingsStore(state => state.crossfadeEnabled);
  const crossfadeTime = useSettingsStore(state => state.crossfadeTime);
  
  const likedSongs = useLibraryStore(state => state.likedSongs);
  const toggleLike = useLibraryStore(state => state.toggleLike);

  const audioARef = useRef(null);
  const audioBRef = useRef(null);
  const isMasterDevice = !activeDeviceId || activeDeviceId === deviceId;
  const [errorMessage, setErrorMessage] = useState(null);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const lastAudioTickRef = useRef(0);

  // Hook del Mezclador
  const { 
    activeChannel, setActiveChannel, isMixing, nextSongInfo, uiTransition, 
    nextCurrentTime, setNextCurrentTime, nextDuration, setNextDuration,
    resetMixingState, isMixingRef 
  } = useMixer({
    currentSong, queue, currentTime, isPlaying, volume, crossfadeEnabled, crossfadeTime,
    activeDeviceId, deviceId, playNext, setCurrentTime, setDuration,
    clearMixerState, setMixerState, mixerState, audioARef, audioBRef
  });

  // Hook de Letras
  const { parsedLyrics, lyricsContainerRef } = useLyrics(currentSong, localCurrentTime, showLyrics);
  
  // Hook de Inactividad
  const isIdle = useIdle(isFullScreen, isPlaying);

  // Sincronizar SRC con el Canal Activo
  useEffect(() => {
    const main = audioARef.current;
    const sec = audioBRef.current;
    if (!main || !sec || !currentSong || isMixingRef.current) return;

    const activeAudio = activeChannel === 'A' ? main : sec;
    const normalize = (url) => { try { return new URL(url).pathname + new URL(url).search; } catch { return url; } };

    if (normalize(activeAudio.src) !== normalize(currentSong.url)) {
      activeAudio.src = currentSong.url;
      if (isPlaying && activeDeviceId === deviceId) activeAudio.play().catch(() => {});
    }
  }, [currentSong?.id, activeChannel, activeDeviceId, deviceId, isPlaying]);

  // Sincronizar PLAY/PAUSE
  useEffect(() => {
    const main = audioARef.current;
    const sec = audioBRef.current;
    if (!main || !sec) return;
    const isMaster = !activeDeviceId || activeDeviceId === deviceId;

    if (isPlaying) {
      if (isMaster) {
        if (activeChannel === 'A') { main.play().catch(() => {}); sec.pause(); }
        else { sec.play().catch(() => {}); main.pause(); }
        main.muted = sec.muted = false;
      } else {
        main.pause(); sec.pause(); main.muted = sec.muted = true;
      }
    } else {
      main.pause(); sec.pause();
    }
  }, [isPlaying, activeChannel, activeDeviceId, deviceId]);

  // Reloj de predicción para espejos
  useEffect(() => {
    if (isMasterDevice) return;
    if (!isPlaying) { setLocalCurrentTime(currentTime); return; }

    const interval = setInterval(() => {
      const elapsed = Math.max(0, (Date.now() - playbackUpdatedAt) / 1000);
      setLocalCurrentTime(currentTime + elapsed);
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, isMasterDevice, currentTime, playbackUpdatedAt]);

  // Sincronización del Audio con el Estado (Para Espejos y Maestros)
  useEffect(() => {
    if (isMasterDevice) {
      const activeAudio = activeChannel === 'A' ? audioARef.current : audioBRef.current;
      if (!activeAudio) return;

      // Solo forzamos el seek si el cambio vino de un comando REMOTO (otra persona movió la barra)
      // O si hay una deriva (drift) masiva que corregir
      const drift = Math.abs((activeAudio.currentTime || 0) - currentTime);
      const isRemoteUpdate = Date.now() - playbackUpdatedAt < 1000;

      if (isRemoteUpdate && drift > 1.5) {
        if (Number.isFinite(currentTime)) {
          console.log("[Player] 🔄 Sincronización remota forzada:", currentTime);
          activeAudio.currentTime = currentTime;
        }
      }
    }
  }, [currentTime, playbackUpdatedAt, isMasterDevice, activeChannel]);

  const handleLoadedMetadata = (e) => {
    const audio = e.target;
    const isMain = (activeChannel === 'A' && audio === audioARef.current) || (activeChannel === 'B' && audio === audioBRef.current);
    if (isMain && audio.duration) setDuration(audio.duration);
    else if (audio.duration) setNextDuration(audio.duration);
  };

  const handleTimeUpdate = (e) => {
    const audio = e.target;
    const mainAudio = activeChannel === 'A' ? audioARef.current : audioBRef.current;
    const secondaryAudio = activeChannel === 'A' ? audioBRef.current : audioARef.current;
    if (isMasterDevice) {
      if (audio === secondaryAudio) {
        setNextCurrentTime(audio.currentTime || 0);
        if (audio.duration) setNextDuration(audio.duration);
        return;
      }

      if (audio !== mainAudio) return;

      setCurrentTime(audio.currentTime);
      if (audio.duration) setDuration(audio.duration);
      lastAudioTickRef.current = Date.now();
      setLocalCurrentTime(audio.currentTime);
    }
  };

  const handleAudioError = (e) => {
    const audio = e.target;
    if (!audio.getAttribute('src') || audio.src.includes(window.location.origin)) return;
    setErrorMessage("Error de conexión: No se pudo cargar la música.");
    setTimeout(() => setErrorMessage(null), 6000);
  };

  // --- MEDIA SESSION API (Control desde pantalla de bloqueo) ---
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album || 'Musicfy',
        artwork: [
          { src: currentSong.cover_url, sizes: '96x96', type: 'image/png' },
          { src: currentSong.cover_url, sizes: '128x128', type: 'image/png' },
          { src: currentSong.cover_url, sizes: '192x192', type: 'image/png' },
          { src: currentSong.cover_url, sizes: '256x256', type: 'image/png' },
          { src: currentSong.cover_url, sizes: '384x384', type: 'image/png' },
          { src: currentSong.cover_url, sizes: '512x512', type: 'image/png' },
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      
      // Actualizar estado de reproducción en el sistema
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [currentSong, isPlaying, togglePlay, playNext, playPrevious]);

  useEffect(() => {
    fetchSongs();
    if (user?.id) return initConnect(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!isPlaying || !isMasterDevice) return;
    const interval = setInterval(() => broadcastState(), 3000);
    return () => clearInterval(interval);
  }, [isPlaying, isMasterDevice, broadcastState]);

  // --- PRE-FETCHING (Carga anticipada de la siguiente canción) ---
  useEffect(() => {
    if (duration > 0 && (duration - currentTime < 15)) {
      const currentIndex = queue.findIndex(s => s.id === currentSong?.id);
      const nextSong = queue[currentIndex + 1];
      if (nextSong && nextSong.url) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = nextSong.url;
        link.as = 'audio';
        document.head.appendChild(link);
      }
    }
  }, [currentTime, duration, queue, currentSong]);

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time, true); // true indica que viene de la UI y debe propagarse
    const activeAudio = activeChannel === 'A' ? audioARef.current : audioBRef.current;
    if (activeAudio && isMasterDevice) activeAudio.currentTime = time;
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  if (!currentSong || (!isPlaying && !isFullScreen)) return null;

  return (
    <>
      <audio ref={audioARef} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onError={handleAudioError} muted={Boolean(activeDeviceId && activeDeviceId !== deviceId)} onEnded={() => activeChannel === 'A' && !isMixing && playNext()} />
      <audio ref={audioBRef} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onError={handleAudioError} muted={Boolean(activeDeviceId && activeDeviceId !== deviceId)} onEnded={() => activeChannel === 'B' && !isMixing && playNext()} />

      {/* MINI PÍLDORA EXCLUSIVA PARA TV/DESKTOP */}
      <div className={`mini-player-pill-container tv-only ${(!currentSong || isFullScreen) ? 'hidden' : ''}`} onClick={() => setIsFullScreen(true)}>
        <GlassButtonWrapper radius="25" depth="10" blur="3" strength="10" background-color="rgba(15, 15, 15, 0.6)" chromatic-aberration="2">
          <div className="mini-pill-content">
            <div className="mini-album">
              <img src={currentSong.cover_url} alt="Portada" />
              {isPlaying && <div className="mini-playing-indicator"><span className="bar"></span><span className="bar"></span><span className="bar"></span></div>}
            </div>
            <div className="mini-info"><span className="mini-title">{currentSong.title}</span><span className="mini-artist">{currentSong.artist}</span></div>
          </div>
        </GlassButtonWrapper>
      </div>

      <div className={`fullscreen-tv-player ${isFullScreen ? 'open' : ''} ${isIdle ? 'is-idle' : ''} ${showLyrics ? 'lyrics-mode' : ''}`}>
        
        {/* HUD de Volumen Temporal (Aparece al cambiar volumen) */}
        {showVolumeHud && (
          <div className="volume-hud">
            <Volume2 size={20} />
            <div className="volume-hud-bar">
              <div className="volume-hud-progress" style={{ width: `${volume * 100}%` }}></div>
            </div>
          </div>
        )}
        <div className={`fs-bg ${uiTransition ? 'fading-out' : ''}`} style={{ backgroundImage: `url(${currentSong.background_url || currentSong.cover_url})` }}></div>
        {nextSongInfo && <div className={`fs-bg next-bg ${uiTransition ? 'visible' : ''}`} style={{ backgroundImage: `url(${nextSongInfo.background_url || nextSongInfo.cover_url})` }}></div>}
        <div className="fs-overlay"></div>

        <button className="fs-close-btn" onClick={() => setIsFullScreen(false)}><ChevronDown size={40} /></button>

        <div className="fs-content-wrapper">
          <div className="fs-left-panel">
            <div className={`fs-main-info ${uiTransition ? 'fading-out' : ''}`}>
              <div className="premium-cover-container"><img src={currentSong.cover_url} alt="Portada" className="fs-cover animated-cover" /><div className="shine-overlay"></div></div>
              <div className="fs-text"><h1 className="fs-title">{currentSong.title}</h1><h2 className="fs-artist">{currentSong.artist}</h2></div>
            </div>
            {nextSongInfo && (
              <div className={`fs-main-info next-info ${uiTransition ? 'fading-in' : ''}`}>
                <div className="premium-cover-container"><img src={nextSongInfo.cover_url} alt="Portada" className="fs-cover animated-cover" /><div className="shine-overlay"></div></div>
                <div className="fs-text"><h1 className="fs-title">{nextSongInfo.title}</h1><h2 className="fs-artist">{nextSongInfo.artist}</h2></div>
              </div>
            )}
          </div>

          {parsedLyrics.length > 0 && (
            <div className={`fs-right-panel fs-lyrics-container ${showLyrics ? 'visible' : ''} ${uiTransition ? 'fading-out' : ''}`} ref={lyricsContainerRef}>
              {parsedLyrics.map((line, idx) => {
                const isActive = (localCurrentTime + 0.2) >= line.time && (idx === parsedLyrics.length - 1 || (localCurrentTime + 0.2) < parsedLyrics[idx + 1].time);
                return <p key={idx} className={`lyric-line ${isActive ? 'active' : ''}`}>{line.text}</p>;
              })}
            </div>
          )}
        </div>

        <div className="fs-player-bottom">
          {errorMessage && <div className="player-error-toast"><X size={14} style={{ marginRight: '8px' }} />{errorMessage}</div>}
          <div className="fs-progress-container">
            <span className="fs-time">{formatTime(uiTransition ? nextCurrentTime : currentTime)}</span>
            <input type="range" className={`fs-progress-bar ${uiTransition ? 'transitioning' : ''}`} min="0" max={(uiTransition ? nextDuration : duration) || 100} value={uiTransition ? nextCurrentTime : currentTime} onChange={handleSeek} />
            <span className="fs-time">{formatTime(uiTransition ? nextDuration : duration)}</span>
          </div>

          <div className="fs-controls-row">
            <div className="fs-controls-side">
              <button className={`fs-icon-btn ${likedSongs.includes(currentSong?.id) ? 'active' : ''}`} onClick={() => currentSong && toggleLike(currentSong.id)}><Heart size={28} fill={likedSongs.includes(currentSong?.id) ? 'currentColor' : 'none'} /></button>
              {crossfadeEnabled && <span className={`mixer-indicator ${isMixing ? 'active-pulse' : ''}`}>MIXER</span>}
              <div className="connect-wrapper">
                <div className={`connect-indicator ${activeDeviceId === deviceId ? 'is-principal' : 'is-mirror'}`} onClick={() => setShowDeviceSelector(!showDeviceSelector)}>
                  {activeDeviceId === deviceId ? <div className="playing-bars neon-bars"><span></span><span></span><span></span></div> : <Activity size={20} className="neon-inactive" style={{ color: 'rgba(255,255,255,0.2)' }} />}
                </div>
                {showDeviceSelector && (
                  <div className="device-selector-popup">
                    <div className="device-selector-header"><span>Conectar a un dispositivo</span><button onClick={() => setShowDeviceSelector(false)}><X size={14}/></button></div>
                    <div className="device-list">
                      {onlineDevices.map((dev) => (
                        <div key={dev.id} className={`device-item ${activeDeviceId === dev.id ? 'active' : ''}`} onClick={() => { transferPlayback(dev.id); setShowDeviceSelector(false); }}>
                          {dev.name.includes('TV') ? <Monitor size={18}/> : <Smartphone size={18}/>}
                          <div className="device-info"><span className="dev-name">{dev.id === deviceId ? `${dev.name} (Este dispositivo)` : dev.name}</span><span className="dev-status">{activeDeviceId === dev.id ? 'Reproduciendo ahora' : 'Disponible'}</span></div>
                          {activeDeviceId === dev.id && <div className="playing-bars"><span></span><span></span><span></span></div>}
                        </div>
                      ))}
                    </div>
                    {activeDeviceId !== deviceId && (
                      <button className="transfer-full-btn" onClick={() => { transferPlayback(deviceId); setShowDeviceSelector(false); }}>
                        Traer reproducción a este dispositivo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="fs-controls">
              <button className={`fs-ctrl-btn secondary ${isShuffled ? 'active-mode' : ''}`} onClick={toggleShuffle}><Shuffle size={24} /></button>
              <button className="fs-ctrl-btn primary" onClick={playPrevious}><SkipBack size={32} fill="currentColor" /></button>
              <button className="fs-ctrl-btn fs-play-pause" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>{isPlaying ? <Pause size={36} fill="black" /> : <Play size={36} fill="black" style={{marginLeft: '4px'}} />}</button>
              <button className="fs-ctrl-btn primary" onClick={playNext}><SkipForward size={32} fill="currentColor" /></button>
              <button className={`fs-ctrl-btn secondary ${repeatMode !== 'none' ? 'active-mode' : ''}`} onClick={toggleRepeat}>{repeatMode === 'one' ? <Repeat size={24} strokeWidth={2.5} /> : <Repeat size={24} />}{repeatMode === 'one' && <span style={{ position: 'absolute', fontSize: '9px', fontWeight: 'bold', bottom: '2px', right: '2px' }}>1</span>}</button>
            </div>

            <div className="fs-controls-side right-side">
              <button className={`fs-icon-btn ${showLyrics ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setShowLyrics(!showLyrics); setShowQueue(false); }}><MessageSquare size={28} fill={showLyrics ? "currentColor" : "none"} /></button>
              <button className={`fs-icon-btn ${showQueue ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setShowQueue(!showQueue); setShowLyrics(false); }}><ListMusic size={28} /></button>
            </div>
          </div>
        </div>

        {showQueue && <div className="queue-overlay" onClick={() => setShowQueue(false)}></div>}
        <div className={`fs-queue-sidebar ${showQueue ? 'open' : ''}`}>
          <div className="queue-header"><h3>Librería Musicfy</h3><button className="queue-close-btn" onClick={() => setShowQueue(false)}><X size={28} /></button></div>
          <div className="queue-list">{queue.map(song => (<div key={song.id} className={`queue-item ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => playSong(song)}><img src={song.cover_url} alt="Cover" /><div className="queue-info"><h4>{song.title}</h4><p>{song.artist}</p></div></div>))}</div>
        </div>
      </div>
    </>
  );
}
