import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Play, 
  TrendingUp, 
  Newspaper, 
  Music, 
  Clock, 
  ExternalLink,
  Activity
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalSongs: 0,
    onlineUsers: 0,
    topSongs: []
  });

  const [news, setNews] = useState([
    { id: 1, title: 'Billie Eilish lanza nuevo álbum visual', source: 'Billboard', time: 'hace 2h' },
    { id: 2, title: 'Tendencias: El retorno del Synthwave en 2024', source: 'Rolling Stone', time: 'hace 5h' },
    { id: 3, title: 'Nueva colaboración entre Bizarrap y artista sorpresa', source: 'MusicRadar', time: 'hace 8h' }
  ]);

  useEffect(() => {
    fetchStats();
    // Suscripción Realtime (Opcional si tienes configurado Presence)
  }, []);

  const fetchStats = async () => {
    // 1. Obtener total de canciones
    const { count } = await supabase.from('songs').select('*', { count: 'exact', head: true });
    
    // 2. Obtener canciones más escuchadas (requiere columna play_count)
    const { data: topSongs } = await supabase
      .from('songs')
      .select('title, artist, cover_url, play_count')
      .order('play_count', { ascending: false })
      .limit(5);

    setStats({
      totalSongs: count || 0,
      onlineUsers: Math.floor(Math.random() * 10) + 1, // Mock por ahora
      topSongs: topSongs || []
    });
  };

  return (
    <div style={{ padding: '10px' }}>
      
      {/* TARJETAS DE RESUMEN */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={labelStyle}>Usuarios Escuchando</p>
              <h3 style={valueStyle}>{stats.onlineUsers}</h3>
            </div>
            <div style={{ ...iconBoxStyle, background: 'rgba(0,255,150,0.1)', color: '#00ff96' }}>
              <Users size={24} />
            </div>
          </div>
          <p style={{ color: '#00ff96', fontSize: '0.8rem', margin: '10px 0 0 0' }}>● En vivo ahora</p>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={labelStyle}>Total Biblioteca</p>
              <h3 style={valueStyle}>{stats.totalSongs}</h3>
            </div>
            <div style={{ ...iconBoxStyle, background: 'rgba(0,255,255,0.1)', color: '#00ffff' }}>
              <Music size={24} />
            </div>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: '10px 0 0 0' }}>Canciones procesadas con IA</p>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={labelStyle}>Actividad Hoy</p>
              <h3 style={valueStyle}>+245</h3>
            </div>
            <div style={{ ...iconBoxStyle, background: 'rgba(255,200,0,0.1)', color: '#ffc800' }}>
              <TrendingUp size={24} />
            </div>
          </div>
          <p style={{ color: '#ffc800', fontSize: '0.8rem', margin: '10px 0 0 0' }}>↑ 12% más que ayer</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
        
        {/* SECCIÓN: MÁS ESCUCHADAS */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Activity size={20} color="#00ffff" />
            <h3 style={{ margin: 0 }}>Ranking de Reproducciones</h3>
          </div>
          
          <div style={{ display: 'grid', gap: '10px' }}>
            {stats.topSongs.map((song, i) => (
              <div key={i} style={rankItemStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.1)', width: '25px' }}>{i+1}</span>
                  <img src={song.cover_url} alt="" style={{ width: '45px', height: '45px', borderRadius: '6px' }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>{song.title}</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{song.artist}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold' }}>{song.play_count || 0}</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>plays</div>
                </div>
              </div>
            ))}
            {stats.topSongs.length === 0 && <p style={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '20px' }}>No hay datos suficientes todavía.</p>}
          </div>
        </div>

        {/* SECCIÓN: RADAR DE NOTICIAS */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Newspaper size={20} color="#ff00ff" />
            <h3 style={{ margin: 0 }}>Radar Musical</h3>
          </div>
          
          <div style={{ display: 'grid', gap: '20px' }}>
            {news.map(item => (
              <div key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', pb: '15px', paddingBottom: '15px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', lineHeight: '1.4' }}>{item.title}</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                  <span>{item.source}</span>
                  <span>{item.time}</span>
                </div>
              </div>
            ))}
            <button style={{ 
              background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', 
              padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' 
            }}>
              Ver más noticias
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '20px',
  padding: '25px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
};

const labelStyle = { color: 'rgba(255,255,255,0.5)', margin: '0 0 5px 0', fontSize: '0.9rem' };
const valueStyle = { margin: 0, fontSize: '2.2rem', fontWeight: 800 };
const iconBoxStyle = { width: '50px', height: '50px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' };

const sectionStyle = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '24px',
  padding: '30px'
};

const rankItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px',
  borderRadius: '12px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid transparent',
  transition: 'all 0.3s ease'
};
