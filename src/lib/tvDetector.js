// Detector de plataforma TV y Motor de Navegación Espacial 2D (D-pad)

export const TVPlatform = {
  NONE: 'none',
  ANDROID_TV: 'androidtv',
  TIZEN: 'tizen',
  WEBOS: 'webos',
};

export function detectTVPlatform() {
  if (typeof window === 'undefined') return TVPlatform.NONE;
  const ua = navigator.userAgent || '';

  if (typeof window.tizen !== 'undefined' || ua.includes('Tizen')) {
    return TVPlatform.TIZEN;
  }
  if (typeof window.webOS !== 'undefined' || ua.includes('WebOS') || ua.includes('Web0S')) {
    return TVPlatform.WEBOS;
  }
  if (
    ua.includes('TV') ||
    ua.includes('AFT') ||
    ua.includes('SmartTV') ||
    ua.includes('BRAVIA') ||
    ua.includes('SHIELD') ||
    ua.includes('MiBox') ||
    ua.includes('Nexus Player') ||
    ua.includes('GoogleTV')
  ) {
    return TVPlatform.ANDROID_TV;
  }
  return TVPlatform.NONE;
}

export function isTV() {
  return detectTVPlatform() !== TVPlatform.NONE;
}

// Control remoto: mapeo de teclas de TV (keyCode y key string)
export const TV_KEY_CODES = {
  PLAY_PAUSE: [179, 415, 19, 102],
  STOP: [178, 413],
  FAST_FWD: [228, 417],
  REWIND: [227, 412],
  NEXT: [176],
  PREV: [177],
  UP: [38, 29460],
  DOWN: [40, 29461],
  LEFT: [37, 4, 29462],
  RIGHT: [39, 5, 29463],
  ENTER: [13, 32, 29443],
  BACK: [8, 461, 27, 10009],
};

const KEY_NAMES = {
  UP: ['ArrowUp', 'Up'],
  DOWN: ['ArrowDown', 'Down'],
  LEFT: ['ArrowLeft', 'Left'],
  RIGHT: ['ArrowRight', 'Right'],
  ENTER: ['Enter', 'Select', 'Space', ' '],
  BACK: ['Backspace', 'Escape', 'GoBack', 'Back'],
  PLAY_PAUSE: ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'Unidentified'],
  NEXT: ['MediaTrackNext'],
  PREV: ['MediaTrackPrevious'],
};

// Inyectar estilos de foco premium
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.id = 'tv-focus-styles';
  style.innerHTML = `
    .focusable, button, a, [tabindex="0"], input, select {
      transition: transform 0.2s ease, outline-color 0.2s ease, box-shadow 0.2s ease !important;
    }
    .focusable:focus, button:focus, a:focus, [tabindex="0"]:focus, input:focus {
      outline: 4px solid var(--accent-color, #00ffff) !important;
      outline-offset: 4px !important;
      transform: scale(1.06) !important;
      box-shadow: 0 12px 30px rgba(0,0,0,0.8), 0 0 20px var(--accent-glow, rgba(0,255,255,0.5)) !important;
      z-index: 9999 !important;
    }
  `;
  document.head.appendChild(style);
}

// Motor de navegación espacial 2D
class SpatialNavigation {
  constructor() {
    this.isActive = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    document.addEventListener('keydown', this.handleKeyDown);
    console.log('[SpatialNav] Motor D-pad iniciado.');

    setTimeout(() => this.focusFirst(), 300);
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
    const selector = '.focusable, button, a, [tabindex="0"], input, select';
    const elements = Array.from(document.querySelectorAll(selector));

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

  handleKeyDown(e) {
    const code = e.keyCode;
    const key = e.key;
    let direction = null;

    if (TV_KEY_CODES.UP.includes(code) || KEY_NAMES.UP.includes(key)) direction = 'up';
    else if (TV_KEY_CODES.DOWN.includes(code) || KEY_NAMES.DOWN.includes(key)) direction = 'down';
    else if (TV_KEY_CODES.LEFT.includes(code) || KEY_NAMES.LEFT.includes(key)) direction = 'left';
    else if (TV_KEY_CODES.RIGHT.includes(code) || KEY_NAMES.RIGHT.includes(key)) direction = 'right';

    if (direction) {
      // Si el elemento enfocado es un input de texto y la tecla es izquierda/derecha dentro del texto, permitir comportamiento por defecto
      if (document.activeElement && document.activeElement.tagName === 'INPUT' && (direction === 'left' || direction === 'right')) {
        return;
      }

      e.preventDefault();
      this.moveFocus(direction);
    }
  }

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

      let isCorrectDirection = false;
      let primaryDist = 0;
      let secondaryDist = 0;

      switch (direction) {
        case 'up':
          isCorrectDirection = dy < -2;
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
        const score = primaryDist + 3.5 * secondaryDist;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = el;
        }
      }
    }

    if (bestCandidate) {
      bestCandidate.focus();
      bestCandidate.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }
  }
}

export const spatialNavigation = new SpatialNavigation();

// Registrar handlers para multimedia de TV y control remoto básico
export function registerTVKeyHandlers(handlers) {
  const handleKey = (e) => {
    const code = e.keyCode;
    const key = e.key;

    if (TV_KEY_CODES.PLAY_PAUSE.includes(code) || KEY_NAMES.PLAY_PAUSE.includes(key)) {
      e.preventDefault(); handlers.onPlayPause?.();
    } else if (TV_KEY_CODES.NEXT.includes(code) || KEY_NAMES.NEXT.includes(key)) {
      e.preventDefault(); handlers.onNext?.();
    } else if (TV_KEY_CODES.PREV.includes(code) || KEY_NAMES.PREV.includes(key)) {
      e.preventDefault(); handlers.onPrevious?.();
    } else if (TV_KEY_CODES.FAST_FWD.includes(code)) {
      e.preventDefault(); handlers.onForward?.();
    } else if (TV_KEY_CODES.REWIND.includes(code)) {
      e.preventDefault(); handlers.onRewind?.();
    } else if (TV_KEY_CODES.BACK.includes(code) || KEY_NAMES.BACK.includes(key)) {
      e.preventDefault(); handlers.onBack?.();
    }
  };

  document.addEventListener('keydown', handleKey);

  if (isTV()) {
    spatialNavigation.start();
  }

  return () => {
    document.removeEventListener('keydown', handleKey);
    spatialNavigation.stop();
  };
}

