import React, { useEffect, useState, useRef } from 'react'
import { usePlayerStore } from '../store/usePlayerStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { registerTVKeyHandlers, detectTVPlatform, spatialNavigation } from '../lib/tvDetector'
import { useLyrics } from '../hooks/useLyrics'
import { getPalette } from 'colorthief'

// Componente para el fondo animado fluido (estilo Apple Music Aurora)
function TVCanvasBackground({ coverUrl }) {
  const canvasRef = useRef(null)
  const [colors, setColors] = useState([
    [15, 15, 25],
    [40, 20, 50],
    [10, 30, 45]
  ])

  const isTVDevice = detectTVPlatform() !== 'none'

  // Si es un dispositivo TV, usamos un div de fondo borroso acelerado por GPU (transiciones CSS)
  // en lugar del pesado loop de canvas a 60fps con filtros dynamic.
  if (isTVDevice) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${coverUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(75px) saturate(1.5) brightness(0.26)',
          transform: 'scale(1.2)',
          zIndex: 1,
          pointerEvents: 'none',
          transition: 'background-image 1.2s ease-in-out'
        }}
      />
    )
  }

  // Extraer paleta de colores de la portada
  useEffect(() => {
    if (!coverUrl) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = coverUrl

    img.onload = async () => {
      try {
        const colorsResult = await getPalette(img, 3)
        if (colorsResult && colorsResult.length >= 3) {
          const rgbPalette = colorsResult.map(c => c.array ? c.array() : [0, 0, 0])
          setColors(rgbPalette)
        }
      } catch (e) {
        console.warn('[TVBackground] Falló extracción de color:', e)
      }
    }
  }, [coverUrl])

  // Animación del gradiente en Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animationId
    let tick = 0

    // Puntos para mover los centros de los colores
    const points = [
      { x: 0, y: 0, vx: 0.003, vy: 0.005, radius: 0.7 },
      { x: 0, y: 0, vx: -0.004, vy: 0.003, radius: 0.8 },
      { x: 0, y: 0, vx: 0.005, vy: -0.003, radius: 0.75 }
    ]

    const resize = () => {
      canvas.width = window.innerWidth / 4 // resolución baja para performance en TV
      canvas.height = window.innerHeight / 4
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      tick++
      const w = canvas.width
      const h = canvas.height
      ctx.fillStyle = '#050508'
      ctx.fillRect(0, 0, w, h)

      // Dibujar círculos de colores difuminados y moverlos
      points.forEach((p, i) => {
        p.x = w / 2 + Math.sin(tick * p.vx) * (w / 3)
        p.y = h / 2 + Math.cos(tick * p.vy) * (h / 3)

        const color = colors[i] || [20, 20, 20]
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, w * p.radius)
        grad.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.85)`)
        grad.addColorStop(1, 'rgba(5, 5, 8, 0)')

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(p.x, p.y, w * p.radius, 0, Math.PI * 2)
        ctx.fill()
      })

      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [colors])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        filter: 'blur(80px) saturate(1.8) brightness(0.38)',
        transform: 'scale(1.2)',
        zIndex: 1,
        pointerEvents: 'none'
      }}
    />
  )
}

export default function TVLayout() {
  const { 
    currentSong, isPlaying, queue, togglePlay, playNext, playPrevious, 
    setCurrentTime, currentTime, duration, playSong 
  } = usePlayerStore()
  const accentColor = useSettingsStore(s => s.accentColor)
  const [showQueue, setShowQueue] = useState(false)
  const [showLyrics, setShowLyrics] = useState(true) // Activado por defecto en TV para inmersión
  
  // Registrar controles multimedia nativos de TV y activar navegación espacial
  useEffect(() => {
    const cleanup = registerTVKeyHandlers({
      onPlayPause: () => {
        import('../services/player/audioNormalizer').then(m => m.resumeWebAudioContext());
        togglePlay();
      },
      onNext: playNext,
      onPrevious: playPrevious,
      onForward: () => setCurrentTime(Math.min(currentTime + 10, duration || 9999), true),
      onRewind: () => setCurrentTime(Math.max(currentTime - 10, 0), true),
      onBack: () => {
        if (showQueue) setShowQueue(false)
        else window.history.back()
      },
    })
    
    // Iniciar el motor de navegación espacial en la TV
    spatialNavigation.start();

    return () => {
      cleanup()
      spatialNavigation.stop()
    }
  }, [currentTime, duration, togglePlay, playNext, playPrevious, setCurrentTime, showQueue])

  // Hook de Letras Sincronizadas
  const { parsedLyrics, lyricsContainerRef } = useLyrics(currentSong, currentTime, showLyrics)

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#040406',
      display: 'flex', flexDirection: 'column',
      color: '#fff', fontFamily: "'Outfit', 'Inter', sans-serif",
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Fondo Aurora Canvas */}
      <TVCanvasBackground coverUrl={currentSong?.cover_url} />

      {/* Degradado oscuro superior e inferior */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(4,4,6,0.92) 0%, rgba(0,0,0,0.1) 50%, rgba(4,4,6,0.85) 100%)',
        zIndex: 2,
        pointerEvents: 'none'
      }} />
      
      {/* Contenido principal */}
      <div style={{ position: 'relative', zIndex: 3, flex: 1, display: 'flex', alignItems: 'center', padding: '0 6%', gap: '6%', height: '100%' }}>
        
        {/* LADO IZQUIERDO: Reproductor y Carátula */}
        <div style={{ flex: '1 1 45%', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
          
          {/* Cover Art Gigante con animación de escala */}
          <div style={{
            position: 'relative',
            width: '380px',
            height: '380px',
            borderRadius: '32px',
            overflow: 'hidden',
            boxShadow: `0 35px 90px rgba(0,0,0,0.85), 0 0 60px ${accentColor}14`,
            border: '1px solid rgba(255,255,255,0.1)',
            marginBottom: '40px',
            transform: isPlaying ? 'scale(1.02)' : 'scale(0.96)',
            transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
            alignSelf: 'flex-start'
          }}>
            <img
              src={currentSong?.cover_url || '/icon.png'}
              alt={currentSong?.title}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>

          <div style={{ fontSize: '3.6rem', fontWeight: '900', lineHeight: 1.1, marginBottom: '10px', textShadow: '0 4px 15px rgba(0,0,0,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentSong?.title || 'Sin canción seleccionada'}
          </div>
          <div style={{ fontSize: '1.8rem', color: accentColor, fontWeight: '600', marginBottom: '45px', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
            {currentSong?.artist || 'Artista Desconocido'}
          </div>
          
          {/* Barra de progreso */}
          <TVProgressBar currentTime={currentTime} duration={duration} accentColor={accentColor} />
          
          {/* Controles multimedia enfocables para D-pad */}
          <div style={{ display: 'flex', gap: '30px', marginTop: '45px', alignItems: 'center' }}>
            <TVButton onClick={playPrevious} label="⏮" size={60} className="focusable" />
            <TVButton 
              onClick={() => {
                import('../services/player/audioNormalizer').then(m => m.resumeWebAudioContext());
                togglePlay();
              }} 
              label={isPlaying ? '⏸' : '▶'} 
              size={84} 
              primary 
              accentColor={accentColor} 
              className="focusable" 
            />
            <TVButton onClick={playNext} label="⏭" size={60} className="focusable" />
            
            <button 
              onClick={() => { setShowQueue(!showQueue); setShowLyrics(false); }}
              className="focusable"
              style={{
                marginLeft: '30px',
                background: showQueue ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: showQueue ? accentColor : 'white',
                borderRadius: '16px',
                padding: '14px 28px',
                fontSize: '1.1rem',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              Cola de Reproducción
            </button>

            <button 
              onClick={() => { setShowLyrics(!showLyrics); setShowQueue(false); }}
              className="focusable"
              style={{
                background: showLyrics ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: showLyrics ? accentColor : 'white',
                borderRadius: '16px',
                padding: '14px 28px',
                fontSize: '1.1rem',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              Letras
            </button>
          </div>
        </div>

        {/* LADO DERECHO: Panel dinámico (Letras Sincronizadas u Cola de reproducción) */}
        <div style={{ flex: '1 1 50%', height: '75%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Vista de Letras Sincronizadas Fullscreen */}
          {showLyrics && (
            <div 
              ref={lyricsContainerRef}
              style={{
                width: '100%',
                height: '100%',
                overflowY: 'hidden',
                paddingRight: '20px',
                maskImage: 'linear-gradient(to bottom, transparent 0%, white 15%, white 85%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, white 15%, white 85%, transparent 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                gap: '24px',
                scrollBehavior: 'smooth'
              }}
            >
              {parsedLyrics.length > 0 ? (
                parsedLyrics.map((line, idx) => {
                  const isActive = currentTime >= line.time && (!parsedLyrics[idx + 1] || currentTime < parsedLyrics[idx + 1].time)
                  return (
                    <div 
                      key={idx}
                      className={`lyric-line ${isActive ? 'active' : ''}`}
                      style={{
                        fontSize: isActive ? '2.8rem' : '2.0rem',
                        fontWeight: '800',
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.3)',
                        textShadow: isActive ? `0 0 20px ${accentColor}40` : 'none',
                        transition: 'all 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
                        lineHeight: '1.3',
                        padding: '10px 0',
                        transform: isActive ? 'scale(1.02)' : 'scale(1)',
                        transformOrigin: 'left center'
                      }}
                    >
                      {line.text}
                    </div>
                  )
                })
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: '1.8rem', fontWeight: 'bold' }}>
                  Letras no disponibles para esta canción
                </div>
              )}
            </div>
          )}

          {/* Vista de Cola de Reproducción */}
          {showQueue && (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'rgba(12, 12, 16, 0.5)',
              backdropFilter: 'blur(30px)',
              webkitBackdropFilter: 'blur(30px)',
              borderRadius: '28px',
              padding: '35px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflowY: 'auto',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)'
            }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '30px', color: accentColor, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px' }}>
                Cola de Reproducción
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {queue.map((song, i) => (
                  <div 
                    key={song.id} 
                    tabIndex="0"
                    onClick={() => playSong(song)}
                    className="focusable"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px',
                      padding: '15px',
                      background: song.id === currentSong?.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      border: '1px solid transparent',
                      outline: 'none'
                    }}
                  >
                    <img src={song.cover_url} alt="" style={{ width: '55px', height: '55px', borderRadius: '10px', objectFit: 'cover' }} />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: '800', fontSize: '1.1rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: song.id === currentSong?.id ? accentColor : 'white' }}>
                        {song.title}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', marginTop: '4px' }}>
                        {song.artist}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Indicador de plataforma TV */}
      <div style={{ position: 'absolute', bottom: '25px', right: '35px', opacity: 0.18, fontSize: '0.90rem', zIndex: 5, letterSpacing: '1.5px', fontWeight: 'bold' }}>
        PLATAFORMA TV: {detectTVPlatform().toUpperCase()}
      </div>
    </div>
  )
}

function TVProgressBar({ currentTime, duration, accentColor }) {
  const percent = duration > 0 ? (currentTime / duration) * 100 : 0
  const fmt = (s) => {
    if (isNaN(s)) return "0:00"
    const min = Math.floor(s/60)
    const sec = Math.floor(s%60)
    return `${min}:${String(sec).padStart(2,'0')}`
  }
  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: accentColor, borderRadius: '4px', boxShadow: `0 0 15px ${accentColor}`, transition: 'width 0.1s linear' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '1.2rem', color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  )
}

function TVButton({ onClick, label, size, primary, accentColor, className }) {
  return (
    <button 
      onClick={onClick} 
      className={className}
      style={{
        width: `${size}px`, height: `${size}px`,
        borderRadius: '50%',
        background: primary ? accentColor : 'rgba(255,255,255,0.06)',
        color: primary ? '#000' : '#fff',
        border: primary ? 'none' : '1px solid rgba(255,255,255,0.12)',
        fontSize: `${size * 0.38}px`,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: primary ? `0 15px 30px ${accentColor}25` : 'none',
        outline: 'none'
      }}
    >
      {label}
    </button>
  )
}
