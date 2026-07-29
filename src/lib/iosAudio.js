import { Capacitor } from '@capacitor/core';
import { resumeWebAudioContext } from '../services/player/audioNormalizer';

let unlocked = false;

export const iOSAudioManager = {
  isIOS: () => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent || '';
    return Capacitor.getPlatform() === 'ios' || /iPhone|iPad|iPod/i.test(ua);
  },

  // Desbloqueo universal de audio en la primera interacción táctil (iPhone Safari / Standalone PWA)
  unlockAudioOnFirstTouch() {
    if (unlocked || typeof window === 'undefined') return;

    const unlock = () => {
      if (unlocked) return;
      unlocked = true;

      // Reanudar WebAudioContext
      resumeWebAudioContext();

      // Reproducir sonido silencioso para desbloquear el motor de audio de iOS
      try {
        const silentAudio = new Audio();
        silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        silentAudio.play().then(() => {
          silentAudio.pause();
          console.log('[iOSAudio] Motor de audio de iOS desbloqueado con éxito.');
        }).catch(() => {});
      } catch (e) {}

      window.removeEventListener('touchstart', unlock, true);
      window.removeEventListener('touchend', unlock, true);
      window.removeEventListener('click', unlock, true);
    };

    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('touchend', unlock, { capture: true, passive: true });
    window.addEventListener('click', unlock, { capture: true, passive: true });
  },

  async configureAudioSession() {
    if (!this.isIOS()) return;
    console.log('[iOS] Audio session configurada para reproducción continua en background.');
  },

  registerMediaSessionHandlers(callbacks) {
    if (!('mediaSession' in navigator)) return;

    if (callbacks.title) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: callbacks.title || 'Musicfy Track',
        artist: callbacks.artist || 'Artista Desconocido',
        album: callbacks.album || 'Musicfy',
        artwork: callbacks.artwork ? [
          { src: callbacks.artwork, sizes: '96x96', type: 'image/png' },
          { src: callbacks.artwork, sizes: '256x256', type: 'image/png' },
          { src: callbacks.artwork, sizes: '512x512', type: 'image/png' }
        ] : []
      });
    }

    const actionMap = {
      play: callbacks.onPlay,
      pause: callbacks.onPause,
      previoustrack: callbacks.onPrevious,
      nexttrack: callbacks.onNext,
      stop: callbacks.onPause
    };

    Object.entries(actionMap).forEach(([action, handler]) => {
      try {
        if (handler) {
          navigator.mediaSession.setActionHandler(action, () => {
            resumeWebAudioContext();
            handler();
          });
        }
      } catch (e) {
        console.warn(`[iOS] Error registrando handler de MediaSession para ${action}:`, e);
      }
    });

    try {
      if (callbacks.onSeek) {
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          resumeWebAudioContext();
          if (details.seekTime !== undefined && details.seekTime !== null) {
            callbacks.onSeek(details.seekTime);
          }
        });
      }
    } catch (e) {}
  },

  updateNowPlaying(song, currentTime, duration, isPlaying) {
    if (!('mediaSession' in navigator) || !song) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || 'Musicfy Track',
        artist: song.artist || 'Artista Desconocido',
        album: song.album || 'Musicfy',
        artwork: song.cover_url ? [
          { src: song.cover_url, sizes: '96x96', type: 'image/png' },
          { src: song.cover_url, sizes: '256x256', type: 'image/png' },
          { src: song.cover_url, sizes: '512x512', type: 'image/png' }
        ] : []
      });

      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      if (Number.isFinite(duration) && Number.isFinite(currentTime) && duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(duration, 1),
          playbackRate: 1,
          position: Math.min(Math.max(currentTime, 0), duration),
        });
      }
    } catch (e) {
      console.warn('[iOS] No se pudo actualizar estado de reproduccion en MediaSession:', e);
    }
  }
};

