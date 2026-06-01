// Detector de plataforma TV y Motor de Navegación Espacial 2D (D-pad)

export const TVPlatform = {
  NONE: 'none',
  ANDROID_TV: 'androidtv',
  TIZEN: 'tizen',
  WEBOS: 'webos',
}

export function detectTVPlatform() {
  const ua = navigator.userAgent || ''
  
  if (typeof window.tizen !== 'undefined' || ua.includes('Tizen')) {
    return TVPlatform.TIZEN
  }
  if (typeof window.webOS !== 'undefined' || ua.includes('WebOS') || ua.includes('Web0S')) {
    return TVPlatform.WEBOS
  }
  if (ua.includes('TV') || ua.includes('AFT') || ua.includes('SmartTV') || ua.includes('BRAVIA') || ua.includes('SHIELD') || ua.includes('Tizen') || ua.includes('Web0S')) {
    return TVPlatform.ANDROID_TV
  }
  return TVPlatform.NONE
}

export function isTV() {
  return detectTVPlatform() !== TVPlatform.NONE
}

// Control remoto: mapeo de teclas de TV
export const TV_KEY_CODES = {
  PLAY_PAUSE: [179, 415, 19, 102],  // MediaPlayPause, MediaPlay
  STOP: [178, 413],
  FAST_FWD: [228, 417],
  REWIND: [227, 412],
  NEXT: [176],
  PREV: [177],
  UP: [38, 29460],     // Arriba D-pad
  DOWN: [40, 29461],   // Abajo D-pad
  LEFT: [37, 4, 29462], // Izquierda D-pad
  RIGHT: [39, 5, 29463], // Derecha D-pad
  ENTER: [13, 32, 29443], // OK / Select
  BACK: [8, 461, 27, 10009], // Backspace, escape o back nativo
}

// Inyectar estilos de foco premium
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.id = 'tv-focus-styles';
  style.innerHTML = `
    .focusable, button, a, [tabindex="0"] {
      transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
    }
    .focusable:focus, button:focus, a:focus, [tabindex="0"]:focus {
      outline: 4px solid var(--accent-color, #ff0055) !important;
      outline-offset: 4px !important;
      transform: scale(1.06) !important;
      box-shadow: 0 15px 35px rgba(0,0,0,0.6), 0 0 25px rgba(var(--accent-color-rgb, 255, 0, 85), 0.45) !important;
      z-index: 100 !important;
    }
  `;
  document.head.appendChild(style);
}

// Motor de navegación espacial 2D
class SpatialNavigation {
  constructor() {
    this.isActive = false;
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    document.addEventListener('keydown', this.handleKeyDown);
    console.log('[SpatialNav] Motor D-pad iniciado.');
    
    // Enfocar primer elemento si no hay ninguno enfocado
    setTimeout(() => this.focusFirst(), 500);
  }

  stop() {
    if (!this.isActive) return;
    this.isActive = false;
    document.removeEventListener('keydown', this.handleKeyDown);
    console.log('[SpatialNav] Motor D-pad detenido.');
  }

  focusFirst() {
    const focusable = this.getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  getFocusableElements() {
    const selector = '.focusable, button, a, [tabindex="0"]';
    const elements = Array.from(document.querySelectorAll(selector));
    
    // Filtrar elementos ocultos o no visibles
    return elements.filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        el.getAttribute('disabled') === null
      );
    });
  }

  handleKeyDown = (e) => {
    const code = e.keyCode;
    let direction = null;

    if (TV_KEY_CODES.UP.includes(code)) direction = 'up';
    else if (TV_KEY_CODES.DOWN.includes(code)) direction = 'down';
    else if (TV_KEY_CODES.LEFT.includes(code)) direction = 'left';
    else if (TV_KEY_CODES.RIGHT.includes(code)) direction = 'right';

    if (direction) {
      e.preventDefault();
      this.moveFocus(direction);
    }
  };

  moveFocus(direction) {
    const active = document.activeElement;
    const elements = this.getFocusableElements();
    
    if (!active || active === document.body || !elements.includes(active)) {
      this.focusFirst();
      return;
    }

    const activeRect = active.getBoundingClientRect();
    const activeCenter = {
      x: activeRect.left + activeRect.width / 2,
      y: activeRect.top + activeRect.height / 2
    };

    let bestCandidate = null;
    let bestScore = Infinity;

    for (const el of elements) {
      if (el === active) continue;

      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      const dx = center.x - activeCenter.x;
      const dy = center.y - activeCenter.y;

      // Verificar dirección estricta
      let isCorrectDirection = false;
      let primaryDist = 0;
      let secondaryDist = 0;

      switch (direction) {
        case 'up':
          isCorrectDirection = dy < -2; // tolerar pequeño desfase
          primaryDist = -dy;
          secondaryDist = Math.abs(dx);
          break;
        case 'down':
          isCorrectDirection = dy > 2;
          primaryDist = dy;
          secondaryDist = Math.abs(dx);
          break;
        case 'left':
          isCorrectDirection = dx < -2;
          primaryDist = -dx;
          secondaryDist = Math.abs(dy);
          break;
        case 'right':
          isCorrectDirection = dx > 2;
          primaryDist = dx;
          secondaryDist = Math.abs(dy);
          break;
      }

      if (isCorrectDirection) {
        // Métrica: Priorizar dirección primaria, penalizar dispersión secundaria
        const score = primaryDist + 3.5 * secondaryDist;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = el;
        }
      }
    }

    if (bestCandidate) {
      bestCandidate.focus();
      
      // Asegurar scroll automático
      bestCandidate.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
      
      console.log('[SpatialNav] Foco movido a:', bestCandidate);
    }
  }
}

export const spatialNavigation = new SpatialNavigation();

// Registrar handlers para multimedia de TV y control remoto básico
export function registerTVKeyHandlers(handlers) {
  const handleKey = (e) => {
    const code = e.keyCode
    if (TV_KEY_CODES.PLAY_PAUSE.includes(code)) { e.preventDefault(); handlers.onPlayPause?.() }
    else if (TV_KEY_CODES.NEXT.includes(code)) { e.preventDefault(); handlers.onNext?.() }
    else if (TV_KEY_CODES.PREV.includes(code)) { e.preventDefault(); handlers.onPrevious?.() }
    else if (TV_KEY_CODES.FAST_FWD.includes(code)) { e.preventDefault(); handlers.onForward?.() }
    else if (TV_KEY_CODES.REWIND.includes(code)) { e.preventDefault(); handlers.onRewind?.() }
    else if (TV_KEY_CODES.BACK.includes(code)) { e.preventDefault(); handlers.onBack?.() }
  }
  
  document.addEventListener('keydown', handleKey)
  
  // Si estamos en TV, activar la navegación espacial 2D automáticamente
  if (isTV()) {
    spatialNavigation.start();
  }

  return () => {
    document.removeEventListener('keydown', handleKey);
    spatialNavigation.stop();
  }
}
