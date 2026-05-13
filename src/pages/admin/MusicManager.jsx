import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Music, Image as ImageIcon, Save, X, Loader2, Sparkles, CheckCircle } from 'lucide-react';
import { useMusicAI } from '../../hooks/useMusicAI';
import { useMusicTags } from '../../hooks/useMusicTags';
import { useMusicActions } from '../../hooks/useMusicActions';
import StatusModal from '../../components/admin/StatusModal';
import './Admin.css';

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

const inputStyle = {
  width: '100%',
  padding: '12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: 'white',
  fontSize: '1rem'
};

export default function MusicManager({ onMusicAdded }) {
  const [file, setFile] = useState(null);
  const [metadata, setMetadata] = useState({
    title: '', artist: '', album: '', lyrics: '', background_url: '',
    genre: '', year: '', artist_image: '', composer: '', bpm: '',
    key: '', label: '', language: '', mood: '', duration: 0, animated: false
  });
  const [coverUrl, setCoverUrl] = useState(null);
  const [originalCoverBackup, setOriginalCoverBackup] = useState(null);
  const [backupMetadata, setBackupMetadata] = useState(null);
  const [currentSessionTimestamp] = useState(new Date().getTime());

  // Hooks extraídos
  const { 
    isAISearching, aiSuggestions, alternativeCovers, alternativeFanarts, 
    fetchAIData, fetchAIVisuals, setAiSuggestions, setAlternativeCovers, setAlternativeFanarts 
  } = useMusicAI();

  const { isProcessing, extractMetadata, fetchSyncedLyricsOnly } = useMusicTags();

  const { statusModal, setStatusModal, handleUpload, isUploading } = useMusicActions();

  const spotifyStyle = { ...suggestionBtnStyle, background: 'rgba(30, 215, 96, 0.1)', borderColor: '#1ed760', color: '#1ed760' };
  const itunesStyle = { ...suggestionBtnStyle, background: 'rgba(250, 45, 114, 0.1)', borderColor: '#fa2d72', color: '#fa2d72' };

  const handleCancel = () => {
    setFile(null);
    setMetadata({ 
      title: '', artist: '', album: '', lyrics: '', background_url: '', 
      genre: '', year: '', artist_image: '', duration: 0, animated: false 
    });
    setCoverUrl(null);
    setOriginalCoverBackup(null);
    setAlternativeCovers([]);
    setAlternativeFanarts([]);
    setAiSuggestions(null);
  };

  const onDrop = useCallback(acceptedFiles => {
    const droppedFile = acceptedFiles[0];
    if (!droppedFile) return;

    setFile(droppedFile);
    setCoverUrl(null);

    setTimeout(() => {
      extractMetadata(droppedFile, async (tags, img) => {
        setMetadata(prev => {
          const combined = { ...prev, ...tags };
          setBackupMetadata(combined);
          return combined;
        });
        if (img) {
          setCoverUrl(img);
          setOriginalCoverBackup(img);
          setAlternativeCovers([img]);
        }
        
        if (tags.title) {
          const lyrics = await fetchSyncedLyricsOnly(tags.title, tags.artist);
          if (lyrics) setMetadata(prev => ({ ...prev, lyrics }));
        }
      });
    }, 800);
  }, [extractMetadata, fetchSyncedLyricsOnly, setAlternativeCovers]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] },
    multiple: false
  });

  const [filters] = useState({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });

  const onSave = async () => {
    await handleUpload({
      file,
      metadata,
      coverUrl,
      currentSessionTimestamp,
      onComplete: () => {
        if (onMusicAdded) onMusicAdded();
        setTimeout(() => {
          setStatusModal({ show: false, title: '', steps: [], type: 'loading' });
          handleCancel();
        }, 2500);
      }
    });
  };

  const revertMetadata = () => {
    if (backupMetadata) {
      setMetadata(prev => ({
        ...backupMetadata,
        lyrics: prev.lyrics,
        duration: prev.duration
      }));
      if (originalCoverBackup) setCoverUrl(originalCoverBackup);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', width: '100%' }}>
      {!file && (
        <div {...getRootProps()} className={`upload-zone ${isDragActive ? 'active' : ''}`} style={{ padding: '40px 20px', minHeight: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <input {...getInputProps()} />
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent-color)', boxShadow: '0 0 20px var(--accent-glow)' }}>
            <Sparkles size={40} />
          </div>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>
            {isDragActive ? 'Suelta el MP3 aquí...' : 'Arrastra o haz clic para subir MP3'}
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '400px', margin: '0 auto' }}>
            Escanearemos metadatos, letras sincronizadas y buscaremos el fondo TV ideal.
          </p>
        </div>
      )}

      {(isProcessing || isAISearching) && (
        <div className="admin-loading-overlay">
          <div className="admin-loading-card">
            <Loader2 size={40} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-color)', marginBottom: '20px' }} />
            <h3 style={{ margin: 0 }}>{isProcessing ? 'Analizando MP3...' : 'Sincronizando con IA...'}</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '10px' }}>Extraeremos solo lo necesario para completar tu obra.</p>
          </div>
        </div>
      )}

      {file && !isProcessing && (
        <>
          <div className="dashboard-section" style={{ position: 'relative' }}>
            <button onClick={handleCancel} className="close-btn-generic">
              <X size={18} />
            </button>

            <div className="manager-form-container">
              <div className="manager-cover-preview" style={{ width: '100%', maxWidth: '240px' }}>
                <div className={`premium-cover-container ${metadata.animated ? 'ia-animated' : ''}`}>
                  {coverUrl ? (
                    <>
                      {coverUrl.includes('.mp4') || coverUrl.startsWith('data:video') ? (
                        <video src={coverUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <img src={coverUrl} alt="Carátula" className="animated-cover" style={{ width: '100%', display: 'block', filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) blur(${filters.blur}px)` }} />
                      )}
                      <div className="shine-overlay"></div>
                      {metadata.animated && <div className="sparkle-particles"></div>}
                    </>
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'rgba(255,255,255,0.3)' }}>
                      <ImageIcon size={40} style={{ marginBottom: '10px' }} />
                      <span>Sin Visual</span>
                    </div>
                  )}
                </div>

                {alternativeCovers.length > 1 && (
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '0.65rem', color: 'var(--accent-color)', margin: '0 0 10px 0', fontWeight: 'bold' }}>CAMBIAR PORTADA</p>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
                      {alternativeCovers.map((url, idx) => (
                        <img key={idx} src={url} onClick={() => setCoverUrl(url)} style={{ width: '50px', height: '50px', borderRadius: '6px', cursor: 'pointer', border: coverUrl === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)', opacity: coverUrl === url ? 1 : 0.6 }} />
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={() => setMetadata({ ...metadata, animated: !metadata.animated })} className={`ai-anim-btn ${metadata.animated ? 'active' : ''}`}>
                  <Sparkles size={14} />
                  {metadata.animated ? 'ANIMACIÓN ACTIVA' : 'PROCESAR ANIMACIÓN IA'}
                </button>

                <label className="upload-mini-btn">
                  SUBIR MP4 / LOOP
                  <input type="file" accept="video/mp4" hidden onChange={(e) => {
                    const vidFile = e.target.files[0];
                    if (vidFile) setCoverUrl(URL.createObjectURL(vidFile));
                  }} />
                </label>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
                    <CheckCircle size={20} color="var(--accent-color)" /> Clasificación Inteligente
                  </h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => fetchAIData(metadata.title, metadata.artist)} disabled={isAISearching} className="ai-action-btn">
                      {isAISearching ? <Loader2 size={12} className="spinner" /> : <Sparkles size={12} />}
                      1. BUSCAR DATOS
                    </button>
                    <button onClick={() => fetchAIVisuals(metadata.title, metadata.artist, metadata.year, originalCoverBackup, metadata.album)} disabled={isAISearching} className="ai-action-btn accent">
                      {isAISearching ? <Loader2 size={12} className="spinner" /> : <ImageIcon size={12} />}
                      2. BUSCAR IMÁGENES
                    </button>
                    <button onClick={revertMetadata} className="ai-action-btn danger">REVERTIR</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                  <div>
                    <label className="admin-label">
                      Título
                      <div className="suggestion-box">
                        {aiSuggestions?.spotify?.title && aiSuggestions.spotify.title !== metadata.title && (
                          <button onClick={() => setMetadata({ ...metadata, title: aiSuggestions.spotify.title })} style={spotifyStyle}>SPOTIFY: {aiSuggestions.spotify.title}</button>
                        )}
                        {aiSuggestions?.itunes?.title && aiSuggestions.itunes.title !== metadata.title && (
                          <button onClick={() => setMetadata({ ...metadata, title: aiSuggestions.itunes.title })} style={itunesStyle}>ITUNES: {aiSuggestions.itunes.title}</button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.title || ''} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                  <div>
                    <label className="admin-label">
                      Artista
                      <div className="suggestion-box">
                        {aiSuggestions?.spotify?.artist && aiSuggestions.spotify.artist !== metadata.artist && (
                          <button onClick={() => setMetadata({ ...metadata, artist: aiSuggestions.spotify.artist })} style={spotifyStyle}>SPOTIFY: {aiSuggestions.spotify.artist}</button>
                        )}
                        {aiSuggestions?.itunes?.artist && aiSuggestions.itunes.artist !== metadata.artist && (
                          <button onClick={() => setMetadata({ ...metadata, artist: aiSuggestions.itunes.artist })} style={itunesStyle}>ITUNES: {aiSuggestions.itunes.artist}</button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.artist || ''} onChange={(e) => setMetadata({ ...metadata, artist: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                  <div>
                    <label className="admin-label">
                      Álbum
                      <div className="suggestion-box">
                        {aiSuggestions?.spotify?.album && aiSuggestions.spotify.album !== metadata.album && (
                          <button onClick={() => setMetadata({ ...metadata, album: aiSuggestions.spotify.album })} style={spotifyStyle}>SPOTIFY: {aiSuggestions.spotify.album}</button>
                        )}
                        {aiSuggestions?.itunes?.album && aiSuggestions.itunes.album !== metadata.album && (
                          <button onClick={() => setMetadata({ ...metadata, album: aiSuggestions.itunes.album })} style={itunesStyle}>ITUNES: {aiSuggestions.itunes.album}</button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.album || ''} onChange={(e) => setMetadata({ ...metadata, album: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                  <div>
                    <label className="admin-label">
                      Año
                      {aiSuggestions?.itunes?.year && String(aiSuggestions.itunes.year) !== String(metadata.year) && (
                        <button onClick={() => setMetadata({ ...metadata, year: aiSuggestions.itunes.year })} style={itunesStyle}>ITUNES: {aiSuggestions.itunes.year}</button>
                      )}
                    </label>
                    <input type="text" value={metadata.year || ''} onChange={(e) => setMetadata({ ...metadata, year: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                  <div>
                    <label className="admin-label">
                      Género
                      {aiSuggestions?.itunes?.genre && aiSuggestions.itunes.genre !== metadata.genre && (
                        <button onClick={() => setMetadata({ ...metadata, genre: aiSuggestions.itunes.genre })} style={itunesStyle}>ITUNES: {aiSuggestions.itunes.genre}</button>
                      )}
                    </label>
                    <input type="text" value={metadata.genre || ''} onChange={(e) => setMetadata({ ...metadata, genre: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label className="admin-label">Duración (seg)</label>
                  <input type="text" value={metadata.duration || ''} readOnly className="admin-input" style={{ ...inputStyle, opacity: 0.7 }} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '30px', marginTop: '20px' }}>
            <div>
              <label className="section-label"><Music size={16} /> Letras Sincronizadas</label>
              <textarea value={metadata.lyrics} onChange={(e) => setMetadata({ ...metadata, lyrics: e.target.value })} className="admin-input" style={{ height: '180px', resize: 'none', fontSize: '0.85rem' }} />
            </div>
            <div>
              <label className="section-label"><ImageIcon size={16} /> Fondo TV (Fanart)</label>
              <div className="bg-preview-box">
                {metadata.background_url ? <img src={metadata.background_url} alt="Fanart" /> : <div>Sin fondo seleccionado</div>}
                <label className="upload-overlay-btn">
                  SUBIR FONDO
                  <input type="file" accept="image/*" hidden onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) setMetadata({ ...metadata, background_url: URL.createObjectURL(f) });
                  }} />
                </label>
              </div>

              {alternativeFanarts.length > 0 && (
                <div className="fanart-gallery">
                  {alternativeFanarts.map((url, idx) => (
                    <img key={idx} src={url} onClick={() => setMetadata({ ...metadata, background_url: url })} className={metadata.background_url === url ? 'active' : ''} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '30px' }}>
            <button onClick={onSave} disabled={isUploading || statusModal.type === 'success'} className="main-save-btn">
              {isUploading ? <Loader2 size={24} className="spinner" /> : <Save size={24} />}
              {isUploading ? 'Guardando...' : 'Guardar Obra con IA Visual'}
            </button>
          </div>
        </>
      )}

      <StatusModal statusModal={statusModal} onClose={() => setStatusModal({ ...statusModal, show: false })} />

      <style>{`
        .close-btn-generic { position: absolute; top: 15px; right: 15px; background: rgba(255,255,255,0.05); border: none; color: rgba(255,255,255,0.5); width: 30px; height: 30px; borderRadius: 50%; cursor: pointer; display: flex; alignItems: center; justifyContent: center; zIndex: 10; transition: all 0.3s ease; }
        .close-btn-generic:hover { background: #ff4757; color: white; }
        .ai-anim-btn { width: 100%; padding: 10px; borderRadius: 8px; border: 1px solid #00ffff; background: transparent; color: #00ffff; fontSize: 0.75rem; fontWeight: bold; cursor: pointer; display: flex; alignItems: center; justifyContent: center; gap: 5px; marginBottom: 8px; transition: all 0.2s; }
        .ai-anim-btn.active { background: #00ffff; color: black; }
        .upload-mini-btn { width: 100%; padding: 8px; borderRadius: 8px; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); fontSize: 0.7rem; textAlign: center; cursor: pointer; border: 1px dashed rgba(255,255,255,0.2); display: block; }
        .ai-action-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 6px 12px; borderRadius: 20px; display: flex; alignItems: center; gap: 6px; cursor: pointer; fontSize: 0.65rem; fontWeight: bold; }
        .ai-action-btn.accent { background: rgba(0, 255, 255, 0.1); border: 1px solid var(--accent-color); color: var(--accent-color); }
        .ai-action-btn.danger { background: rgba(255, 71, 87, 0.1); border: 1px solid #ff4757; color: #ff4757; }
        .admin-label { display: block; fontSize: 0.8rem; color: rgba(255,255,255,0.5); marginBottom: 5px; }
        .suggestion-box { display: flex; gap: 5px; marginTop: 4px; }
        .section-label { display: flex; alignItems: center; gap: 8px; fontSize: 0.9rem; color: var(--accent-color); marginBottom: 10px; }
        .bg-preview-box { position: relative; height: 180px; borderRadius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); marginBottom: 15px; }
        .bg-preview-box img { width: 100%; height: 100%; objectFit: cover; }
        .bg-preview-box div { height: 100%; background: rgba(255,255,255,0.02); display: flex; alignItems: center; justifyContent: center; }
        .upload-overlay-btn { position: absolute; bottom: 10px; right: 10px; background: var(--accent-color); color: black; padding: 5px 10px; borderRadius: 4px; fontSize: 0.7rem; fontWeight: bold; cursor: pointer; }
        .fanart-gallery { display: flex; gap: 8px; overflowX: auto; paddingBottom: 10px; }
        .fanart-gallery img { width: 80px; height: 45px; borderRadius: 6px; cursor: pointer; objectFit: cover; border: 1px solid rgba(255,255,255,0.1); opacity: 0.6; }
        .fanart-gallery img.active { border: 2px solid var(--accent-color); opacity: 1; }
        .main-save-btn { width: 100%; background: var(--accent-color); color: black; border: none; padding: 18px; borderRadius: 15px; fontWeight: bold; cursor: pointer; display: flex; justifyContent: center; alignItems: center; gap: 10px; fontSize: 1.1rem; boxShadow: 0 10px 30px var(--accent-glow); transition: all 0.3s; }
        .main-save-btn:disabled { background: #00e676; boxShadow: none; }
        
        .premium-cover-container.ia-animated { border: 2px solid var(--accent-color); boxShadow: 0 0 30px var(--accent-glow); }
        .animated-cover { transition: transform 0.5s ease; }
        .ia-animated .animated-cover { animation: subtle-pulse 4s ease-in-out infinite; }
        .sparkle-particles { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 20px 20px; opacity: 0.3; animation: sparkle-move 10s linear infinite; pointer-events: none; }
        @keyframes sparkle-move { from { background-position: 0 0; } to { background-position: 100% 100%; } }
        .shine-overlay { position: absolute; top: 0; left: -100%; width: 50%; height: 100%; background: linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent); transform: skewX(-25deg); animation: shine 3s infinite; }
        @keyframes shine { 0% { left: -100%; } 20% { left: 150%; } 100% { left: 150%; } }
        @keyframes subtle-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      `}</style>
    </div>
  );
}
