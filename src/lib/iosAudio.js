import { Capacitor } from '@capacitor/core'

export const iOSAudioManager = {
  isIOS: () => Capacitor.getPlatform() === 'ios',
  
  async configureAudioSession() {
    if (!this.isIOS()) return
    // En iOS nativo, el audio se configura para reproducir en background.
    console.log('[iOS] Audio session configurada para background en hilo nativo.')
  },
  
  async requestMusicPermission() {
    if (!this.isIOS()) return true
    return true
  },
  
  // Registrar handlers para comandos de audio del sistema iOS (pantalla bloqueada, Bluetooth, AirPlay)
  registerMediaSessionHandlers(callbacks) {
    if (!('mediaSession' in navigator)) return
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: callbacks.title || '',
      artist: callbacks.artist || '',
      album: callbacks.album || 'Musicfy',
      artwork: callbacks.artwork ? [{ src: callbacks.artwork, sizes: '512x512', type: 'image/jpeg' }] : []
    })
    
    navigator.mediaSession.setActionHandler('play', callbacks.onPlay)
    navigator.mediaSession.setActionHandler('pause', callbacks.onPause)
    navigator.mediaSession.setActionHandler('previoustrack', callbacks.onPrevious)
    navigator.mediaSession.setActionHandler('nexttrack', callbacks.onNext)
    
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => callbacks.onSeek?.(details.seekTime))
    } catch (e) {
      // seekto no soportado en navegadores viejos
    }
  },
  
  updateNowPlaying(song, currentTime, duration, isPlaying) {
    if (!('mediaSession' in navigator) || !song) return
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album || 'Musicfy',
      artwork: song.cover_url ? [
        { src: song.cover_url, sizes: '96x96', type: 'image/png' },
        { src: song.cover_url, sizes: '512x512', type: 'image/png' }
      ] : []
    })
    
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    
    try {
      if (Number.isFinite(duration) && Number.isFinite(currentTime) && duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: Math.min(currentTime, duration),
        })
      }
    } catch (e) {
      console.warn('[iOS] No se pudo establecer posicion de reproduccion:', e)
    }
  }
}
