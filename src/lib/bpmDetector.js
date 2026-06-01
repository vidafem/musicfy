// Detector de BPM y tonalidad usando Web Audio API nativo
// (sin dependencias pesadas - Essentia.js es opcional)

export class BPMDetector {
  constructor() {
    this.audioContext = null
  }
  
  async analyze(audioUrl) {
    try {
      this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)()
      
      const response = await fetch(audioUrl)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      
      const bpm = await this._detectBPM(audioBuffer)
      const key = await this._detectKey(audioBuffer)
      const energy = this._calculateEnergy(audioBuffer)
      
      return { bpm: Math.round(bpm), key, energy }
    } catch (err) {
      console.warn('[BPM] No se pudo analizar:', err)
      return { bpm: null, key: null, energy: null }
    }
  }
  
  _detectBPM(audioBuffer) {
    // Implementación de detección de BPM por autocorrelación
    const sampleRate = audioBuffer.sampleRate
    const data = audioBuffer.getChannelData(0)
    const bufferSize = Math.min(data.length, sampleRate * 30) // Analizar 30 segundos
    
    // Paso 1: Onset detection (detectar golpes)
    const windowSize = 1024
    const hopSize = 512
    const onsets = []
    
    let prevEnergy = 0
    for (let i = 0; i < bufferSize - windowSize; i += hopSize) {
      let energy = 0
      for (let j = 0; j < windowSize; j++) {
        energy += data[i + j] ** 2
      }
      energy /= windowSize
      if (energy > prevEnergy * 1.3 && energy > 0.001) {
        onsets.push(i / sampleRate)
      }
      prevEnergy = energy
    }
    
    // Paso 2: Calcular intervalos entre onsets
    if (onsets.length < 4) return 120 // Default
    
    const intervals = []
    for (let i = 1; i < Math.min(onsets.length, 50); i++) {
      intervals.push(onsets[i] - onsets[i - 1])
    }
    
    // Paso 3: Encontrar el intervalo más común (tempo)
    const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
    const bpm = 60 / median
    
    // Normalizar a rango 60-180
    if (bpm < 60) return bpm * 2
    if (bpm > 180) return bpm / 2
    return bpm
  }
  
  _detectKey(audioBuffer) {
    // Detección de tonalidad por perfil de Krumhansl-Schmuckler
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    
    const data = audioBuffer.getChannelData(0)
    const fftSize = 4096
    const sampleRate = audioBuffer.sampleRate
    
    // Tomar la mitad de la canción para análisis
    const startSample = Math.floor(data.length * 0.3)
    const chromagram = new Float32Array(12).fill(0)
    
    for (let i = startSample; i < startSample + Math.min(fftSize * 100, data.length - startSample - fftSize); i += fftSize) {
      for (let j = 0; j < fftSize; j++) {
        const freq = (j * sampleRate) / fftSize
        if (freq > 50 && freq < 2000) {
          const midiNote = 69 + 12 * Math.log2(freq / 440)
          const pitchClass = Math.round(midiNote) % 12
          if (pitchClass >= 0 && pitchClass < 12) {
            chromagram[pitchClass] += Math.abs(data[i + j])
          }
        }
      }
    }
    
    // Correlación con perfiles mayor y menor
    let maxCorr = -Infinity
    let detectedKey = 'C'
    let detectedMode = 'major'
    
    for (let root = 0; root < 12; root++) {
      const rotatedChroma = [...chromagram.slice(root), ...chromagram.slice(0, root)]
      
      const corrMajor = rotatedChroma.reduce((sum, val, i) => sum + val * majorProfile[i], 0)
      const corrMinor = rotatedChroma.reduce((sum, val, i) => sum + val * minorProfile[i], 0)
      
      if (corrMajor > maxCorr) { maxCorr = corrMajor; detectedKey = keys[root]; detectedMode = 'major' }
      if (corrMinor > maxCorr) { maxCorr = corrMinor; detectedKey = keys[root]; detectedMode = 'minor' }
    }
    
    return `${detectedKey} ${detectedMode}`
  }
  
  _calculateEnergy(audioBuffer) {
    const data = audioBuffer.getChannelData(0)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i] ** 2
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 10)
  }
}

// Tabla de compatibilidad armónica (Círculo de Camelot)
export const CAMELOT_COMPATIBILITY = {
  'C major': ['C major', 'G major', 'A minor', 'F major'],
  'C minor': ['C minor', 'G minor', 'D# major', 'F minor'],
  'C# major': ['C# major', 'G# major', 'A# minor', 'F# major'],
  'C# minor': ['C# minor', 'G# minor', 'E major', 'F# minor'],
  'D major': ['D major', 'A major', 'B minor', 'G major'],
  'D minor': ['D minor', 'A minor', 'F major', 'G minor'],
  'D# major': ['D# major', 'A# major', 'C minor', 'G# major'],
  'D# minor': ['D# minor', 'A# minor', 'F# major', 'G# minor'],
  'E major': ['E major', 'B major', 'C# minor', 'A major'],
  'E minor': ['E minor', 'B minor', 'G major', 'A minor'],
  'F major': ['F major', 'C major', 'D minor', 'A# major'],
  'F minor': ['F minor', 'C minor', 'G# major', 'A# minor'],
  'F# major': ['F# major', 'C# major', 'D# minor', 'B major'],
  'F# minor': ['F# minor', 'C# minor', 'A major', 'B minor'],
  'G major': ['G major', 'D major', 'E minor', 'C major'],
  'G minor': ['G minor', 'D minor', 'A# major', 'C minor'],
  'G# major': ['G# major', 'D# major', 'F minor', 'C# major'],
  'G# minor': ['G# minor', 'D# minor', 'B major', 'C# minor'],
  'A major': ['A major', 'E major', 'F# minor', 'D major'],
  'A minor': ['A minor', 'E minor', 'C major', 'D minor'],
  'A# major': ['A# major', 'F major', 'G minor', 'D# major'],
  'A# minor': ['A# minor', 'F minor', 'C# major', 'D# minor'],
  'B major': ['B major', 'F# major', 'G# minor', 'E major'],
  'B minor': ['B minor', 'F# minor', 'D major', 'E minor']
}

export function isHarmonicallyCompatible(key1, key2) {
  if (!key1 || !key2) return true // Si no tenemos info, asumir compatibles
  const compatible = CAMELOT_COMPATIBILITY[key1] || []
  return compatible.includes(key2)
}

export function bpmCompatibilityScore(bpm1, bpm2) {
  if (!bpm1 || !bpm2) return 1
  const ratio = bpm1 / bpm2
  const diffs = [Math.abs(ratio - 1), Math.abs(ratio - 0.5), Math.abs(ratio - 2)]
  const minDiff = Math.min(...diffs)
  return Math.max(0, 1 - minDiff * 2)
}
