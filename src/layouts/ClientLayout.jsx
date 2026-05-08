import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Search, Library, Settings, Globe } from 'lucide-react';
import SettingsSidebar from '../components/SettingsSidebar';
import PlayerBar from '../components/PlayerBar';
import GlassButtonWrapper from '../components/ui/GlassButtonWrapper';
import { usePlayerStore } from '../store/usePlayerStore';
import LibraryPage from '../pages/client/Library';
import GlobalSearch from '../pages/client/GlobalSearch';
import './ClientLayout.css';

export default function ClientLayout() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();
  const { queue, fetchSongs, playSong } = usePlayerStore();

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  return (
    <div className="client-layout">
      
      {/* HEADER TV/DESKTOP (Horizontal Superior) */}
      <nav className="tv-header">
        
        {/* LOGO (A la izquierda) */}
        <div className="header-left">
          <img src="/icon.png" alt="Musicfy" className="sidebar-logo-bottom" />
        </div>

        {/* ESPACIO PARA LA PÍLDORA DEL REPRODUCTOR (Se posiciona aquí vía CSS desde PlayerBar) */}
        <div className="header-player-space"></div>
        
        {/* PÍLDORA CENTRAL DE NAVEGACIÓN (Centrada en la pantalla) */}
        <div className="sidebar-pill-wrapper">
          <GlassButtonWrapper className="glass-pill-container" radius="35" depth="15" blur="4" strength="0" background-color="rgba(25, 25, 25, 0.5)" chromatic-aberration="3">
            <div className="tv-pill-content">
              <Link to="/" className={`pill-icon ${location.pathname === '/' ? 'active' : ''}`}>
                <Home size={22} strokeWidth={location.pathname === '/' ? 2.5 : 2} />
              </Link>
              <Link to="/search" className={`pill-icon ${location.pathname === '/search' ? 'active' : ''}`}>
                <Search size={22} strokeWidth={location.pathname === '/search' ? 2.5 : 2} />
              </Link>
              <Link to="/world" className={`pill-icon ${location.pathname === '/world' ? 'active' : ''}`} title="Música Global">
                <Globe size={22} strokeWidth={location.pathname === '/world' ? 2.5 : 2} />
              </Link>
              <Link to="/library" className={`pill-icon ${location.pathname === '/library' ? 'active' : ''}`}>
                <Library size={22} strokeWidth={location.pathname === '/library' ? 2.5 : 2} />
              </Link>
              <button onClick={() => setIsSettingsOpen(true)} className={`pill-icon btn-icon ${isSettingsOpen ? 'active' : ''}`}>
                <Settings size={22} strokeWidth={isSettingsOpen ? 2.5 : 2} />
              </button>
            </div>
          </GlassButtonWrapper>
        </div>

      </nav>

      {/* MENÚ MÓVIL (Píldora Horizontal estilo Apple Music) */}
      <div className="mobile-bottom-container">
        <GlassButtonWrapper className="glass-pill-container" radius="40" depth="12" blur="4" strength="0" background-color="rgba(30, 30, 30, 0.7)" chromatic-aberration="4">
          <nav className="mobile-pill-content">
            <Link to="/" className={`pill-icon-mobile ${location.pathname === '/' ? 'active' : ''}`}>
              <div className="icon-box"><Home size={22} strokeWidth={location.pathname === '/' ? 2.5 : 2} /></div>
              <span>Inicio</span>
            </Link>
            <Link to="/search" className={`pill-icon-mobile ${location.pathname === '/search' ? 'active' : ''}`}>
              <div className="icon-box"><Search size={22} strokeWidth={location.pathname === '/' ? 2.5 : 2} /></div>
              <span>Buscar</span>
            </Link>
            <Link to="/library" className={`pill-icon-mobile ${location.pathname === '/library' ? 'active' : ''}`}>
              <div className="icon-box"><Library size={22} strokeWidth={location.pathname === '/' ? 2.5 : 2} /></div>
              <span>Biblioteca</span>
            </Link>
            <button onClick={() => setIsSettingsOpen(true)} className={`pill-icon-mobile btn-icon ${isSettingsOpen ? 'active' : ''}`}>
              <div className="icon-box"><Settings size={22} strokeWidth={isSettingsOpen ? 2.5 : 2} /></div>
              <span>Ajustes</span>
            </button>
          </nav>
        </GlassButtonWrapper>
      </div>

      <PlayerBar />
      <SettingsSidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="main-content">
        <Routes>
           <Route path="/" element={
             <div className="home-container">
                <div className="hero-background"></div>
                <div className="content-scroll" style={{ padding: '120px 40px 100px 40px' }}>
                  <h1 className="section-title">Librería Principal</h1>
                  <h2 className="hero-title">Tus canciones</h2>
                  <p className="hero-subtitle">Música almacenada en la nube y gestionada por IA.</p>
                  
                  <div className="carousel">
                    {queue.map(song => (
                      <div key={song.id} className="card highlight" onClick={() => playSong(song)}>
                        <img src={song.cover_url} alt={song.title} />
                        <div className="card-info">
                          <h4>{song.title}</h4>
                          <p>{song.artist}</p>
                        </div>
                      </div>
                    ))}
                    {queue.length === 0 && (
                      <div style={{ padding: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', textAlign: 'center', width: '100%' }}>
                        Sube música desde el panel de administrador para verla aquí.
                      </div>
                    )}
                  </div>

                  {queue.length > 0 && (
                    <div className="content-row" style={{ marginTop: '50px' }}>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 20px 5px' }}>Recientes</h3>
                      <div className="carousel">
                        {queue.slice(0, 3).map(song => (
                          <div key={song.id} className="card" onClick={() => playSong(song)}>
                            <img src={song.cover_url} alt={song.title} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
             </div>
           } />
           {/* NUEVA RUTA: Biblioteca completa */}
           {/* NUEVA RUTA: Búsqueda Global (YouTube) */}
           <Route path="/world" element={<GlobalSearch />} />
           
           <Route path="/library" element={<LibraryPage />} />
        </Routes>
      </main>
    </div>
  );
}
