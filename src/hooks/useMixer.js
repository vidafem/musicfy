import { useState, useEffect, useRef, useCallback } from 'react';
import { isHarmonicallyCompatible, bpmCompatibilityScore, BPMDetector } from '../lib/bpmDetector';

// Método de análisis acústico automático (para guardar BPM y Tonalidad en Supabase)
export async function analyzeSongBPM(song) {
  try {
    const detector = new BPMDetector();
    console.log('[Mixer] Iniciando análisis de BPM para:', song.title);
    const analysis = await detector.analyze(song.url);
    
    if (analysis.bpm) {
      const { supabase } = await import('../supabaseClient');
      const { error } = await supabase
        .from('songs')
        .update({ bpm: analysis.bpm, key_signature: analysis.key, energy: analysis.energy })
        .eq('id', song.id);
        
      if (error) throw error;
      console.log('[Mixer] Análisis guardado en Supabase para:', song.title, analysis);
    }
    return analysis;
  } catch (err) {
    console.warn('[Mixer] Falló analyzeSongBPM:', err);
    return { bpm: null, key: null, energy: null };
  }
}

export function useMixer({
  currentSong,
  queue,
  currentTime,
  isPlaying,
  volume,
  crossfadeEnabled,
  crossfadeTime,
  activeDeviceId,
  deviceId,
  playNext,
  setCurrentTime,
  setDuration,
  clearMixerState,
  setMixerState,
  mixerState, // Recibido del store
  audioARef,
  audioBRef
}) {
  const [activeChannel, setActiveChannel] = useState('A');
  const [isMixing, setIsMixing] = useState(false);
  const isMixingRef = useRef(false);
  const [nextSongInfo, setNextSongInfo] = useState(null);
  const [uiTransition, setUiTransition] = useState(false);
  const [nextCurrentTime, setNextCurrentTime] = useState(0);
  const [nextDuration, setNextDuration] = useState(0);
  const prevSongIdRef = useRef(null);
  const handoffDoneRef = useRef(false);

  const setIsMixingSync = useCallback((val) => {
    isMixingRef.current = val;
    setIsMixing(val);
  }, []);

  // SINCRONIZACIÓN REMOTA DEL MIXER
  const isMaster = !activeDeviceId || activeDeviceId === deviceId;

  useEffect(() => {
    if (isMaster) return;

    if (mixerState && mixerState.active) {
      setIsMixingSync(true);
      setNextSongInfo(mixerState.toSong);
      
      const elapsed = (Date.now() - mixerState.startedAt) / 1000;
      setNextCurrentTime(Math.max(0, elapsed));
      setNextDuration(mixerState.toSong?.duration || 0);
      setUiTransition(elapsed > (mixerState.crossfadeTime * 0.4));
    } else {
      if (isMixingRef.current) {
        setIsMixingSync(false);
        setNextSongInfo(null);
        setUiTransition(false);
        setNextCurrentTime(0);
        setNextDuration(0);
      }
    }
  }, [mixerState, isMaster, setIsMixingSync]);

  useEffect(() => {
    const mainAudio = activeChannel === 'A' ? audioARef.current : audioBRef.current;
    
    // Solo el dispositivo principal ejecuta el audio y la lógica de fade
    if (!isMaster) return;

    if (mainAudio && currentSong && isPlaying && crossfadeEnabled) {
      if (queue.length < 2) {
        mainAudio.volume = volume;
        return;
      }

      // Encontrar la siguiente canción
      const currentIndex = queue.findIndex(s => s.id === currentSong.id);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextS = queue[(safeIndex + 1) % queue.length];

      // Smart Crossfade: Calcular tiempo dinámico según compatibilidad armónica y BPM
      let fadeSeconds = Math.max(1, Number(crossfadeTime) || 1);
      if (nextS) {
        const isCompatible = isHarmonicallyCompatible(currentSong.key_signature, nextS.key_signature);
        const bpmScore = bpmCompatibilityScore(currentSong.bpm, nextS.bpm);
        
        if (!isCompatible || bpmScore < 0.5) {
          // Canciones incompatibles: mezcla más corta para no causar disonancia o desfase rítmico audible
          fadeSeconds = Math.max(1, Math.round(fadeSeconds * 0.5));
        }
      }

      const timeLeft = (mainAudio.duration || 0) - mainAudio.currentTime;

      if (mainAudio.duration > 0 && timeLeft <= (fadeSeconds + 0.5) && timeLeft > 0) {
        if (!isMixingRef.current) {
          console.log(`[Mixer] 🚀 Mezcla Armónica. Tiempo crossfade: ${fadeSeconds}s. Restante: ${timeLeft.toFixed(2)}s`);
          setIsMixingSync(true);
          handoffDoneRef.current = false;
        }
        
        const secAudio = activeChannel === 'A' ? audioBRef.current : audioARef.current;
        if (!secAudio) return;

        if (!nextSongInfo && nextS) {
          if (nextS.id !== currentSong.id) {
            console.log(`[Mixer] 🎵 Preparando canción entrante: ${nextS.title}`);
            setNextSongInfo(nextS);
            setNextCurrentTime(0);
            setUiTransition(false);
            setMixerState({
              active: true,
              fromSong: currentSong,
              toSong: nextS,
              startedAt: Date.now(),
              crossfadeTime: fadeSeconds,
              activeDeviceId: deviceId
            });
            secAudio.src = nextS.url;
            secAudio.currentTime = 0;
            secAudio.volume = 0;
            secAudio.play().catch(err => console.error("[Mixer] Error al reproducir canción entrante:", err));
          }
        }

        setNextCurrentTime(secAudio.currentTime || 0);
        if (secAudio.duration) setNextDuration(secAudio.duration);

        const fadeRatio = Math.min(1, Math.max(0, timeLeft / fadeSeconds));
        mainAudio.volume = Math.min(1, Math.max(0, fadeRatio * volume));
        secAudio.volume = Math.min(1, Math.max(0, (0.2 + (1 - fadeRatio) * 0.8) * volume));

        if (fadeRatio <= 0.4) setUiTransition(true);

        if (timeLeft <= 0.2 && !handoffDoneRef.current) {
          handoffDoneRef.current = true;
          const savedTime = secAudio.currentTime;
          const savedDuration = secAudio.duration;
          setActiveChannel(activeChannel === 'A' ? 'B' : 'A');
          playNext();
          clearMixerState();
          setCurrentTime(savedTime, true);
          setDuration(savedDuration);
        }
      } else {
        mainAudio.volume = volume;
      }
    } else if (isMixingRef.current) {
      setNextSongInfo(null);
      setUiTransition(false);
      setNextCurrentTime(0);
      setNextDuration(0);
      setIsMixingSync(false);
      handoffDoneRef.current = false;
      const staleAudio = activeChannel === 'B' ? audioARef.current : audioBRef.current;
      if (staleAudio) {
        staleAudio.pause();
        staleAudio.src = '';
      }
      clearMixerState();
    }
  }, [
    activeChannel, currentTime, isPlaying, crossfadeEnabled, crossfadeTime, isMaster,
    queue, currentSong, volume, nextSongInfo, setMixerState, clearMixerState,
    playNext, setCurrentTime, setDuration, setIsMixingSync, audioARef, audioBRef
  ]);

  const resetMixingState = useCallback(() => {
    setNextSongInfo(null);
    setUiTransition(false);
    setNextCurrentTime(0);
    setNextDuration(0);
    setIsMixingSync(false);
    handoffDoneRef.current = false;

    const staleAudio = activeChannel === 'B' ? audioARef.current : audioBRef.current;
    if (staleAudio) {
      staleAudio.pause();
      staleAudio.src = '';
    }
  }, [activeChannel, setIsMixingSync, audioARef, audioBRef]);

  useEffect(() => {
    if (!currentSong?.id) return;
    if (prevSongIdRef.current && prevSongIdRef.current !== currentSong.id) {
      setTimeout(() => {
        resetMixingState();
      }, 80);
    }
    prevSongIdRef.current = currentSong.id;
  }, [currentSong?.id, resetMixingState]);

  return {
    activeChannel,
    setActiveChannel,
    isMixing,
    isMixingRef,
    nextSongInfo,
    uiTransition,
    nextCurrentTime,
    setNextCurrentTime,
    nextDuration,
    setNextDuration,
    resetMixingState,
    setNextSongInfo,
    setUiTransition,
    setIsMixingSync
  };
}
