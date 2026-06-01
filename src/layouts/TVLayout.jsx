import React, { useEffect, useState } from 'react'
import { usePlayerStore } from '../store/usePlayerStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { registerTVKeyHandlers, detectTVPlatform } from '../lib/tvDetector'

export default function TVLayout() {
  const { currentSong, isPlaying, queue, togglePlay, playNext, playPrevious, setCurrentTime, currentTime, duration } = usePlayerStore()
  const accentColor = useSettingsStore(s => s.accentColor)
  const [showQueue, setShowQueue] = useState(false)
  
  useEffect(() => {
    const cleanup = registerTVKeyHandlers({
      onPlayPause: togglePlay,
      onNext: playNext,
      onPrevious: playPrevious,
      onForward: () => setCurrentTime(Math.min(currentTime + 10, duration || 9999), true),
      onRewind: () => setCurrentTime(Math.max(currentTime - 10, 0), true),
      onBack: () => setShowQueue(prev => !prev),
    })
    return cleanup
  }, [currentTime, duration, togglePlay, playNext, playPrevious, setCurrentTime])
  
  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#000',
      display: 'flex', flexDirection: 'column',
      color: '#fff', fontFamily: "'Inter', 'Outfit', sans-serif",
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Fondo con artwork desenfocado */}
      {currentSong?.cover_url && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${currentSong.background_url || currentSong.cover_url})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(50px) brightness(0.25) saturate(1.5)',
          transform: 'scale(1.15)',
          zIndex: 1,
          transition: 'all 1.2s cubic-bezier(0.25, 1, 0.5, 1)'
        }} />
      )}

      {/* Capa de degradado oscuro superior */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.6) 100%)',
        zIndex: 2,
        pointerEvents: 'none'
      }} />
      
      {/* Contenido principal */}
      <div style={{ position: 'relative', zIndex: 3, flex: 1, display: 'flex', alignItems: 'center', padding: '0 8%', gap: '6%', height: '100%' }}>
        {/* Cover grande */}
        <div style={{
          position: 'relative',
          width: '380px',
          height: '380px',
          borderRadius: '28px',
          overflow: 'hidden',
          boxShadow: `0 30px 80px rgba(0,0,0,0.8), 0 0 50px ${accentColor}18`,
          flexShrink: 0,
          border: '1px solid rgba(255,255,255,0.08)'
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
        
        {/* Info y controles */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '3.8rem', fontWeight: '900', lineHeight: 1.1, marginBottom: '15px', textShadow: '0 4px 15px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentSong?.title || 'Sin canción seleccionada'}
          </div>
          <div style={{ fontSize: '1.8rem', color: accentColor, fontWeight: '500', marginBottom: '50px', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
            {currentSong?.artist || 'Artista Desconocido'}
          </div>
          
          {/* Barra de progreso */}
          <TVProgressBar currentTime={currentTime} duration={duration} accentColor={accentColor} />
          
          {/* Controles visuales grandes */}
          <div style={{ display: 'flex', gap: '40px', marginTop: '50px', alignItems: 'center' }}>
            <TVButton onClick={playPrevious} label="⏮" size={60} />
            <TVButton onClick={togglePlay} label={isPlaying ? '⏸' : '▶'} size={96} primary accentColor={accentColor} />
            <TVButton onClick={playNext} label="⏭" size={60} />
            <button 
              onClick={() => setShowQueue(prev => !prev)}
              style={{
                marginLeft: 'auto',
                background: showQueue ? 'rgba(255,255,255,0.15)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                color: showQueue ? accentColor : 'white',
                borderRadius: '16px',
                padding: '12px 24px',
                fontSize: '1.1rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            >
              Ver Cola de Reproducción
            </button>
          </div>
        </div>
        
        {/* Cola lateral */}
        {showQueue && (
          <div style={{
            width: '380px', height: '80%',
            background: 'rgba(10, 10, 15, 0.75)',
            backdropFilter: 'blur(30px)',
            webkitBackdropFilter: 'blur(30px)',
            borderRadius: '24px', padding: '30px',
            border: '1px solid rgba(255,255,255,0.1)',
            overflowY: 'auto',
            zIndex: 10,
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '24px', color: accentColor, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>Cola de Reproducción</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {queue.slice(0, 12).map((song, i) => (
                <div key={song.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  background: song.id === currentSong?.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                  borderRadius: '12px',
                  transition: 'all 0.2s'
                }}>
                  <img src={song.cover_url} alt="" style={{ width: '45px', height: '45px', borderRadius: '6px', objectFit: 'cover' }} />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: song.id === currentSong?.id ? accentColor : 'white' }}>{song.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Indicador de plataforma TV */}
      <div style={{ position: 'absolute', bottom: '25px', right: '35px', opacity: 0.25, fontSize: '0.9rem', zIndex: 5, letterSpacing: '1px', fontWeight: 'bold' }}>
        PLATAFORMA: {detectTVPlatform().toUpperCase()}
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

function TVButton({ onClick, label, size, primary, accentColor }) {
  return (
    <button onClick={onClick} style={{
      width: `${size}px`, height: `${size}px`,
      borderRadius: '50%',
      background: primary ? accentColor : 'rgba(255,255,255,0.06)',
      color: primary ? '#000' : '#fff',
      border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)',
      fontSize: `${size * 0.38}px`,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: primary ? `0 15px 30px ${accentColor}25` : 'none',
      transition: 'all 0.2s'
    }}>
      {label}
    </button>
  )
}
