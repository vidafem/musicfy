import React, { useState, useEffect } from 'react';
import { 
  Search, Trash2, Edit3, Folder, Music, User, X, CheckCircle, 
  AlertTriangle, Loader2, ChevronRight, Layers, Save, Sparkles, 
  Image as ImageIcon 
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useMusicAI } from '../../hooks/useMusicAI';
import { useMusicActions } from '../../hooks/useMusicActions';
import StatusModal from '../../components/admin/StatusModal';
import { fetchFromPiped } from '../../utils/pipedService';

export default function MediaLibrary() {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Estados para Modales
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [songToDelete, setSongToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [backupSong, setBackupSong] = useState(null);
  const [coverUrl, setCoverUrl] = useState('');

  const [videoSuggestions, setVideoSuggestions] = useState([]);
  const [searchingVideo, setSearchingVideo] = useState(false);

  const searchVideoSuggestions = async (title, artist) => {
    if (!title) return;
    setSearchingVideo(true);
    setVideoSuggestions([]);
    try {
      const q = `${title} ${artist || ''} official music video`.trim();
      const data = await fetchFromPiped(`/search?q=${encodeURIComponent(q)}&filter=music_videos`);
      const items = (data.items || []).slice(0, 3).map(item => ({
        id: item.url.split('=')[1] || item.url.split('/').pop(),
        title: item.title,
        uploader: item.uploaderName
      }));
      setVideoSuggestions(items);
    } catch (e) {
      console.error("Error searching video suggestions:", e);
    } finally {
      setSearchingVideo(false);
    }
  };

  // Hooks
  const { 
    isAISearching, aiSuggestions, alternativeCovers, alternativeFanarts,
    fetchAIData, fetchAIVisuals, setAiSuggestions, setAlternativeCovers, setAlternativeFanarts
  } = useMusicAI();

  const { statusModal, setStatusModal, handleDelete, handleUpdate, handleDeleteBulk } = useMusicActions();

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

  const openEditModal = (song) => {
    setEditingSong({ ...song });
    setBackupSong({ ...song });
    setCoverUrl(song.cover_url);
    setAiSuggestions(null);
    setAlternativeCovers([]);
    setAlternativeFanarts([]);
    setVideoSuggestions([]);
    setShowEditModal(true);
  };

  const onUpdate = async () => {
    await handleUpdate({
      song: editingSong,
      metadata: editingSong,
      coverUrl,
      onComplete: () => {
        setSongs(songs.map(s => s.id === editingSong.id ? { ...editingSong, cover_url: coverUrl } : s));
        setShowEditModal(false);
      }
    });
  };

  const onDelete = async () => {
    if (!songToDelete) return;
    setShowDeleteModal(false);
    await handleDelete(songToDelete, () => {
      setSongs(songs.filter(s => s.id !== songToDelete.id));
      setSongToDelete(null);
      setTimeout(() => setStatusModal({ ...statusModal, show: false }), 2000);
    });
  };

  const onDeleteArtist = async () => {
    if (!currentArtist) return;
    const artistSongs = songs.filter(s => getArtistList(s.artist).some(n => n.toLowerCase() === currentArtist.toLowerCase()));
    await handleDeleteBulk(artistSongs, () => {
      setSongs(songs.filter(s => !artistSongs.find(as => as.id === s.id)));
      setCurrentArtist(null);
      setTimeout(() => setStatusModal({ ...statusModal, show: false }), 2000);
    });
  };

  const onDeleteAlbum = async () => {
    if (!currentAlbum || !currentArtist) return;
    const albumSongs = getSongsByAlbum(currentArtist, currentAlbum);
    await handleDeleteBulk(albumSongs, () => {
      setSongs(songs.filter(s => !albumSongs.find(as => as.id === s.id)));
      setCurrentAlbum(null);
      setTimeout(() => setStatusModal({ ...statusModal, show: false }), 2000);
    });
  };

  const revertMetadata = () => {
    if (!backupSong) return;
    setEditingSong({ ...backupSong });
    setCoverUrl(backupSong.cover_url);
  };

  // Lógica de Clasificación Jerárquica Mejorada (Maneja Colaboraciones)
  const [currentArtist, setCurrentArtist] = useState(null);
  const [currentAlbum, setCurrentAlbum] = useState(null);

  const getArtistList = (artistStr) => {
    if (!artistStr) return ['Desconocido'];
    // Separadores comunes en música: ft., feat., x, &, /, con o sin espacios
    const separators = /[\s,x&/]+ft\.?|[\s,x&/]+feat\.?|[\s,x&/]+x[\s,x&/]+|[,&/]/i;
    return artistStr.split(separators).map(a => a.trim()).filter(Boolean);
  };

  const getArtists = () => {
    const artists = {};
    songs.forEach(s => {
      const names = getArtistList(s.artist);
      names.forEach(name => {
        if (!artists[name]) artists[name] = 0;
        artists[name]++;
      });
    });
    return artists;
  };

  const getAlbumsByArtist = (artistName) => {
    const albums = {};
    songs.filter(s => {
      const names = getArtistList(s.artist);
      return names.some(n => n.toLowerCase() === artistName.toLowerCase());
    }).forEach(s => {
      const key = s.album || 'Sin Álbum';
      if (!albums[key]) albums[key] = { count: 0, cover: s.cover_url };
      albums[key].count++;
    });
    return albums;
  };

  const getSongsByAlbum = (artistName, albumName) => {
    return songs.filter(s => {
      const names = getArtistList(s.artist);
      const isCorrectArtist = names.some(n => n.toLowerCase() === artistName.toLowerCase());
      const isCorrectAlbum = (s.album === albumName || (!s.album && albumName === 'Sin Álbum'));
      return isCorrectArtist && isCorrectAlbum;
    });
  };

  const artists = getArtists();
  const albums = currentArtist ? getAlbumsByArtist(currentArtist) : {};
  const finalSongs = currentAlbum ? getSongsByAlbum(currentArtist, currentAlbum) : [];

  const suggestionBtnStyle = { background: 'rgba(0, 255, 255, 0.1)', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' };
  const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
  const modalContentStyle = { background: '#111', width: '90%', maxWidth: '500px', borderRadius: '24px', padding: '30px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'white' };
  const songCardStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)' };
  const actionBtnStyle = { background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '10px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s' };
  const editLabelStyle = { display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' };
  const editInputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none' };

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>
        <span onClick={() => { setCurrentArtist(null); setCurrentAlbum(null); }} style={{ cursor: 'pointer', color: !currentArtist ? '#00ffff' : 'inherit' }}>
          <Music size={16} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> Mi Biblioteca
        </span>
        {currentArtist && (
          <><ChevronRight size={14} /><span onClick={() => setCurrentAlbum(null)} style={{ cursor: 'pointer', color: !currentAlbum ? '#00ffff' : 'inherit' }}>{currentArtist}</span></>
        )}
        {currentAlbum && (
          <><ChevronRight size={14} /><span style={{ color: '#00ffff' }}>{currentAlbum}</span></>
        )}
        <div style={{ flex: 1 }} />
        {currentAlbum ? (
          <button onClick={onDeleteAlbum} className="ai-action-btn danger" style={{ padding: '5px 15px' }}>
            <Trash2 size={14} /> ELIMINAR ÁLBUM COMPLETO
          </button>
        ) : currentArtist ? (
          <button onClick={onDeleteArtist} className="ai-action-btn danger" style={{ padding: '5px 15px' }}>
            <Trash2 size={14} /> ELIMINAR CARPETA ARTISTA
          </button>
        ) : null}
      </div>

      {!currentArtist && (
        <>
          <div style={{ position: 'relative', marginBottom: '30px' }}>
            <Search style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} size={20} />
            <input type="text" placeholder="Buscar artista, canción o disco..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '15px 15px 15px 50px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', outline: 'none' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
            {Object.keys(artists).filter(name => name.toLowerCase().includes(search.toLowerCase())).map(name => (
              <div key={name} className="folder-card" style={{ ...folderCardStyle, position: 'relative' }}>
                <div onClick={() => setCurrentArtist(name)} style={{ width: '100%', height: '100%' }}>
                  <div style={folderIconBox}><Folder size={40} color="#00ffff" /><span style={folderBadge}>{artists[name]}</span></div>
                  <h4 style={{ margin: '0', fontSize: '1rem' }}>{name}</h4>
                  <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Artista</p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setCurrentArtist(name); onDeleteArtist(); }} 
                  className="mini-delete-btn"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {currentArtist && !currentAlbum && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
          {Object.keys(albums).map(name => (
            <div key={name} className="folder-card" style={{ ...folderCardStyle, position: 'relative' }}>
              <div onClick={() => setCurrentAlbum(name)} style={{ width: '100%', height: '100%' }}>
                <div style={{ ...folderIconBox, background: 'rgba(255,255,255,0.03)' }}>
                  <img src={albums[name].cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', opacity: 0.6 }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Layers size={30} color="white" /></div>
                </div>
                <h4 style={{ margin: '0', fontSize: '1rem' }}>{name}</h4>
                <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{albums[name].count} canciones</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setCurrentAlbum(name); onDeleteAlbum(); }} 
                className="mini-delete-btn"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {currentAlbum && (
        <div style={{ display: 'grid', gap: '10px' }}>
          {finalSongs.map(song => (
            <div key={song.id} style={songCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ position: 'relative' }}>
                  <img src={song.cover_url} alt="" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: -5, right: -5, background: '#00ffff', borderRadius: '50%', padding: '3px' }}><Music size={10} color="black" /></div>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{song.title}</h4>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>{song.artist} • <span style={{ color: '#00ffff' }}>{song.genre}</span> • {song.year}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => openEditModal(song)} style={actionBtnStyle} title="Editar Metadatos"><Edit3 size={18} /></button>
                <button onClick={() => { setSongToDelete(song); setShowDeleteModal(true); }} style={{ ...actionBtnStyle, color: '#ff4444', background: 'rgba(255,68,68,0.1)' }}><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '950px', maxHeight: '85vh', overflowY: 'auto', padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', position: 'sticky', top: 0, background: 'rgba(20,20,20,0.98)', zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '800', marginRight: '10px' }}>Editor</h3>
                <button onClick={() => fetchAIData(editingSong.title, editingSong.artist)} disabled={isAISearching} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}>
                  {isAISearching ? <Loader2 size={12} className="spinner" /> : <Sparkles size={12} />} 1. BUSCAR DATOS
                </button>
                <button onClick={() => fetchAIVisuals(editingSong.title, editingSong.artist, editingSong.year, backupSong.cover_url, editingSong.album)} disabled={isAISearching} style={{ background: 'rgba(0, 255, 255, 0.1)', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}>
                  {isAISearching ? <Loader2 size={12} className="spinner" /> : <ImageIcon size={12} />} 2. BUSCAR IMÁGENES
                </button>
                <button onClick={revertMetadata} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}>REVERTIR</button>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
            </div>
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: '25px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ ...editLabelStyle, fontSize: '0.7rem' }}><ImageIcon size={10} /> Portada</label>
                  <div style={{ position: 'relative', width: '220px', height: '220px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                    <img src={coverUrl} alt="Portada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <label style={{ position: 'absolute', bottom: 8, right: 8, background: 'var(--accent-color)', color: 'black', padding: '4px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '900', cursor: 'pointer' }}>SUBIR<input type="file" hidden onChange={(e) => { const f = e.target.files[0]; if(f) setCoverUrl(URL.createObjectURL(f)); }} /></label>
                  </div>
                  {alternativeCovers.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '5px', width: '220px' }}>
                      {alternativeCovers.map((url, idx) => (<img key={idx} src={url} onClick={() => setCoverUrl(url)} style={{ width: '40px', height: '40px', borderRadius: '4px', cursor: 'pointer', objectFit: 'cover', border: coverUrl === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)' }} />))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ ...editLabelStyle, fontSize: '0.7rem' }}><ImageIcon size={10} /> Fondo TV</label>
                  <div style={{ position: 'relative', width: '220px', height: '110px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                    <img src={editingSong.background_url} alt="Fondo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <label style={{ position: 'absolute', bottom: 8, right: 8, background: 'var(--accent-color)', color: 'black', padding: '4px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '900', cursor: 'pointer' }}>SUBIR<input type="file" hidden onChange={(e) => { const f = e.target.files[0]; if(f) setEditingSong({...editingSong, background_url: URL.createObjectURL(f)}); }} /></label>
                  </div>
                  {alternativeFanarts.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '5px', width: '220px' }}>
                      {alternativeFanarts.map((url, idx) => (<img key={idx} src={url} onClick={() => setEditingSong({...editingSong, background_url: url})} style={{ width: '60px', height: '34px', borderRadius: '4px', cursor: 'pointer', objectFit: 'cover', border: editingSong.background_url === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)' }} />))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label style={{...editLabelStyle, fontSize: '0.75rem'}}>Título {aiSuggestions?.spotify?.title && <button onClick={() => setEditingSong({...editingSong, title: aiSuggestions.spotify.title})} style={suggestionBtnStyle}>IA: {aiSuggestions.spotify.title}</button>}</label><input type="text" value={editingSong.title} onChange={e => setEditingSong({...editingSong, title: e.target.value})} style={{...editInputStyle, padding: '8px'}} /></div>
                  <div><label style={{...editLabelStyle, fontSize: '0.75rem'}}>Artista {aiSuggestions?.spotify?.artist && <button onClick={() => setEditingSong({...editingSong, artist: aiSuggestions.spotify.artist})} style={suggestionBtnStyle}>IA: {aiSuggestions.spotify.artist}</button>}</label><input type="text" value={editingSong.artist} onChange={e => setEditingSong({...editingSong, artist: e.target.value})} style={{...editInputStyle, padding: '8px'}} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.4fr', gap: '12px' }}>
                  <div><label style={{...editLabelStyle, fontSize: '0.75rem'}}>Álbum {aiSuggestions?.spotify?.album && <button onClick={() => setEditingSong({...editingSong, album: aiSuggestions.spotify.album})} style={suggestionBtnStyle}>IA: {aiSuggestions.spotify.album}</button>}</label><input type="text" value={editingSong.album || ''} onChange={e => setEditingSong({...editingSong, album: e.target.value})} style={{...editInputStyle, padding: '8px'}} /></div>
                  <div><label style={{...editLabelStyle, fontSize: '0.75rem'}}>Año</label><input type="number" value={editingSong.year || ''} onChange={e => setEditingSong({...editingSong, year: e.target.value})} style={{...editInputStyle, padding: '8px'}} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label style={{...editLabelStyle, fontSize: '0.75rem'}}>Género</label><input type="text" value={editingSong.genre || ''} onChange={e => setEditingSong({...editingSong, genre: e.target.value})} style={{...editInputStyle, padding: '8px'}} /></div>
                  <div>
                    <label style={{...editLabelStyle, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Enlace de Video (YouTube/MP4)</span>
                      <button
                        type="button"
                        onClick={() => searchVideoSuggestions(editingSong.title, editingSong.artist)}
                        disabled={searchingVideo || !editingSong.title}
                        className="ai-action-btn"
                        style={{ padding: '2px 8px', fontSize: '0.65rem', border: '1px solid var(--accent-color)', height: '20px' }}
                      >
                        {searchingVideo ? <Loader2 size={10} className="spinner" /> : <Sparkles size={10} />}
                        BUSCAR VIDEO IA
                      </button>
                    </label>
                    <input type="text" value={editingSong.video_url || ''} onChange={e => setEditingSong({...editingSong, video_url: e.target.value})} style={{...editInputStyle, padding: '8px'}} placeholder="Ej: https://www.youtube.com/watch?v=..." />
                    
                    {videoSuggestions.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'grid', gap: '5px', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', width: '100%' }}>
                        <p style={{ fontSize: '0.65rem', color: 'var(--accent-color)', margin: '0 0 5px 0', fontWeight: 'bold' }}>SUGERENCIAS ENCONTRADAS:</p>
                        {videoSuggestions.map(vid => (
                          <button
                            key={vid.id}
                            type="button"
                            onClick={() => {
                              setEditingSong({ ...editingSong, video_url: `https://www.youtube.com/watch?v=${vid.id}` });
                              setVideoSuggestions([]);
                            }}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: 'white', textAlign: 'left', cursor: 'pointer', fontSize: '0.72rem', display: 'block', width: '100%', transition: 'all 0.2s' }}
                          >
                            <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>[Elegir]</span> {vid.title} - <span style={{ opacity: 0.6 }}>{vid.uploader}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div><label style={{...editLabelStyle, fontSize: '0.75rem'}}>Letras Sincronizadas (LRC)</label><textarea value={editingSong.lyrics || ''} onChange={e => setEditingSong({...editingSong, lyrics: e.target.value})} style={{ ...editInputStyle, height: '160px', padding: '10px', resize: 'none', fontFamily: 'monospace', fontSize: '0.75rem' }} /></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', padding: '15px 20px', position: 'sticky', bottom: 0, background: 'rgba(20,20,20,0.98)', borderTop: '1px solid rgba(255,255,255,0.1)', zIndex: 10 }}>
              <button onClick={() => setShowEditModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={onUpdate} style={{ flex: 2.5, padding: '10px', borderRadius: '8px', background: 'var(--accent-color)', color: 'black', border: 'none', fontWeight: '900', cursor: 'pointer' }}><Save size={16} /> GUARDAR CAMBIOS</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ background: 'rgba(255,68,68,0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><AlertTriangle size={30} color="#ff4444" /></div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>¿Eliminar Canción?</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '25px' }}>Estás a punto de borrar <strong>"{songToDelete?.title}"</strong> de forma permanente.</p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => setShowDeleteModal(false)} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'white' }}>Cancelar</button>
              <button onClick={onDelete} style={{ flex: 1, padding: '15px', borderRadius: '12px', background: '#ff4444', color: 'white', fontWeight: 'bold' }}><Trash2 size={20} /> Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <StatusModal statusModal={statusModal} onClose={() => setStatusModal({ ...statusModal, show: false })} />

      <style>{`
        .folder-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); borderRadius: 20px; padding: 25px; cursor: pointer; textAlign: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
        .folder-card:hover { transform: translateY(-5px); box-shadow: 0 15px 35px rgba(0,255,255,0.1); }
        .folder-icon-box { width: 80px; height: 80px; margin: 0 auto 15px; display: flex; alignItems: center; justifyContent: center; position: relative; }
        .folder-badge { position: absolute; top: 0; right: 0; background: #00ffff; color: black; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
        .mini-delete-btn { position: absolute; top: 15px; right: 15px; width: 32px; height: 32px; border-radius: 50%; background: rgba(255,68,68,0.1); border: 1px solid rgba(255,68,68,0.2); color: #ff4444; display: flex; alignItems: center; justifyContent: center; cursor: pointer; transition: all 0.2s; opacity: 0; }
        .folder-card:hover .mini-delete-btn { opacity: 1; }
        .mini-delete-btn:hover { background: #ff4444; color: white; transform: scale(1.1); }
      `}</style>
    </div>
  );
}

const folderCardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '25px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative' };
const folderIconBox = { width: '80px', height: '80px', margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' };
const folderBadge = { position: 'absolute', top: '0', right: '0', background: '#00ffff', color: 'black', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px' };
