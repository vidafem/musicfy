// Normalizador de audio Web Audio API para unificar niveles de volumen
let audioContext = null;
let sourceA = null;
let sourceB = null;
let compressor = null;
let isInitialized = false;

export function initializeWebAudioNormalizer(audioA, audioB) {
  if (isInitialized || typeof window === 'undefined') return;

  // En dispositivos móviles (iOS/Android), no conectar createMediaElementSource para streams de YouTube externos
  // ya que los servidores de CDN de Google Video sin cabeceras CORS fuerzan silencio en WebAudio API.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  if (isMobile) {
    console.log('[WebAudioNormalizer] Desactivado en móvil para permitir salida directa HTML5 de alta fidelidad.');
    return;
  }

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    audioContext = new AudioCtx();

    try {
      sourceA = audioContext.createMediaElementSource(audioA);
      sourceB = audioContext.createMediaElementSource(audioB);

      compressor = audioContext.createDynamicsCompressor();

      compressor.threshold.setValueAtTime(-18, audioContext.currentTime);
      compressor.knee.setValueAtTime(12, audioContext.currentTime);
      compressor.ratio.setValueAtTime(6, audioContext.currentTime);
      compressor.attack.setValueAtTime(0.005, audioContext.currentTime);
      compressor.release.setValueAtTime(0.20, audioContext.currentTime);

      sourceA.connect(compressor);
      sourceB.connect(compressor);

      compressor.connect(audioContext.destination);

      isInitialized = true;
      console.log('[WebAudioNormalizer] Conectado exitosamente en escritorio.');
    } catch (nodeError) {
      console.warn('[WebAudioNormalizer] No se pudo conectar MediaElementSourceNode:', nodeError.message);
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

