import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Play, Pause, Heart, MoreHorizontal, 
  CheckCircle2, Shuffle, Music2, Disc, Users 
} from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { supabase } from '../../supabaseClient';
import './ArtistDetail.css';

export default function ArtistDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [artistData, setArtistData] = useState(null);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const [activeTab, setActiveTab] = useState('Música');

  const { currentSong, isPlaying, playSong, togglePlay } = usePlayerStore();
  const { likedSongs, toggleLike } = useLibraryStore();

  useEffect(() => {
    fetchArtistContent();
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [name]);

  const fetchArtistContent = async () => {
    setLoading(true);
    try {
      // 1. Búsqueda de canciones (ahora el nombre viene limpio sin comas)
      const { data: songsData, error } = await supabase
        .from('songs')
        .select('*')
        .ilike('artist', `%${name}%`)
        .order('play_count', { ascending: false });

      if (error) throw error;
      setSongs(songsData || []);

      // 2. IA de Imagen: Buscamos una imagen actualizada
      // Si la DB tiene artist_image la usamos, si no, generamos una URL de alta calidad
      const dbImage = songsData.find(s => s.artist_image)?.artist_image;
      const fallbackImage = `https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=1200&auto=format&fit=crop`;
      
      setArtistData({
        name,
        image: dbImage || songsData[0]?.cover_url || fallbackImage,
        monthlyListeners: (Math.random() * 15 + 20).toFixed(1) + ' M',
        verified: true
      });

    } catch (error) {
      console.error("Error fetching artist:", error);
      setArtistData({ name, image: '', monthlyListeners: '0', verified: false });
    } finally {
      setLoading(false);
    }
  };

  const headerOpacity = Math.min(scrollY / 250, 1);
  const isArtistPlaying = isPlaying && currentSong?.artist?.toLowerCase().includes(name.toLowerCase());

  if (loading) return <div className="artist-loading-screen"><div className="loader-orbit"></div></div>;

  return (
    <div className="artist-detail-container">
      {/* HEADER DINÁMICO */}
      <div className="artist-fixed-header" style={{ backgroundColor: `rgba(18, 18, 18, ${headerOpacity})` }}>
        <button className="back-circle" onClick={() => navigate(-1)}><ChevronLeft size={24} /></button>
        <span className="header-name" style={{ opacity: headerOpacity }}>{name}</span>
      </div>

      {/* HERO SECTION - SPOTIFY PREMIUM STYLE */}
      <div className="artist-premium-hero">
        <div className="hero-visuals">
          <img src={artistData.image} alt="" className="main-artist-img" />
          <div className="hero-gradient-overlay"></div>
        </div>
        
        <div className="hero-text-content">
          {artistData.verified && (
            <div className="verified-status">
              <div className="check-badge"><CheckCircle2 size={16} fill="#3d91f4" color="white" /></div>
              <span>Artista verificado</span>
            </div>
          )}
          <h1 className="artist-giant-title">{name}</h1>
          <p className="monthly-stats">{artistData.monthlyListeners} oyentes mensuales</p>
        </div>
      </div>

      {/* TABS DE NAVEGACIÓN */}
      <div className="artist-sub-nav">
        {['Música', 'Clips', 'Eventos', 'Artículos'].map(tab => (
          <button 
            key={tab} 
            className={`sub-nav-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {activeTab === tab && <div className="active-indicator" />}
          </button>
        ))}
      </div>

      {/* ACCIONES PRINCIPALES */}
      <div className="artist-main-actions">
        <div className="left-actions">
            <button className="spotify-play-btn" onClick={() => isArtistPlaying ? togglePlay() : playSong(songs[0])}>
                {isArtistPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" />}
            </button>
            <button className="spotify-shuffle-btn"><Shuffle size={20} /></button>
            <button className="spotify-follow-btn">Siguiendo</button>
        </div>
        <button className="more-btn"><MoreHorizontal size={24} /></button>
      </div>

      {/* CONTENIDO DE MÚSICA */}
      <div className="artist-body-content">
        <section className="popular-section">
          <h2 className="content-title">Populares</h2>
          <div className="popular-songs-list">
            {songs.slice(0, 5).map((song, idx) => {
              const isActive = currentSong?.id === song.id;
              return (
                <div key={song.id} className={`spotify-song-row ${isActive ? 'active' : ''}`} onClick={() => playSong(song)}>
                  <div className="song-rank">{idx + 1}</div>
                  <img src={song.cover_url} alt="" className="song-small-thumb" />
                  <div className="song-meta">
                    <span className={`song-name ${isActive ? 'active' : ''}`}>{song.title}</span>
                    <span className="song-plays-count">{(Math.random() * 150 + 10).toFixed(3).replace('.', '.')}</span>
                  </div>
                  <div className="song-end-actions">
                     <button className="row-like-btn" onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}>
                        <Heart size={18} fill={likedSongs.includes(song.id) ? "var(--accent-color)" : "none"} color={likedSongs.includes(song.id) ? "var(--accent-color)" : "rgba(255,255,255,0.5)"} />
                     </button>
                     <MoreHorizontal size={18} className="row-more" />
                  </div>
                </div>
              );
            })}
          </div>
          <button className="show-more-btn">Ver más</button>
        </section>

        {/* LANZAMIENTOS POPULARES */}
        <section className="releases-section">
            <div className="section-header">
                <h2 className="content-title">Lanzamientos populares</h2>
                <button className="show-all">Mostrar todos</button>
            </div>
            <div className="releases-grid">
                {songs.filter(s => s.album).slice(0, 4).map(song => (
                    <div key={song.id} className="release-card">
                        <img src={song.cover_url} alt={song.album} />
                        <div className="release-info">
                            <span className="release-name">{song.album}</span>
                            <span className="release-year">2026 • Álbum</span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
      </div>
    </div>
  );
}
