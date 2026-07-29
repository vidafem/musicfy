// Normalizador de audio Web Audio API para unificar niveles de volumen
let audioContext = null;
let sourceA = null;
let sourceB = null;
let compressor = null;
let isInitialized = false;

export function initializeWebAudioNormalizer(audioA, audioB) {
  if (isInitialized || typeof window === 'undefined') return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    audioContext = new AudioCtx();

    // Intentar conectar los elementos de audio a la Web Audio API
    // Si la fuente no tiene cabeceras CORS permisivas, createMediaElementSource continuará o hará fallback
    try {
      sourceA = audioContext.createMediaElementSource(audioA);
      sourceB = audioContext.createMediaElementSource(audioB);

      compressor = audioContext.createDynamicsCompressor();

      // Configuración del compresor de dinámica para normalizar el volumen
      compressor.threshold.setValueAtTime(-18, audioContext.currentTime); // dB
      compressor.knee.setValueAtTime(12, audioContext.currentTime);        // dB
      compressor.ratio.setValueAtTime(6, audioContext.currentTime);         // factor de compresión
      compressor.attack.setValueAtTime(0.005, audioContext.currentTime);    // ataque rápido
      compressor.release.setValueAtTime(0.20, audioContext.currentTime);     // release medio

      // Enlazar fuentes al compresor
      sourceA.connect(compressor);
      sourceB.connect(compressor);

      // Enlazar compresor a la salida física de altavoces
      compressor.connect(audioContext.destination);

      isInitialized = true;
      console.log('[WebAudioNormalizer] Conectado exitosamente y normalización de volumen activada.');
    } catch (nodeError) {
      console.warn('[WebAudioNormalizer] No se pudo conectar MediaElementSourceNode (posible CORS o ya conectado):', nodeError.message);
    }
  } catch (e) {
    console.warn('[WebAudioNormalizer] No se pudo inicializar la Web Audio API. Fallback básico activado.', e);
  }
}

export async function resumeWebAudioContext() {
  if (audioContext && audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
      console.log('[WebAudioNormalizer] AudioContext reanudado.');
    } catch (e) {
      console.warn('[WebAudioNormalizer] Error al reanudar AudioContext:', e);
    }
  }
}

