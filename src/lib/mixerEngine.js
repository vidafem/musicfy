
// MixerEngine.js - Maneja la transición suave entre canciones (Crossfade)
class MixerEngine {
  constructor() {
    this.audioA = new Audio();
    this.audioB = new Audio();
    this.currentChannel = 'A'; // 'A' o 'B'
    this.crossfadeTime = 5; // Segundos por defecto
    this.isEnabled = true;
  }

  setSettings(enabled, time) {
    this.isEnabled = enabled;
    this.crossfadeTime = time;
  }

  // Esta función se llamará cuando falte poco para acabar la canción
  prepareNextTrack(url) {
    const nextChannel = this.currentChannel === 'A' ? this.audioB : this.audioA;
    nextChannel.src = url;
    nextChannel.volume = 0;
    nextChannel.load();
  }

  startCrossfade(onNext) {
    if (!this.isEnabled) {
      onNext();
      return;
    }

    const fadeOutAudio = this.currentChannel === 'A' ? this.audioA : this.audioB;
    const fadeInAudio = this.currentChannel === 'A' ? this.audioB : this.audioA;

    fadeInAudio.play();
    
    let step = 0;
    const interval = 100; // ms
    const totalSteps = (this.crossfadeTime * 1000) / interval;

    const fade = setInterval(() => {
      step++;
      const ratio = step / totalSteps;
      
      fadeOutAudio.volume = Math.max(0, 1 - ratio);
      fadeInAudio.volume = Math.min(1, ratio);

      if (step >= totalSteps) {
        clearInterval(fade);
        fadeOutAudio.pause();
        fadeOutAudio.src = "";
        this.currentChannel = this.currentChannel === 'A' ? 'B' : 'A';
        if (onNext) onNext();
      }
    }, interval);
  }
}

export const mixer = new MixerEngine();
