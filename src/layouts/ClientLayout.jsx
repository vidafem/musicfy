import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Search, Library, Settings, Globe, Play, Pause, Activity } from 'lucide-react';
import SettingsSidebar from '../components/SettingsSidebar';
import PlayerBar from '../components/PlayerBar';
import GlassButtonWrapper from '../components/ui/GlassButtonWrapper';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLibraryStore } from '../store/useLibraryStore';
import HomePage from '../pages/client/Home';
import LibraryPage from '../pages/client/Library';
import PlaylistDetailPage from '../pages/client/PlaylistDetail';
import GlobalSearch from '../pages/client/GlobalSearch';
import SearchPage from '../pages/client/Search';
import ArtistDetailPage from '../pages/client/ArtistDetail';
import './ClientLayout.css';

export default function ClientLayout() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileDockMode, setMobileDockMode] = useState('nav');
  const location = useLocation();
  const mobileActiveIndex = location.pathname === '/search'
    ? 1
    : location.pathname === '/library'
      ? 2
      : isSettingsOpen
        ? 3
        : 0;
  
  const { currentSong, isPlaying, fetchSongs } = usePlayerStore();
  const { fetchPlaylists, fetchLikes } = useLibraryStore();
  
  const accentColor = useSettingsStore(state => state.accentColor);
  const accentOpacity = useSettingsStore(state => state.accentOpacity);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent-color', accentColor);
    root.style.setProperty('--accent-opacity', accentOpacity);
    const r = parseInt(accentColor.slice(1, 3), 16);
    const g = parseInt(accentColor.slice(3, 5), 16);
    const b = parseInt(accentColor.slice(5, 7), 16);
    root.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.5)`);
  }, [accentColor, accentOpacity]);

  useEffect(() => {
    fetchSongs();
    fetchPlaylists();
    fetchLikes();
  }, [fetchSongs, fetchPlaylists, fetchLikes]);

  // Variables para gestos táctiles (usamos refs para persistencia sin re-render)
  const touchStartRef = React.useRef({ x: 0, time: 0 });

  return (
    <div className="client-layout">
      <nav className="tv-header">
        <div className="header-left">
          <img src="/icon.png" alt="Musicfy" className="sidebar-logo-bottom" />
        </div>
        <div className="header-player-space"></div>
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

        {/* MÓDULO DE MORFISMO LÍQUIDO (UNIFICADO) */}
      <div className={`mobile-unified-dock visible mode-${mobileDockMode}`}>
        <GlassButtonWrapper className="unified-glass-pill" radius="40" depth="12" blur="6" strength="0" background-color="rgba(20, 20, 20, 0.7)" chromatic-aberration="4">
          <div className="unified-pill-content">
            
            {/* SECCIÓN NAVEGACIÓN */}
            <div className="nav-morph-section">
              <nav className={`mobile-pill-content active-index-${mobileActiveIndex}`} style={{ '--mobile-active-index': mobileActiveIndex }}>
                <Link to="/" className={`pill-icon-mobile ${location.pathname === '/' ? 'active' : ''}`}>
                  <div className="icon-box"><Home size={22} /></div>
                </Link>
                <Link to="/search" className={`pill-icon-mobile ${location.pathname === '/search' ? 'active' : ''}`}>
                  <div className="icon-box"><Search size={22} /></div>
                </Link>
                <Link to="/library" className={`pill-icon-mobile ${location.pathname === '/library' ? 'active' : ''}`}>
                  <div className="icon-box"><Library size={22} /></div>
                </Link>
                <button onClick={() => setIsSettingsOpen(true)} className={`pill-icon-mobile btn-icon ${isSettingsOpen ? 'active' : ''}`}>
                  <div className="icon-box"><Settings size={22} /></div>
                </button>
              </nav>
              {/* Icono de expansión para navegación (cuando está colapsada) */}
              <button className="expand-nav-icon" onClick={() => setMobileDockMode('nav')}>
                <div className="dot-grid"><span></span><span></span><span></span><span></span></div>
              </button>
            </div>

            {/* SECCIÓN REPRODUCTOR CON GESTOS PREMIUM */}
            {currentSong && (
              <div 
                className="player-morph-section" 
                onClick={(e) => {
                  if (mobileDockMode !== 'player') {
                    setMobileDockMode('player');
                  } else {
                    // Si ya está expandida la sección, al click abrimos FullScreen
                    usePlayerStore.getState().setIsFullScreen(true);
                  }
                }}
                onTouchStart={(e) => {
                  touchStartRef.current = { x: e.touches[0].clientX, time: Date.now() };
                }}
                onTouchEnd={(e) => {
                  const touchEndX = e.changedTouches[0].clientX;
                  const diffX = touchEndX - touchStartRef.current.x;
                  const diffTime = Date.now() - touchStartRef.current.time;

                  // Gesto de Pulsación Larga (Menú dispositivos)
                  if (diffTime > 500 && Math.abs(diffX) < 15) {
                    usePlayerStore.getState().setShowDeviceSelector(true);
                    return;
                  }

                  // Swipe Premium: Derecha -> Siguiente, Izquierda -> Anterior
                  if (Math.abs(diffX) > 60 && diffTime < 300) {
                    if (diffX > 0) {
                      usePlayerStore.getState().playNext();
                    } else {
                      usePlayerStore.getState().playPrevious();
                    }
                  }
                }}
              >
                <div className="mini-player-content">
                  <div className="mini-album">
                    <img src={currentSong?.cover_url} alt="Cover" />
                    {isPlaying && <div className="mini-playing-indicator"><span className="bar"></span><span className="bar"></span><span className="bar"></span></div>}
                  </div>
                  <div className="mini-info">
                    <span className="mini-title">{currentSong?.title}</span>
                    <span className="mini-artist">{currentSong?.artist}</span>
                  </div>
                  <button className="mini-pill-play-btn" onClick={(e) => { e.stopPropagation(); usePlayerStore.getState().togglePlay(); }}>
                    {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
                  </button>
                </div>
                {/* Icono de expansión para reproductor (cuando está colapsado) */}
                <button className="expand-player-icon" onClick={(e) => { e.stopPropagation(); setMobileDockMode('player'); }}>
                  <Activity size={22} className={isPlaying ? 'pulse' : ''} />
                </button>
              </div>
            )}

          </div>
        </GlassButtonWrapper>
      </div>

      <PlayerBar mobileDockMode={mobileDockMode} onMobileDockModeChange={setMobileDockMode} />
      <SettingsSidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/playlist/:id" element={<PlaylistDetailPage />} />
          <Route path="/artist/:name" element={<ArtistDetailPage />} />
          <Route path="/world" element={<GlobalSearch />} />
        </Routes>
      </main>
    </div>
  );
}
