import React, { useState, useEffect } from 'react';
import {
  Users,
  Music,
  HardDrive,
  Activity,
  PlusCircle,
  Mic2,
  Calendar,
  ChevronRight,
  TrendingUp,
  Disc,
  Play
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalSongs: 0,
    totalArtists: 0,
    recentSongs: [],
    storageUsed: 0
  });
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState({
    supabase: 'checking',
    worker: 'checking',
    r2: 'checking',
    itunes: 'checking',
    audiodb: 'checking',
    lyrics: 'checking'
  });

  useEffect(() => {
    fetchDashboardData();
    checkSystemHealth();
  }, []);

  const checkSystemHealth = async () => {
    // 1. Check Supabase
    try {
      const { error } = await supabase.from('songs').select('id').limit(1);
      setSystemStatus(prev => ({ ...prev, supabase: error ? 'offline' : 'online' }));
    } catch (e) { setSystemStatus(prev => ({ ...prev, supabase: 'offline' })); }

    // 2. Check Worker (Spotify Proxy)
    try {
      // Apuntamos a /auth que es un endpoint válido para verificar vida
      const res = await fetch('https://musicfy.canonedu17.workers.dev/auth', { method: 'GET', cache: 'no-store' });
      const isUp = res.status < 500; 
      setSystemStatus(prev => ({ ...prev, worker: isUp ? 'online' : 'offline', r2: isUp ? 'online' : 'offline' }));
    } catch (e) { 
      setSystemStatus(prev => ({ ...prev, worker: 'offline', r2: 'offline' })); 
    }

    // 3. Check iTunes API
    try {
      const res = await fetch('https://itunes.apple.com/search?term=test&limit=1', { mode: 'no-cors' });
      setSystemStatus(prev => ({ ...prev, itunes: 'online' })); // no-cors siempre resuelve si el server responde
    } catch (e) { setSystemStatus(prev => ({ ...prev, itunes: 'offline' })); }

    // 4. Check TheAudioDB
    try {
      const res = await fetch('https://theaudiodb.com/api/v1/json/2/search.php?s=coldplay', { mode: 'no-cors' });
      setSystemStatus(prev => ({ ...prev, audiodb: 'online' }));
    } catch (e) { setSystemStatus(prev => ({ ...prev, audiodb: 'offline' })); }

    // 5. Check LRCLIB (Lyrics)
    try {
      const res = await fetch('https://lrclib.net/api/search?q=test', { mode: 'no-cors' });
      setSystemStatus(prev => ({ ...prev, lyrics: 'online' }));
    } catch (e) { setSystemStatus(prev => ({ ...prev, lyrics: 'offline' })); }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Total Canciones
      const { count: songCount } = await supabase.from('songs').select('*', { count: 'exact', head: true });

      // 2. Artistas Únicos
      const { data: artistsData } = await supabase.from('songs').select('artist');
      const uniqueArtists = new Set(artistsData?.map(s => s.artist)).size;

      // 3. Últimas 5 canciones añadidas
      const { data: recentSongs } = await supabase
        .from('songs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalSongs: songCount || 0,
        totalArtists: uniqueArtists || 0,
        recentSongs: recentSongs || [],
        // Estimación: 5MB por canción (mejoraríamos esto con una función RPC en el futuro)
        storageUsed: (songCount || 0) * 5.2 
      });
    } catch (error) {
      console.error("Error cargando dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const storageLimit = 1024; // 1GB (Free Tier R2)
  const storagePercentage = Math.min((stats.storageUsed / storageLimit) * 100, 100);

  return (
    <div className="dashboard-wrapper" style={wrapperStyle}>
      
      {/* SECCIÓN 1: KPI CARDS */}
      <div className="stats-grid" style={statsGridStyle}>
        
        <div className="stat-card-premium" style={statCardStyle}>
          <div style={iconBoxStyle('#00ffff')}>
            <Music size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={statLabelStyle}>Biblioteca Total</p>
            <h3 style={statValueStyle}>{stats.totalSongs} <span style={unitStyle}>tracks</span></h3>
          </div>
          <TrendingUp size={16} color="#00ffff" style={{ opacity: 0.5 }} />
        </div>

        <div className="stat-card-premium" style={statCardStyle}>
          <div style={iconBoxStyle('#a855f7')}>
            <Mic2 size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={statLabelStyle}>Artistas Activos</p>
            <h3 style={statValueStyle}>{stats.totalArtists} <span style={unitStyle}>talentos</span></h3>
          </div>
        </div>

        <div className="stat-card-premium" style={statCardStyle}>
          <div style={iconBoxStyle('#10b981')}>
            <Users size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={statLabelStyle}>Oyentes (Hoy)</p>
            <h3 style={statValueStyle}>12 <span style={unitStyle}>live</span></h3>
          </div>
        </div>

        <div className="stat-card-premium" style={statCardStyle}>
          <div style={iconBoxStyle('#f59e0b')}>
            <HardDrive size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={statLabelStyle}>Almacenamiento R2</p>
            <h3 style={statValueStyle}>{stats.storageUsed.toFixed(1)} <span style={unitStyle}>MB</span></h3>
            <div style={progressBarContainer}>
              <div style={progressBarFill(storagePercentage)}></div>
            </div>
          </div>
        </div>

      </div>

      {/* SECCIÓN 2: CONTENIDO PRINCIPAL */}
      <div className="main-dashboard-grid" style={mainGridStyle}>
        
        {/* LISTA DE ACTIVIDAD RECIENTE */}
        <div className="dashboard-panel" style={panelStyle}>
          <div style={panelHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={20} color="#00ffff" />
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Subidas Recientes</h3>
            </div>
            <button onClick={() => navigate('/admin/media')} style={textButtonStyle}>
              Ver toda la media <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {stats.recentSongs.map(song => (
              <div key={song.id} style={activityRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={song.cover_url} alt="" style={miniCoverStyle} />
                    {song.is_video && <div style={videoBadge}><Play size={8} /></div>}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600' }}>{song.title}</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{song.artist}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'none', md: 'block' }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Calendar size={12} /> {new Date(song.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
            {stats.recentSongs.length === 0 && !loading && (
              <div style={emptyStateStyle}>
                <Disc size={40} style={{ marginBottom: '10px', opacity: 0.2 }} />
                <p>No hay canciones todavía</p>
                <button onClick={() => navigate('/admin/music')} style={actionButtonStyle}>
                  <PlusCircle size={16} /> Subir mi primera canción
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ACCESOS RÁPIDOS / ESTADO DEL SISTEMA */}
        <div style={{ display: 'grid', gap: '25px', alignContent: 'start' }}>
          
          <div className="dashboard-panel" style={{ ...panelStyle, background: 'linear-gradient(135deg, rgba(0,255,255,0.05) 0%, rgba(0,0,0,0) 100%)' }}>
            <h4 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: '#00ffff' }}>Acciones Rápidas</h4>
            <div style={{ display: 'grid', gap: '10px' }}>
              <button onClick={() => navigate('/admin/music')} style={quickActionButton}>
                <PlusCircle size={18} /> Nueva Carga con IA
              </button>
              <button onClick={() => navigate('/admin/settings')} style={quickActionButton}>
                <Users size={18} /> Gestionar Usuarios
              </button>
            </div>
          </div>

          <div className="dashboard-panel" style={panelStyle}>
            <h4 style={{ margin: '0 0 15px 0', fontSize: '1rem' }}>Estado del Servidor</h4>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={statusRow}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Supabase API</span>
                <span style={systemStatus.supabase === 'online' ? onlineBadge : systemStatus.supabase === 'offline' ? offlineBadge : checkingBadge}>
                  {systemStatus.supabase.toUpperCase()}
                </span>
              </div>
              <div style={statusRow}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Cloudflare R2</span>
                <span style={systemStatus.r2 === 'online' ? onlineBadge : systemStatus.r2 === 'offline' ? offlineBadge : checkingBadge}>
                  {systemStatus.r2.toUpperCase()}
                </span>
              </div>
              <div style={statusRow}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Spotify Proxy</span>
                <span style={systemStatus.worker === 'online' ? onlineBadge : systemStatus.worker === 'offline' ? offlineBadge : checkingBadge}>
                  {systemStatus.worker.toUpperCase()}
                </span>
              </div>
            </div>

            <h4 style={{ margin: '25px 0 15px 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>MOTORES DE METADATOS</h4>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={statusRow}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>iTunes Engine</span>
                <span style={systemStatus.itunes === 'online' ? onlineBadge : systemStatus.itunes === 'offline' ? offlineBadge : checkingBadge}>
                  {systemStatus.itunes.toUpperCase()}
                </span>
              </div>
              <div style={statusRow}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>TheAudioDB (BG)</span>
                <span style={systemStatus.audiodb === 'online' ? onlineBadge : systemStatus.audiodb === 'offline' ? offlineBadge : checkingBadge}>
                  {systemStatus.audiodb.toUpperCase()}
                </span>
              </div>
              <div style={statusRow}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>LRCLIB (Lyrics)</span>
                <span style={systemStatus.lyrics === 'online' ? onlineBadge : systemStatus.lyrics === 'offline' ? offlineBadge : checkingBadge}>
                  {systemStatus.lyrics.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

      <style>{`
        .stat-card-premium:hover {
          transform: translateY(-5px);
          background: rgba(255,255,255,0.05) !important;
        }
        @media (max-width: 1000px) {
          .main-dashboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ESTILOS EN OBJETOS (Para evitar colisiones y asegurar orden)
const wrapperStyle = {
  padding: '10px',
  maxWidth: '100%',
  overflowX: 'hidden'
};

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '20px',
  marginBottom: '30px'
};

const statCardStyle = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '20px',
  padding: '20px',
  display: 'flex',
  alignItems: 'center',
  gap: '15px',
  transition: 'all 0.3s ease'
};

const iconBoxStyle = (color) => ({
  width: '50px',
  height: '50px',
  borderRadius: '14px',
  background: `${color}15`,
  color: color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
});

const statLabelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: '0 0 5px 0' };
const statValueStyle = { margin: 0, fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'baseline', gap: '5px' };
const unitStyle = { fontSize: '0.75rem', fontWeight: 'normal', color: 'rgba(255,255,255,0.3)' };

const progressBarContainer = { width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', marginTop: '10px' };
const progressBarFill = (p) => ({ width: `${p}%`, height: '100%', background: '#f59e0b', borderRadius: '10px', boxShadow: '0 0 10px rgba(245,158,11,0.3)' });

const mainGridStyle = { display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '25px' };

const panelStyle = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '24px',
  padding: '25px'
};

const panelHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };

const activityRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 15px',
  background: 'rgba(255,255,255,0.02)',
  borderRadius: '16px',
  border: '1px solid transparent',
  transition: 'all 0.2s ease'
};

const miniCoverStyle = { width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' };

const textButtonStyle = { background: 'none', border: 'none', color: '#00ffff', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' };

const quickActionButton = {
  width: '100%',
  padding: '14px',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.03)',
  color: 'white',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const statusRow = { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' };
const onlineBadge = { color: '#10b981', fontWeight: 'bold', fontSize: '0.75rem' };
const offlineBadge = { color: '#ef4444', fontWeight: 'bold', fontSize: '0.75rem' };
const checkingBadge = { color: '#f59e0b', fontWeight: 'bold', fontSize: '0.75rem' };

const emptyStateStyle = { textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.2)' };
const actionButtonStyle = {
  marginTop: '15px',
  background: '#00ffff',
  color: 'black',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '10px',
  fontWeight: 'bold',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: '15px auto'
};

const videoBadge = {
  position: 'absolute',
  bottom: '-2px',
  right: '-2px',
  background: '#ff00ff',
  borderRadius: '4px',
  padding: '2px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

// Los estilos ya están definidos arriba en objetos
