// Detecta la plataforma TV y adapta la UI

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
  PLAY_PAUSE: [179, 415, 19, 102],  // MediaPlayPause, MediaPlay, KEYCODE_MEDIA_PLAY_PAUSE
  STOP: [178, 413],
  FAST_FWD: [228, 417],
  REWIND: [227, 412],
  NEXT: [176],
  PREV: [177],
  UP: [38],
  DOWN: [40],
  LEFT: [37],
  RIGHT: [39],
  ENTER: [13, 32],
  BACK: [8, 461, 27], // Backspace, escape o back nativo de TV
}

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
  return () => document.removeEventListener('keydown', handleKey)
}
