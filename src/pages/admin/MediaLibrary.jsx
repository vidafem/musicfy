import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Trash2, 
  Edit3, 
  Folder, 
  Filter, 
  Music, 
  Calendar, 
  User, 
  X, 
  AlertTriangle,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { deleteFromR2 } from '../../lib/cloudflareR2';

export default function MediaLibrary() {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, genre, year, artist
  const [selectedFolder, setSelectedFolder] = useState(null);
  
  // Estados para el Modal de Borrado
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [songToDelete, setSongToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error) setSongs(data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!songToDelete) return;
    setIsDeleting(true);
    
    try {
      const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
      
      // 1. Borrar de R2 (Audio)
      const audioKey = songToDelete.url.replace(`${publicUrl}/`, '');
      await deleteFromR2(audioKey);
      
      // 2. Borrar de R2 (Cover) si está en nuestro R2
      if (songToDelete.cover_url && songToDelete.cover_url.includes(publicUrl)) {
        const coverKey = songToDelete.cover_url.replace(`${publicUrl}/`, '');
        await deleteFromR2(coverKey);
      }

      // 3. Borrar de Supabase
      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', songToDelete.id);

      if (error) throw error;

      setSongs(songs.filter(s => s.id !== songToDelete.id));
      setShowDeleteModal(false);
      setSongToDelete(null);
    } catch (err) {
      console.error("Error al borrar:", err);
      alert("Error al borrar la canción y sus archivos asociados.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Lógica de Clasificación por "Carpetas"
  const getFolders = () => {
    const folders = {};
    songs.forEach(song => {
      let key = 'Sin Clasificar';
      if (filterType === 'genre') key = song.genre || 'Desconocido';
      if (filterType === 'year') key = song.year || 'Antiguas';
      if (filterType === 'artist') key = song.artist || 'Varios';
      
      if (!folders[key]) folders[key] = [];
      folders[key].push(song);
    });
    return folders;
  };

  const folders = getFolders();
  const filteredSongs = selectedFolder 
    ? folders[selectedFolder].filter(s => 
        s.title.toLowerCase().includes(search.toLowerCase()) || 
        s.artist.toLowerCase().includes(search.toLowerCase())
      )
    : songs.filter(s => 
        s.title.toLowerCase().includes(search.toLowerCase()) || 
        s.artist.toLowerCase().includes(search.toLowerCase())
      );

  return (
    <div style={{ padding: '10px' }}>
      
      {/* BARRA DE HERRAMIENTAS SUPERIOR */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} size={20} />
          <input 
            type="text" 
            placeholder="Buscar por título, artista o género..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '15px 15px 15px 50px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: 'white',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '5px' }}>
          <button 
            onClick={() => { setFilterType('all'); setSelectedFolder(null); }}
            style={{ ...filterBtnStyle, background: filterType === 'all' ? 'rgba(0,255,255,0.2)' : 'transparent', color: filterType === 'all' ? '#00ffff' : 'white' }}
          >
            <Music size={18} /> Todo
          </button>
          <button 
            onClick={() => { setFilterType('genre'); setSelectedFolder(null); }}
            style={{ ...filterBtnStyle, background: filterType === 'genre' ? 'rgba(0,255,255,0.2)' : 'transparent', color: filterType === 'genre' ? '#00ffff' : 'white' }}
          >
            <Filter size={18} /> Géneros
          </button>
          <button 
            onClick={() => { setFilterType('year'); setSelectedFolder(null); }}
            style={{ ...filterBtnStyle, background: filterType === 'year' ? 'rgba(0,255,255,0.2)' : 'transparent', color: filterType === 'year' ? '#00ffff' : 'white' }}
          >
            <Calendar size={18} /> Años
          </button>
          <button 
            onClick={() => { setFilterType('artist'); setSelectedFolder(null); }}
            style={{ ...filterBtnStyle, background: filterType === 'artist' ? 'rgba(0,255,255,0.2)' : 'transparent', color: filterType === 'artist' ? '#00ffff' : 'white' }}
          >
            <User size={18} /> Artistas
          </button>
        </div>
      </div>

      {/* VISTA DE CARPETAS (Si hay filtro activo) */}
      {filterType !== 'all' && !selectedFolder && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          {Object.keys(folders).map(key => (
            <div 
              key={key} 
              onClick={() => setSelectedFolder(key)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '16px',
                padding: '25px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(0,255,255,0.05)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <Folder size={50} color="#00ffff" style={{ marginBottom: '15px' }} />
              <h4 style={{ margin: '0 0 5px 0' }}>{key}</h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{folders[key].length} Canciones</p>
            </div>
          ))}
        </div>
      )}

      {/* LISTA DE CANCIONES (O contenido de carpeta) */}
      {(filterType === 'all' || selectedFolder) && (
        <div>
          {selectedFolder && (
            <button 
              onClick={() => setSelectedFolder(null)}
              style={{ background: 'none', border: 'none', color: '#00ffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '20px' }}
            >
              <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} /> Volver a Carpetas
            </button>
          )}

          <div style={{ display: 'grid', gap: '15px' }}>
            {filteredSongs.map(song => (
              <div key={song.id} style={songCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={song.cover_url} alt="" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: -5, right: -5, background: '#00ffff', borderRadius: '50%', padding: '3px' }}>
                      <Music size={10} color="black" />
                    </div>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{song.title}</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>
                      {song.artist} • <span style={{ color: '#00ffff' }}>{song.genre}</span> • {song.year}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button style={actionBtnStyle} title="Editar (Próximamente)">
                    <Edit3 size={18} />
                  </button>
                  <button 
                    onClick={() => { setSongToDelete(song); setShowDeleteModal(true); }}
                    style={{ ...actionBtnStyle, color: '#ff4444', background: 'rgba(255,68,68,0.1)' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            
            {filteredSongs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '100px', color: 'rgba(255,255,255,0.2)' }}>
                <Music size={50} style={{ marginBottom: '20px' }} />
                <p>No se encontraron canciones que coincidan.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================
          MODAL DE BORRADO PREMIUM (Glass)
          ================================== */}
      {showDeleteModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ background: 'rgba(255,68,68,0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <AlertTriangle size={30} color="#ff4444" />
            </div>
            
            <h3 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>¿Eliminar Canción?</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '25px', lineHeight: '1.6' }}>
              Estás a punto de borrar <strong>"{songToDelete?.title}"</strong> de forma permanente.<br/>
              Esta acción eliminará el audio de Cloudflare R2 y los datos de Supabase.
            </p>

            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                style={{ flex: 1, padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'white', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleDelete}
                disabled={isDeleting}
                style={{ 
                  flex: 1, padding: '15px', borderRadius: '12px', border: 'none', 
                  background: '#ff4444', color: 'white', fontWeight: 'bold', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                {isDeleting ? <Loader2 size={20} className="spinner" /> : <Trash2 size={20} />}
                {isDeleting ? 'Borrando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

const filterBtnStyle = {
  border: 'none',
  padding: '10px 20px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.9rem',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const songCardStyle = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '16px',
  padding: '15px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  transition: 'transform 0.2s ease'
};

const actionBtnStyle = {
  width: '45px',
  height: '45px',
  borderRadius: '10px',
  border: 'none',
  background: 'rgba(255,255,255,0.05)',
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.8)',
  backdropFilter: 'blur(10px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px'
};

const modalContentStyle = {
  background: 'rgba(30,30,30,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '24px',
  padding: '40px',
  maxWidth: '500px',
  width: '100%',
  textAlign: 'center',
  boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
};
