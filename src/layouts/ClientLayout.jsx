import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Search, Library, Settings, BarChart2 } from 'lucide-react';
import SettingsSidebar from '../components/SettingsSidebar';
import GlassButtonWrapper from '../components/ui/GlassButtonWrapper';
import './ClientLayout.css';

export default function ClientLayout() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="client-layout">
      
      {/* SIDEBAR TV/DESKTOP */}
      <nav className="tv-sidebar">
        
        <div className="sidebar-top">
          <img src="/icon.png" alt="Musicfy" className="sidebar-logo" />
        </div>
        
        {/* PÍLDORA CENTRAL CON LIQUID GLASS (Envuelve directamente el contenido) */}
        <div className="sidebar-pill-wrapper">
          <GlassButtonWrapper className="glass-pill-container" radius="35" depth="15" blur="4" strength="0" background-color="rgba(25, 25, 25, 0.5)" chromatic-aberration="3">
            <div className="tv-pill-content">
              <Link to="/" className={`pill-icon ${location.pathname === '/' ? 'active' : ''}`}>
                <Home size={22} strokeWidth={location.pathname === '/' ? 2.5 : 2} />
              </Link>
              <Link to="/search" className={`pill-icon ${location.pathname === '/search' ? 'active' : ''}`}>
                <Search size={22} strokeWidth={location.pathname === '/search' ? 2.5 : 2} />
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

        <div className="sidebar-bottom">
          <button className="pill-icon btn-icon now-playing-icon">
            <BarChart2 size={24} />
          </button>
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
              <div className="icon-box"><Search size={22} strokeWidth={location.pathname === '/search' ? 2.5 : 2} /></div>
              <span>Buscar</span>
            </Link>
            <Link to="/library" className={`pill-icon-mobile ${location.pathname === '/library' ? 'active' : ''}`}>
              <div className="icon-box"><Library size={22} strokeWidth={location.pathname === '/library' ? 2.5 : 2} /></div>
              <span>Biblioteca</span>
            </Link>
            <button onClick={() => setIsSettingsOpen(true)} className={`pill-icon-mobile btn-icon ${isSettingsOpen ? 'active' : ''}`}>
              <div className="icon-box"><Settings size={22} strokeWidth={isSettingsOpen ? 2.5 : 2} /></div>
              <span>Ajustes</span>
            </button>
          </nav>
        </GlassButtonWrapper>
      </div>

      <SettingsSidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="main-content">
        <Routes>
           <Route path="/" element={
             <div className="home-container">
                <div className="hero-background"></div>
                <div className="content-scroll">
                  <h1 className="section-title">Hecho para ti</h1>
                  <h2 className="hero-title">Release Radar</h2>
                  <p className="hero-subtitle">Atrapa toda la música más reciente de los artistas que sigues, además de nuevos sencillos elegidos para ti. Se actualiza todos los viernes.</p>
                  
                  <div className="carousel">
                    <div className="card highlight"><img src="https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop" alt="Release" /><div className="card-info"><h4>Release Radar</h4></div></div>
                    <div className="card"><img src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=400&auto=format&fit=crop" alt="Discover" /><div className="card-info"><h4>Discover Weekly</h4></div></div>
                    <div className="card"><img src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=400&auto=format&fit=crop" alt="Pop Mix" /><div className="card-info"><h4>Pop Mix</h4></div></div>
                    <div className="card"><img src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=400&auto=format&fit=crop" alt="Indie Mix" /><div className="card-info"><h4>Indie Mix</h4></div></div>
                  </div>

                  <div className="content-row" style={{ marginTop: '50px' }}>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 20px 5px' }}>Tu rotación intensa</h3>
                    <div className="carousel">
                      <div className="card"><img src="https://images.unsplash.com/photo-1493225457124-a1a2a5f5f924?q=80&w=400&auto=format&fit=crop" alt="Mix 1" /></div>
                      <div className="card"><img src="https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=400&auto=format&fit=crop" alt="Mix 2" /></div>
                      <div className="card"><img src="https://images.unsplash.com/photo-1459749411175-04bf5292ceea?q=80&w=400&auto=format&fit=crop" alt="Mix 3" /></div>
                    </div>
                  </div>
                </div>
             </div>
           } />
        </Routes>
      </main>
    </div>
  );
}
