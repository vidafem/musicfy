// Motor de audio desacoplado con soporte para Web Audio API, normalización y precarga gapless.

class AudioEngine {
  constructor() {
    this.audioA = new Audio();
    this.audioB = new Audio();
    
    // Configurar CORS para permitir el procesamiento en Web Audio
    this.audioA.crossOrigin = 'anonymous';
    this.audioB.crossOrigin = 'anonymous';
    
    this.audioContext = null;
    this.sourceA = null;
    this.sourceB = null;
    this.gainA = null;
    this.gainB = null;
    this.compressor = null;
    
    this.activeChannel = 'A'; // 'A' o 'B'
    this.volume = 0.8;
    this.crossfadeEnabled = true;
    this.crossfadeTime = 3; // segundos
    
    this.callbacks = {
      onTimeUpdate: null,
      onEnded: null,
      onError: null,
      onDurationChange: null
    };

    this.isPreloaded = false;
    this.nextSongToPreload = null;

    this.setupListeners();
  }

  // Inicializar Web Audio API bajo demanda para evitar bloqueos del navegador
  initAudioContext() {
    if (this.audioContext) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      
      // Crear nodos
      this.sourceA = this.audioContext.createMediaElementSource(this.audioA);
      this.sourceB = this.audioContext.createMediaElementSource(this.audioB);
      
      this.gainA = this.audioContext.createGain();
      this.gainB = this.audioContext.createGain();
      
      this.compressor = this.audioContext.createDynamicsCompressor();
      
      // Configuración de Compresor para normalizar el volumen
      // Suaviza diferencias entre audio fuerte (local) y débil (YouTube)
      this.compressor.threshold.setValueAtTime(-18, this.audioContext.currentTime); // dB
      this.compressor.knee.setValueAtTime(12, this.audioContext.currentTime);        // dB
      this.compressor.ratio.setValueAtTime(6, this.audioContext.currentTime);         // compresión
      this.compressor.attack.setValueAtTime(0.005, this.audioContext.currentTime);    // segundos
      this.compressor.release.setValueAtTime(0.20, this.audioContext.currentTime);     // segundos

      // Conexiones
      // Canal A
      this.sourceA.connect(this.gainA);
      this.gainA.connect(this.compressor);
      
      // Canal B
      this.sourceB.connect(this.gainB);
      this.gainB.connect(this.compressor);
      
      // Compresor al destino final
      this.compressor.connect(this.audioContext.destination);

      // Configurar niveles iniciales
      this.gainA.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
      this.gainB.gain.setValueAtTime(0, this.audioContext.currentTime);

      console.log('[AudioEngine] Web Audio Graph inicializado y normalización activada.');
    } catch (e) {
      console.warn('[AudioEngine] No se pudo inicializar Web Audio API. Usando fallback básico.', e);
    }
  }

  setupListeners() {
    const handleTimeUpdate = (e) => {
      const audio = e.target;
      const channel = audio === this.audioA ? 'A' : 'B';
      
      if (channel === this.activeChannel) {
        if (this.callbacks.onTimeUpdate) {
          this.callbacks.onTimeUpdate(audio.currentTime);
        }
        
        // Precarga inteligente (Gapless) cuando falta el 10% o 12 segundos para terminar
        if (audio.duration && !this.isPreloaded && this.nextSongToPreload) {
          const timeLeft = audio.duration - audio.currentTime;
          if (timeLeft < 15 || (audio.currentTime / audio.duration) > 0.90) {
            this.preloadNextTrack();
          }
        }
      }
    };

    const handleEnded = (e) => {
      const audio = e.target;
      const channel = audio === this.audioA ? 'A' : 'B';
      if (channel === this.activeChannel) {
        console.log(`[AudioEngine] Canción finalizada en Canal ${channel}`);
        if (this.callbacks.onEnded) {
          this.callbacks.onEnded();
        }
      }
    };

    const handleError = (e) => {
      const audio = e.target;
      console.error(`[AudioEngine] Error de audio en canal:`, e);
      if (this.callbacks.onError) {
        this.callbacks.onError(e);
      }
    };

    const handleDurationChange = (e) => {
      const audio = e.target;
      const channel = audio === this.audioA ? 'A' : 'B';
      if (channel === this.activeChannel && this.callbacks.onDurationChange) {
        this.callbacks.onDurationChange(audio.duration);
      }
    };

    // Agregar listeners a ambos elementos
    [this.audioA, this.audioB].forEach(audio => {
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
      audio.addEventListener('durationchange', handleDurationChange);
    });
  }

  // Activa el AudioContext en interacción
  async resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(e => console.warn(e));
    }
  }

  async play(url, startTime = 0) {
    this.initAudioContext();
    await this.resumeContext();

    this.isPreloaded = false;
    const currentAudio = this.activeChannel === 'A' ? this.audioA : this.audioB;
    const inactiveAudio = this.activeChannel === 'A' ? this.audioB : this.audioA;

    // Detener canal inactivo
    inactiveAudio.pause();

    // Establecer ganancia del canal activo a volumen completo y el inactivo a 0
    if (this.audioContext) {
      const t = this.audioContext.currentTime;
      if (this.activeChannel === 'A') {
        this.gainA.gain.setValueAtTime(this.volume, t);
        this.gainB.gain.setValueAtTime(0, t);
      } else {
        this.gainB.gain.setValueAtTime(this.volume, t);
        this.gainA.gain.setValueAtTime(0, t);
      }
    } else {
      currentAudio.volume = this.volume;
      inactiveAudio.volume = 0;
    }

    // Cargar si la URL es distinta
    if (currentAudio.src !== url) {
      currentAudio.src = url;
    }

    if (startTime > 0) {
      currentAudio.currentTime = startTime;
    }

    try {
      await currentAudio.play();
      console.log(`[AudioEngine] Reproduciendo en Canal ${this.activeChannel} - URL:`, url);
    } catch (err) {
      console.error('[AudioEngine] Error al iniciar reproducción:', err);
      throw err;
    }
  }

  pause() {
    const currentAudio = this.activeChannel === 'A' ? this.audioA : this.audioB;
    currentAudio.pause();
    console.log(`[AudioEngine] Reproducción en pausa en Canal ${this.activeChannel}`);
  }

  seek(time) {
    const currentAudio = this.activeChannel === 'A' ? this.audioA : this.audioB;
    if (Number.isFinite(time)) {
      currentAudio.currentTime = time;
    }
  }

  setVolume(vol) {
    this.volume = vol;
    if (this.audioContext) {
      const t = this.audioContext.currentTime;
      if (this.activeChannel === 'A') {
        this.gainA.gain.setValueAtTime(vol, t);
      } else {
        this.gainB.gain.setValueAtTime(vol, t);
      }
    } else {
      const currentAudio = this.activeChannel === 'A' ? this.audioA : this.audioB;
      currentAudio.volume = vol;
    }
  }

  setCrossfade(enabled, time) {
    this.crossfadeEnabled = enabled;
    this.crossfadeTime = time;
  }

  setNextSongToPreload(song) {
    this.nextSongToPreload = song;
    this.isPreloaded = false;
  }

  async preloadNextTrack() {
    if (this.isPreloaded || !this.nextSongToPreload) return;
    this.isPreloaded = true;

    const inactiveAudio = this.activeChannel === 'A' ? this.audioB : this.audioA;
    
    try {
      console.log('[AudioEngine] Precargando siguiente pista en canal inactivo:', this.nextSongToPreload.title);
      
      // Obtener URL reproducible (maneja YouTube, caché, local)
      const { HybridMusicProvider } = await import('../../providers/MusicProvider');
      const playableUrl = await HybridMusicProvider.getPlayableUrl(this.nextSongToPreload);
      
      inactiveAudio.src = playableUrl;
      inactiveAudio.load(); // Fuerza al navegador a iniciar el buffer
    } catch (e) {
      console.warn('[AudioEngine] Error al precargar siguiente track:', e);
      this.isPreloaded = false;
    }
  }

  // Inicia la transición de crossfade y cambia de canal
  async triggerCrossfade(nextUrl, onChannelSwapped) {
    this.initAudioContext();
    await this.resumeContext();

    if (!this.audioContext || !this.crossfadeEnabled) {
      // Fallback inmediato si no hay Web Audio
      this.activeChannel = this.activeChannel === 'A' ? 'B' : 'A';
      await this.play(nextUrl);
      if (onChannelSwapped) onChannelSwapped(this.activeChannel);
      return;
    }

    const t = this.audioContext.currentTime;
    const fadeDuration = this.crossfadeTime;
    
    const currentChannel = this.activeChannel;
    const nextChannel = currentChannel === 'A' ? 'B' : 'A';
    
    const activeGain = currentChannel === 'A' ? this.gainA : this.gainB;
    const nextGain = currentChannel === 'A' ? this.gainB : this.gainA;
    const nextAudio = currentChannel === 'A' ? this.audioB : this.audioA;

    console.log(`[AudioEngine] Iniciando Crossfade de Canal ${currentChannel} a ${nextChannel} en ${fadeDuration}s`);

    // Asegurar que el audio de destino tiene la URL correcta
    if (nextAudio.src !== nextUrl) {
      nextAudio.src = nextUrl;
    }

    nextAudio.currentTime = 0;
    
    // Rampa de atenuación en canal activo y rampa de volumen en canal inactivo
    activeGain.gain.setValueAtTime(this.volume, t);
    activeGain.gain.linearRampToValueAtTime(0, t + fadeDuration);

    nextGain.gain.setValueAtTime(0, t);
    nextGain.gain.linearRampToValueAtTime(this.volume, t + fadeDuration);

    try {
      await nextAudio.play();
      this.activeChannel = nextChannel;
      
      if (onChannelSwapped) {
        onChannelSwapped(this.activeChannel);
      }

      // Detener el audio anterior después de terminar el fade
      setTimeout(() => {
        const previousAudio = currentChannel === 'A' ? this.audioA : this.audioB;
        // Solo pausar si el canal no se volvió a activar en medio de la transición
        if (this.activeChannel !== currentChannel) {
          previousAudio.pause();
        }
      }, fadeDuration * 1000);

    } catch (err) {
      console.error('[AudioEngine] Falló al reproducir track destino en crossfade:', err);
      // Fallback
      this.activeChannel = currentChannel;
      activeGain.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
    }
  }

  // Getters de estado
  getCurrentTime() {
    const currentAudio = this.activeChannel === 'A' ? this.audioA : this.audioB;
    return currentAudio.currentTime;
  }

  getDuration() {
    const currentAudio = this.activeChannel === 'A' ? this.audioA : this.audioB;
    return currentAudio.duration || 0;
  }

  registerCallbacks(handlers) {
    this.callbacks = { ...this.callbacks, ...handlers };
  }
}

export const audioEngine = new AudioEngine();
export default audioEngine;
