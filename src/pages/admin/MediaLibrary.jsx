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
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Layers,
  Save,
  Sparkles,
  Image as ImageIcon
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
  
  // Estados para Edición Avanzada
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [backupSong, setBackupSong] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [alternativeCovers, setAlternativeCovers] = useState([]);
  const [alternativeFanarts, setAlternativeFanarts] = useState([]);
  const [isAISearching, setIsAISearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [filters, setFilters] = useState({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });

  useEffect(() => {
    fetchSongs();
  }, []);

  const WORKER_URL = 'https://musicfy.canonedu17.workers.dev';

  // FASE 1: Buscar sugerencias de metadatos (Texto)
  const fetchAIData = async (title, artist) => {
    setIsAISearching(true);
    setAiSuggestions(null);
    try {
      const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
      const firstArtist = artist.split(/[&,x\/]|\bfeat\b/i).map(a => a.trim())[0];
      let suggestions = {};

      // iTunes para datos básicos
      const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle + " " + firstArtist)}&entity=song&limit=1`);
      if (itRes.ok) {
        const itData = await itRes.json();
        const r = itData.results[0];
        if (r) {
          suggestions.album = r.collectionName;
          suggestions.year = r.releaseDate ? r.releaseDate.split('-')[0] : null;
          suggestions.genre = r.primaryGenreName;
        }
      }

      // Spotify para datos exactos
      const getSpotifyToken = async () => {
        try {
          const res = await fetch(`${WORKER_URL}/auth`);
          if (!res.ok) return null;
          const d = await res.json();
          return d.access_token;
        } catch (e) { return null; }
      };

      const token = await getSpotifyToken();
      if (token) {
        const q = `track:${cleanTitle} artist:${firstArtist}`;
        const spotRes = await fetch(`${WORKER_URL}/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (spotRes.ok) {
          const d = await spotRes.json();
          const t = d.tracks?.items[0];
          if (t) {
            suggestions.title = t.name;
            suggestions.artist = t.artists.map(a => a.name).join(', ');
            suggestions.album = t.album.name;
          }
        }
      }
      setAiSuggestions(suggestions);
    } catch (e) {
      console.error("Error al buscar datos:", e);
    } finally {
      setIsAISearching(false);
    }
  };

  // FASE 2: Buscar imágenes basadas en la información ACTUAL de los inputs
  const fetchAIVisuals = async (title, artist) => {
    setIsAISearching(true);
    try {
      const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
      const artistsList = artist.split(/[&,x\/]|\bfeat\b/i).map(a => a.trim());
      let foundCovers = [];
      let allFoundFanarts = [];

      // A) Portadas en iTunes (HQ)
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle + " " + artistsList[0])}&entity=song&limit=5`);
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        foundCovers = itunesData.results.map(r => r.artworkUrl100.replace('100x100bb', '1200x1200bb'));
      }

      // B) Fotos de Artista (Spotify + TheAudioDB)
      const getSpotifyToken = async () => {
        try {
          const res = await fetch(`${WORKER_URL}/auth`);
          if (!res.ok) return null;
          const d = await res.json();
          return d.access_token;
        } catch (e) { return null; }
      };

      const token = await getSpotifyToken();
      if (token) {
        const query = `artist:${artistsList[0]}`;
        const spotRes = await fetch(`${WORKER_URL}/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (spotRes.ok) {
          const d = await spotRes.json();
          const art = d.artists?.items[0];
          if (art?.images) allFoundFanarts = [...allFoundFanarts, ...art.images.map(i => i.url)];
        }
      }

      // TheAudioDB Fanarts
      const adbKey = import.meta.env.VITE_THEAUDIODB_API_KEY || '2';
      for (const aName of artistsList) {
        try {
          const res = await fetch(`https://www.theaudiodb.com/api/v1/json/${adbKey}/search.php?s=${encodeURIComponent(aName)}`);
          const data = await res.json();
          if (data.artists?.[0]) {
            const art = data.artists[0];
            for (let i = 1; i <= 10; i++) {
              const key = i === 1 ? 'strArtistFanart' : `strArtistFanart${i}`;
              if (art[key]) allFoundFanarts.push(art[key]);
            }
          }
        } catch (e) {}
      }

      setAlternativeCovers(foundCovers);
      setAlternativeFanarts([...new Set(allFoundFanarts)].filter(u => u));
    } catch (err) {
      console.error("Error al buscar visuales:", err);
    } finally {
      setIsAISearching(false);
    }
  };

  const fetchSongs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error) setSongs(data);
    setLoading(false);
  };

  const openEditModal = (song) => {
    setEditingSong({ ...song });
    setBackupSong({ ...song }); // Guardamos el original
    setCoverUrl(song.cover_url);
    setAlternativeCovers([]);
    setAlternativeFanarts([]);
    setShowEditModal(true);
  };

  const revertMetadata = () => {
    if (!backupSong) return;
    setEditingSong(prev => ({
      ...prev,
      title: backupSong.title,
      artist: backupSong.artist,
      album: backupSong.album,
      year: backupSong.year,
      genre: backupSong.genre
    }));
  };

  // Estados para el Modal de Estado Maestro
  const [statusModal, setStatusModal] = useState({ show: false, title: '', steps: [], type: 'loading' });

  const updateStatusStep = (stepIndex, status) => {
    setStatusModal(prev => {
      const newSteps = [...prev.steps];
      if (newSteps[stepIndex]) newSteps[stepIndex].status = status;
      return { ...prev, steps: newSteps };
    });
  };

  const handleDelete = async () => {
    if (!songToDelete) return;
    setShowDeleteModal(false); // Cerramos el modal de confirmación simple

    const steps = [
      { label: 'Eliminando archivo MP3 (R2)', status: 'pending' },
      { label: 'Eliminando Portada (R2)', status: 'pending' },
      { label: 'Eliminando Fondo TV (R2)', status: 'pending' }
    ];
    setStatusModal({ show: true, title: 'Eliminación Verificada', steps, type: 'loading' });
    
    try {
      const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
      const getKey = (url) => url?.includes(publicUrl) ? url.replace(`${publicUrl}/`, '') : null;

      const mp3Key = getKey(songToDelete.url);
      const coverKey = getKey(songToDelete.cover_url);
      const bgKey = getKey(songToDelete.background_url);

      // 1. MP3
      updateStatusStep(0, 'active');
      if (mp3Key) await deleteFromR2(mp3Key);
      updateStatusStep(0, 'done');

      // 2. Portada
      updateStatusStep(1, 'active');
      if (coverKey) await deleteFromR2(coverKey);
      updateStatusStep(1, 'done');

      // 3. Fondo
      updateStatusStep(2, 'active');
      if (bgKey) await deleteFromR2(bgKey);
      updateStatusStep(2, 'done');

      // 4. Supabase (En segundo plano)
      const { error } = await supabase.from('songs').delete().eq('id', songToDelete.id);
      if (error) throw error;

      setSongs(songs.filter(s => s.id !== songToDelete.id));
      setStatusModal(prev => ({ ...prev, type: 'success' }));
      
      setTimeout(() => {
        setStatusModal({ show: false, title: '', steps: [], type: 'loading' });
        setSongToDelete(null);
      }, 2000);
    } catch (err) {
      console.error("Error al borrar:", err);
      setStatusModal({ show: true, title: 'Error al eliminar', steps: [{ label: err.message, status: 'error' }], type: 'error' });
    }
  };

  const handleUpdate = async () => {
    if (!editingSong) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('songs')
        .update({
          title: editingSong.title,
          artist: editingSong.artist,
          album: editingSong.album,
          genre: editingSong.genre,
          year: editingSong.year,
          lyrics: editingSong.lyrics,
          cover_url: coverUrl,
          background_url: editingSong.background_url
        })
        .eq('id', editingSong.id);

      if (error) throw error;
      
      setSongs(songs.map(s => s.id === editingSong.id ? editingSong : s));
      setShowEditModal(false);
    } catch (err) {
      console.error("Error al actualizar:", err);
      alert("No se pudo actualizar la información.");
    } finally {
      setIsSaving(false);
    }
  };

  // Lógica de Clasificación Jerárquica
  const [currentArtist, setCurrentArtist] = useState(null);
  const [currentAlbum, setCurrentAlbum] = useState(null);

  const getArtists = () => {
    const artists = {};
    songs.forEach(s => {
      const key = s.artist || 'Desconocido';
      if (!artists[key]) artists[key] = 0;
      artists[key]++;
    });
    return artists;
  };

  const getAlbumsByArtist = (artistName) => {
    const albums = {};
    songs.filter(s => s.artist === artistName).forEach(s => {
      const key = s.album || 'Sin Álbum';
      if (!albums[key]) albums[key] = { count: 0, cover: s.cover_url };
      albums[key].count++;
    });
    return albums;
  };

  const getSongsByAlbum = (artistName, albumName) => {
    return songs.filter(s => s.artist === artistName && (s.album === albumName || (!s.album && albumName === 'Sin Álbum')));
  };

  const artists = getArtists();
  const albums = currentArtist ? getAlbumsByArtist(currentArtist) : {};
  const finalSongs = currentAlbum ? getSongsByAlbum(currentArtist, currentAlbum) : [];

  return (
    <div style={{ padding: '10px' }}>
      
      {/* BREADCRUMBS (Migas de pan) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>
        <span 
          onClick={() => { setCurrentArtist(null); setCurrentAlbum(null); }} 
          style={{ cursor: 'pointer', color: !currentArtist ? '#00ffff' : 'inherit' }}
        >
          <Music size={16} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> Mi Biblioteca
        </span>
        {currentArtist && (
          <>
            <ChevronRight size={14} />
            <span 
              onClick={() => setCurrentAlbum(null)} 
              style={{ cursor: 'pointer', color: !currentAlbum ? '#00ffff' : 'inherit' }}
            >
              {currentArtist}
            </span>
          </>
        )}
        {currentAlbum && (
          <>
            <ChevronRight size={14} />
            <span style={{ color: '#00ffff' }}>{currentAlbum}</span>
          </>
        )}
      </div>

      {/* BARRA DE BÚSQUEDA */}
      {!currentArtist && (
        <div style={{ position: 'relative', marginBottom: '30px' }}>
          <Search style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} size={20} />
          <input 
            type="text" 
            placeholder="Buscar artista, canción o disco..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '15px 15px 15px 50px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', outline: 'none'
            }}
          />
        </div>
      )}

      {/* VISTA 1: LISTA DE ARTISTAS */}
      {!currentArtist && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
          {Object.keys(artists).filter(name => name.toLowerCase().includes(search.toLowerCase())).map(name => (
            <div 
              key={name} 
              onClick={() => setCurrentArtist(name)}
              className="folder-card"
              style={folderCardStyle}
            >
              <div style={folderIconBox}>
                <Folder size={40} color="#00ffff" />
                <span style={folderBadge}>{artists[name]}</span>
              </div>
              <h4 style={{ margin: '0', fontSize: '1rem' }}>{name}</h4>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Artista</p>
            </div>
          ))}
        </div>
      )}

      {/* VISTA 2: LISTA DE ÁLBUMES */}
      {currentArtist && !currentAlbum && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
          {Object.keys(albums).map(name => (
            <div 
              key={name} 
              onClick={() => setCurrentAlbum(name)}
              className="folder-card"
              style={folderCardStyle}
            >
              <div style={{ ...folderIconBox, background: 'rgba(255,255,255,0.03)' }}>
                <img src={albums[name].cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', opacity: 0.6 }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={30} color="white" />
                </div>
              </div>
              <h4 style={{ margin: '0', fontSize: '1rem' }}>{name}</h4>
              <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{albums[name].count} canciones</p>
            </div>
          ))}
        </div>
      )}

      {/* VISTA 3: LISTA DE CANCIONES DEL ÁLBUM */}
      {currentAlbum && (
        <div style={{ display: 'grid', gap: '10px' }}>
          {finalSongs.map(song => (
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
                  <button 
                    onClick={() => openEditModal(song)}
                    style={actionBtnStyle} 
                    title="Editar Metadatos"
                  >
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
            {finalSongs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '100px', color: 'rgba(255,255,255,0.2)' }}>
                <Music size={50} style={{ marginBottom: '20px' }} />
                <p>No se encontraron canciones en este álbum.</p>
              </div>
            )}
          </div>
        )}

      {/* ==================================
          MODAL DE EDICIÓN PREMIUM (Glass)
          ================================== */}
      {showEditModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '950px', maxHeight: '85vh', overflowY: 'auto', padding: 0 }}>
            {/* HEADER FIJO */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', position: 'sticky', top: 0, background: 'rgba(20,20,20,0.98)', zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '800', marginRight: '10px' }}>Editor</h3>
                
                {/* BOTÓN FASE 1 */}
                <button 
                  onClick={() => fetchAIData(editingSong.title, editingSong.artist)}
                  disabled={isAISearching}
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.2)',
                    color: 'white', padding: '5px 12px', borderRadius: '20px',
                    display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                    fontSize: '0.65rem', fontWeight: 'bold'
                  }}
                >
                  {isAISearching ? <Loader2 size={12} className="spinner" /> : <Sparkles size={12} />}
                  1. BUSCAR DATOS
                </button>

                {/* BOTÓN FASE 2 */}
                <button 
                  onClick={() => fetchAIVisuals(editingSong.title, editingSong.artist)}
                  disabled={isAISearching}
                  style={{ 
                    background: 'rgba(0, 255, 255, 0.1)', border: '1px solid var(--accent-color)',
                    color: 'var(--accent-color)', padding: '5px 12px', borderRadius: '20px',
                    display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                    fontSize: '0.65rem', fontWeight: 'bold'
                  }}
                >
                  {isAISearching ? <Loader2 size={12} className="spinner" /> : <ImageIcon size={12} />}
                  2. BUSCAR IMÁGENES
                </button>

                <button 
                  onClick={revertMetadata}
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.5)', padding: '5px 12px', borderRadius: '20px',
                    display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                    fontSize: '0.65rem', fontWeight: 'bold'
                  }}
                >
                  REVERTIR
                </button>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
            </div>

            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: '25px' }}>
              {/* COLUMNA IZQUIERDA: VISUALES (MINI) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                
                {/* PORTADA MINI */}
                <div>
                  <label style={{ ...editLabelStyle, fontSize: '0.7rem', marginBottom: '5px' }}><ImageIcon size={10} /> Portada</label>
                  <div style={{ position: 'relative', width: '220px', height: '220px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                    <img src={coverUrl} alt="Portada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                       <label style={{ background: 'var(--accent-color)', color: 'black', padding: '4px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '900', cursor: 'pointer' }}>
                          SUBIR
                          <input type="file" hidden onChange={(e) => {
                            const f = e.target.files[0];
                            if(f) setCoverUrl(URL.createObjectURL(f));
                          }} />
                       </label>
                    </div>
                  </div>
                  {alternativeCovers.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '5px', width: '220px' }}>
                      {alternativeCovers.map((url, idx) => (
                        <img key={idx} src={url} onClick={() => setCoverUrl(url)} style={{ width: '40px', height: '40px', borderRadius: '4px', cursor: 'pointer', objectFit: 'cover', border: coverUrl === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)' }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* FONDO TV MINI */}
                <div>
                  <label style={{ ...editLabelStyle, fontSize: '0.7rem', marginBottom: '5px' }}><ImageIcon size={10} /> Fondo TV</label>
                  <div style={{ position: 'relative', width: '220px', height: '110px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                    <img src={editingSong.background_url} alt="Fondo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                       <label style={{ background: 'var(--accent-color)', color: 'black', padding: '4px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '900', cursor: 'pointer' }}>
                          SUBIR
                          <input type="file" hidden onChange={(e) => {
                            const f = e.target.files[0];
                            if(f) setEditingSong({...editingSong, background_url: URL.createObjectURL(f)});
                          }} />
                       </label>
                    </div>
                  </div>
                  {alternativeFanarts.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '5px', width: '220px' }}>
                      {alternativeFanarts.map((url, idx) => (
                        <img key={idx} src={url} onClick={() => setEditingSong({...editingSong, background_url: url})} style={{ width: '60px', height: '34px', borderRadius: '4px', cursor: 'pointer', objectFit: 'cover', border: editingSong.background_url === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)' }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA: FORMULARIO COMPACTO */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{...editLabelStyle, fontSize: '0.75rem'}}>
                      Título 
                      {aiSuggestions?.title && aiSuggestions.title !== editingSong.title && (
                        <button onClick={() => setEditingSong({...editingSong, title: aiSuggestions.title})} style={suggestionBtnStyle}>
                          Usar: {aiSuggestions.title}
                        </button>
                      )}
                    </label>
                    <input type="text" value={editingSong.title} onChange={e => setEditingSong({...editingSong, title: e.target.value})} style={{...editInputStyle, padding: '8px'}} />
                  </div>
                  <div>
                    <label style={{...editLabelStyle, fontSize: '0.75rem'}}>
                      Artista
                      {aiSuggestions?.artist && aiSuggestions.artist !== editingSong.artist && (
                        <button onClick={() => setEditingSong({...editingSong, artist: aiSuggestions.artist})} style={suggestionBtnStyle}>
                          Usar: {aiSuggestions.artist}
                        </button>
                      )}
                    </label>
                    <input type="text" value={editingSong.artist} onChange={e => setEditingSong({...editingSong, artist: e.target.value})} style={{...editInputStyle, padding: '8px'}} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.4fr', gap: '12px' }}>
                  <div>
                    <label style={{...editLabelStyle, fontSize: '0.75rem'}}>
                      Álbum
                      {aiSuggestions?.album && aiSuggestions.album !== editingSong.album && (
                        <button onClick={() => setEditingSong({...editingSong, album: aiSuggestions.album})} style={suggestionBtnStyle}>
                          Usar: {aiSuggestions.album}
                        </button>
                      )}
                    </label>
                    <input type="text" value={editingSong.album || ''} onChange={e => setEditingSong({...editingSong, album: e.target.value})} style={{...editInputStyle, padding: '8px'}} />
                  </div>
                  <div>
                    <label style={{...editLabelStyle, fontSize: '0.75rem'}}>
                      Año
                      {aiSuggestions?.year && String(aiSuggestions.year) !== String(editingSong.year) && (
                        <button onClick={() => setEditingSong({...editingSong, year: aiSuggestions.year})} style={suggestionBtnStyle}>
                          Usar: {aiSuggestions.year}
                        </button>
                      )}
                    </label>
                    <input type="number" value={editingSong.year || ''} onChange={e => setEditingSong({...editingSong, year: e.target.value})} style={{...editInputStyle, padding: '8px'}} />
                  </div>
                </div>

                <div>
                  <label style={{...editLabelStyle, fontSize: '0.75rem'}}>
                    Género
                    {aiSuggestions?.genre && aiSuggestions.genre !== editingSong.genre && (
                      <button onClick={() => setEditingSong({...editingSong, genre: aiSuggestions.genre})} style={suggestionBtnStyle}>
                        Usar: {aiSuggestions.genre}
                      </button>
                    )}
                  </label>
                  <input type="text" value={editingSong.genre || ''} onChange={e => setEditingSong({...editingSong, genre: e.target.value})} style={{...editInputStyle, padding: '8px'}} />
                </div>

                <div>
                  <label style={{...editLabelStyle, fontSize: '0.75rem'}}>Letras Sincronizadas (LRC)</label>
                  <textarea 
                    value={editingSong.lyrics || ''} 
                    onChange={e => setEditingSong({...editingSong, lyrics: e.target.value})} 
                    style={{ ...editInputStyle, height: '160px', padding: '10px', resize: 'none', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: '1.4' }} 
                  />
                </div>
              </div>
            </div>

            {/* FOOTER FIJO COMPACTO */}
            <div style={{ display: 'flex', gap: '12px', padding: '15px 20px', position: 'sticky', bottom: 0, background: 'rgba(20,20,20,0.98)', borderTop: '1px solid rgba(255,255,255,0.1)', zIndex: 10 }}>
              <button onClick={() => setShowEditModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
              <button 
                onClick={handleUpdate} 
                disabled={isSaving}
                style={{ flex: 2.5, padding: '10px', borderRadius: '8px', background: 'var(--accent-color)', color: 'black', border: 'none', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                {isSaving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                GUARDAR CAMBIOS
              </button>
            </div>
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

      {/* MODAL DE ESTADO MAESTRO */}
      {statusModal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            width: '100%', maxWidth: '400px', background: '#111', borderRadius: '24px',
            padding: '30px', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.8)', textAlign: 'center'
          }}>
            <div style={{ marginBottom: '20px' }}>
              {statusModal.type === 'loading' && <Loader2 size={50} className="spinner" style={{ color: 'var(--accent-color)', margin: '0 auto' }} />}
              {statusModal.type === 'success' && <CheckCircle size={50} style={{ color: '#00e676', margin: '0 auto' }} />}
              {statusModal.type === 'error' && <X size={50} style={{ color: '#ff4757', margin: '0 auto' }} />}
            </div>
            
            <h2 style={{ fontSize: '1.4rem', marginBottom: '25px', color: 'white' }}>{statusModal.title}</h2>
            
            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '15px' }}>
              {statusModal.steps.map((step, i) => (
                <div key={i} style={{ 
                  display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px',
                  opacity: step.status === 'pending' ? 0.3 : 1,
                  transition: 'all 0.3s ease'
                }}>
                  {step.status === 'done' ? <CheckCircle size={16} color="#00e676" /> : 
                   step.status === 'active' ? <Loader2 size={16} className="spinner" color="var(--accent-color)" /> :
                   step.status === 'error' ? <X size={16} color="#ff4757" /> :
                   <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }} />}
                  <span style={{ fontSize: '0.9rem', color: step.status === 'active' ? 'white' : 'rgba(255,255,255,0.7)' }}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {statusModal.type !== 'loading' && (
              <button 
                onClick={() => setStatusModal({ ...statusModal, show: false })}
                style={{ 
                  marginTop: '25px', width: '100%', padding: '12px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                  fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
        .folder-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 35px rgba(0,255,255,0.1);
        }
      `}</style>
    </div>
  );
}

const folderCardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '20px',
  padding: '25px',
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  position: 'relative'
};

const folderIconBox = {
  width: '80px',
  height: '80px',
  margin: '0 auto 15px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative'
};

const folderBadge = {
  position: 'absolute',
  top: '0',
  right: '0',
  background: '#00ffff',
  color: 'black',
  fontSize: '0.7rem',
  fontWeight: '800',
  padding: '2px 8px',
  borderRadius: '10px',
  boxShadow: '0 4px 10px rgba(0,255,255,0.3)'
};

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

const suggestionBtnStyle = {
  background: 'rgba(0, 255, 255, 0.1)',
  border: '1px solid var(--accent-color)',
  color: 'var(--accent-color)',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '0.65rem',
  marginLeft: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.2s ease'
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

const editLabelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  color: 'rgba(255,255,255,0.4)',
  marginBottom: '8px',
  fontWeight: '500'
};

const editInputStyle = {
  width: '100%',
  padding: '12px 15px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  color: 'white',
  fontSize: '0.95rem',
  outline: 'none',
  transition: 'border-color 0.3s'
};
