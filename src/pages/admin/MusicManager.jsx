import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Music, Image as ImageIcon, Save, X, Loader2, Sparkles, CheckCircle, Trash2 } from 'lucide-react';
import * as jsmediatags from 'jsmediatags';
import { uploadToR2, deleteFromR2 } from '../../lib/cloudflareR2';
import { supabase } from '../../supabaseClient';

export default function MusicManager() {
  const [file, setFile] = useState(null);
  const [songs, setSongs] = useState([]);
  const [metadata, setMetadata] = useState({ 
    title: '', 
    artist: '', 
    album: '', 
    lyrics: '', 
    background_url: '',
    genre: '',
    year: '',
    artist_image: ''
  });
  const [coverUrl, setCoverUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAISearching, setIsAISearching] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const fetchSongs = useCallback(async () => {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setSongs(data);
    }
  }, []);

  React.useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  const handleDelete = async (song) => {
    if (!window.confirm(`¿Estás seguro de borrar "${song.title}"? Esta acción eliminará los archivos de Cloudflare y los datos de Supabase permanentemente.`)) return;

    try {
      // 1. Extraer llaves de R2
      const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
      const mp3Key = song.url.replace(`${publicUrl}/`, '');
      
      // 2. Borrar de Cloudflare
      await deleteFromR2(mp3Key);
      if (song.cover_url && song.cover_url.includes(publicUrl)) {
        await deleteFromR2(song.cover_url.replace(`${publicUrl}/`, ''));
      }

      // 3. Borrar de Supabase
      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', song.id);

      if (error) throw error;
      
      fetchSongs();
    } catch (error) {
      console.error("Error al eliminar:", error);
      alert("Error al eliminar los archivos.");
    }
  };

  const fetchAIMetadata = async (title, artist) => {
    setIsAISearching(true);
    const cleanArtist = artist.replace(/\s*-\s*Topic/i, '').trim();
    const cleanTitle = title.trim();
    
    let newMeta = { ...metadata, title: cleanTitle, artist: cleanArtist };
    
    try {
      // 1. ITUNES API (Para Portadas de Alta Calidad - Reemplaza a Spotify y es libre)
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}&entity=song&limit=1`);
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results?.length > 0) {
          const track = itunesData.results[0];
          // Convertimos la imagen de 100x100 a 600x600 para alta calidad
          const highResCover = track.artworkUrl100.replace('100x100bb', '600x600bb');
          setCoverUrl(highResCover);
          newMeta.album = track.collectionName;
          newMeta.year = track.releaseDate.split('-')[0];
        }
      }

      // 2. MUSICBRAINZ (Respaldo para Año y Álbum)
      if (!newMeta.year || !newMeta.album) {
        const mbRes = await fetch(`https://musicbrainz.org/ws/2/recording/?query=recording:${encodeURIComponent(cleanTitle)}%20AND%20artist:${encodeURIComponent(cleanArtist)}&fmt=json`);
        if (mbRes.ok) {
          const mbData = await mbRes.json();
          if (mbData.recordings?.length > 0) {
            const rec = mbData.recordings[0];
            newMeta.album = newMeta.album || rec['releases']?.[0]?.title || '';
            newMeta.year = newMeta.year || rec['releases']?.[0]?.date?.split('-')[0] || '';
          }
        }
      }

      // 3. THEAUDIODB (Fondos HD y Género)
      const adbKey = import.meta.env.VITE_THEAUDIODB_API_KEY || '2';
      const adbRes = await fetch(`https://www.theaudiodb.com/api/v1/json/${adbKey}/search.php?s=${encodeURIComponent(newMeta.artist)}`);
      if (adbRes.ok) {
        const adbData = await adbRes.json();
        if (adbData.artists?.length > 0) {
          const art = adbData.artists[0];
          newMeta.genre = art.strGenre || newMeta.genre;
          newMeta.background_url = art.strArtistFanart || art.strArtistWideThumb || '';
        }
      }

      // 4. LRCLIB (Letras)
      const lrcRes = await fetch(`https://lrclib.net/api/search?artist_name=${encodeURIComponent(newMeta.artist)}&track_name=${encodeURIComponent(newMeta.title)}`);
      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        if (lrcData.length > 0) {
          newMeta.lyrics = lrcData[0].syncedLyrics || lrcData[0].plainLyrics || '';
        }
      }

      setMetadata(newMeta);
    } catch (err) {
      console.error("Error en pipeline IA:", err);
    } finally {
      setIsAISearching(false);
    }
  };

  const extractMetadata = (file) => {
    jsmediatags.read(file, {
      onSuccess: function(tag) {
        const { title, artist, album, picture } = tag.tags;
        
        let imageUrl = null;
        if (picture) {
          const { data, format } = picture;
          let base64String = "";
          for (let i = 0; i < data.length; i++) {
            base64String += String.fromCharCode(data[i]);
          }
          imageUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }

        const detectedTitle = title || file.name.replace(/\.[^/.]+$/, "");
        const detectedArtist = artist || 'Artista Desconocido';

        setMetadata(prev => ({
          ...prev,
          title: detectedTitle,
          artist: detectedArtist,
          album: album || 'Sencillo'
        }));
        
        if (imageUrl) setCoverUrl(imageUrl);
        setIsProcessing(false);

        // Disparar búsqueda inteligente automáticamente
        fetchAIMetadata(detectedTitle, detectedArtist);
      },
      onError: function(error) {
        const title = file.name.replace(/\.[^/.]+$/, "");
        setMetadata(prev => ({ ...prev, title }));
        setIsProcessing(false);
        fetchAIMetadata(title, 'Artista Desconocido');
      }
    });
  };

  const onDrop = useCallback(acceptedFiles => {
    const droppedFile = acceptedFiles[0];
    if (!droppedFile) return;
    
    setFile(droppedFile);
    setIsProcessing(true);
    setUploadStatus(null);
    setCoverUrl(null);
    
    // Simular un micro-retraso de "IA procesando" para UX
    setTimeout(() => {
      extractMetadata(droppedFile);
    }, 800);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] },
    multiple: false
  });

  const handleCancel = () => {
    setFile(null);
    setMetadata({ title: '', artist: '', album: '', lyrics: '', background_url: '', genre: '', year: '', artist_image: '' });
    setCoverUrl(null);
    setUploadStatus(null);
  };

  const [filters, setFilters] = useState({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });

  const handleUpload = async () => {
    if (!file) return;
    setUploadStatus('uploading');
    
    try {
      const timestamp = new Date().getTime();
      const safeTitle = metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      // 1. Subir MP3 a Cloudflare R2
      const mp3Path = `music/${safeTitle}_${timestamp}.mp3`;
      const mp3Url = await uploadToR2(file, mp3Path);
      
      // 2. Subir Carátula o Video Loop a Cloudflare R2
      let finalCoverUrl = coverUrl;
      if (coverUrl && (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:'))) {
        const isVideo = coverUrl.includes('video') || coverUrl.includes('.mp4');
        const res = await fetch(coverUrl);
        const blob = await res.blob();
        const ext = isVideo ? 'mp4' : 'jpg';
        const coverPath = `covers/${safeTitle}_${timestamp}.${ext}`;
        finalCoverUrl = await uploadToR2(blob, coverPath);
      }

      // NUEVO: Subir Fondo TV Personalizado a R2
      let finalBackgroundUrl = metadata.background_url;
      if (metadata.background_url && (metadata.background_url.startsWith('data:') || metadata.background_url.startsWith('blob:'))) {
        const res = await fetch(metadata.background_url);
        const blob = await res.blob();
        const bgPath = `backgrounds/${safeTitle}_bg_${timestamp}.jpg`;
        finalBackgroundUrl = await uploadToR2(blob, bgPath);
      }
      
      // 3. Guardar todo en Supabase
      const { error } = await supabase.from('songs').insert([{
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        genre: metadata.genre,
        year: metadata.year ? parseInt(metadata.year) : null,
        lyrics: metadata.lyrics,
        cover_url: finalCoverUrl,
        background_url: finalBackgroundUrl,
        url: mp3Url,
        is_video: finalCoverUrl?.endsWith('.mp4'),
        visual_settings: filters // Guardamos los filtros aplicados
      }]);

      if (error) throw error;
      
      setUploadStatus('success');
      setTimeout(() => {
        handleCancel(); // Limpiar el formulario
      }, 3000);
      
    } catch (error) {
      console.error("Error completo en subida:", error);
      alert("Error al subir la canción. Revisa la consola.");
      setUploadStatus(null);
    }
  };



  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>Subir Nueva Música</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>Usa nuestra IA para procesar tus archivos MP3 y generar visuales pro.</p>
        </div>
      </div>

      {!file && (
        <div 
          {...getRootProps()} 
          style={{
            border: `2px dashed ${isDragActive ? '#00ffff' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '16px',
            padding: '80px',
            textAlign: 'center',
            background: isDragActive ? 'rgba(0,255,255,0.05)' : 'rgba(255,255,255,0.02)',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            marginBottom: '40px'
          }}
        >
          <input {...getInputProps()} />
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(0,255,255,0.1)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
            color: '#00ffff'
          }}>
            <Sparkles size={40} />
          </div>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>
            {isDragActive ? 'Suelta el MP3 aquí...' : 'Sube un archivo para iniciar el escaneo inteligente'}
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '400px', margin: '0 auto' }}>
            Extraeremos el género, biografía del artista, letras sincronizadas y buscaremos Fanart oficial para el fondo TV.
          </p>
        </div>
      )}

      {(isProcessing || isAISearching) && (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Loader2 size={40} className="spinner" style={{ animation: 'spin 1s linear infinite', color: '#00ffff', marginBottom: '20px' }} />
          <h3>{isProcessing ? 'Digitalizando audio...' : 'Conectando con bases de datos globales (MusicBrainz/TheAudioDB)...'}</h3>
        </div>
      )}

      {file && !isProcessing && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '30px',
        }}>
          
          <div style={{ display: 'flex', gap: '30px', marginBottom: '30px' }}>
            {/* Previsualización de Carátula con Animación de Destellos */}
            <div style={{ width: '220px', flexShrink: 0 }}>
              <div className={`premium-cover-container ${metadata.animated ? 'ia-animated' : ''}`} style={{ 
                position: 'relative', 
                borderRadius: '12px', 
                overflow: 'hidden',
                aspectRatio: '1/1',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                background: '#000'
              }}>
                {coverUrl ? (
                  <>
                    {coverUrl.includes('.mp4') || coverUrl.startsWith('data:video') ? (
                      <video src={coverUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <img 
                        src={coverUrl} 
                        alt="Carátula" 
                        className="animated-cover" 
                        style={{ 
                          width: '100%', 
                          display: 'block',
                          filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) blur(${filters.blur}px)`
                        }} 
                      />
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
              
              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Filtros Visuales */}
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', marginBottom: '5px' }}>
                  <p style={{ fontSize: '0.65rem', color: '#00ffff', margin: '0 0 8px 0', fontWeight: 'bold' }}>FILTROS VISUALES</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <input type="range" min="50" max="200" value={filters.brightness} onChange={(e) => setFilters({...filters, brightness: e.target.value})} style={{ width: '100%', height: '4px' }} />
                    <input type="range" min="50" max="200" value={filters.contrast} onChange={(e) => setFilters({...filters, contrast: e.target.value})} style={{ width: '100%', height: '4px' }} />
                    <input type="range" min="50" max="200" value={filters.saturate} onChange={(e) => setFilters({...filters, saturate: e.target.value})} style={{ width: '100%', height: '4px' }} />
                  </div>
                </div>

                <button 
                  onClick={() => setMetadata({...metadata, animated: !metadata.animated})}
                  style={{
                    width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #00ffff',
                    background: metadata.animated ? '#00ffff' : 'transparent',
                    color: metadata.animated ? 'black' : '#00ffff',
                    fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                  }}
                >
                  <Sparkles size={14} />
                  {metadata.animated ? 'ANIMACIÓN ACTIVA' : 'PROCESAR ANIMACIÓN IA'}
                </button>
                
                <label style={{
                  width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', textAlign: 'center', cursor: 'pointer',
                  border: '1px dashed rgba(255,255,255,0.2)'
                }}>
                  SUBIR MP4 / LOOP
                  <input type="file" accept="video/mp4" hidden onChange={async (e) => {
                    const vidFile = e.target.files[0];
                    if (vidFile) {
                      const vidUrl = URL.createObjectURL(vidFile);
                      setCoverUrl(vidUrl);
                      // Aquí podrías subirlo a R2 directamente si quisieras
                    }
                  }} />
                </label>
              </div>
            </div>

            {/* Formulario Principal */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={20} color="#00ffff" /> Metadatos de Clasificación IMDb
                </h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => fetchAIMetadata(metadata.title, metadata.artist)}
                    disabled={isAISearching}
                    style={{ 
                      background: 'rgba(0,255,255,0.1)', border: '1px solid #00ffff', color: '#00ffff', 
                      padding: '5px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '5px'
                    }}
                  >
                    {isAISearching ? <Loader2 size={14} className="spinner" /> : <Sparkles size={14} />}
                    Refrescar IA
                  </button>
                  <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Título de Obra</label>
                  <input type="text" value={metadata.title} onChange={(e) => setMetadata({...metadata, title: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Cantante / Artista</label>
                  <input type="text" value={metadata.artist} onChange={(e) => setMetadata({...metadata, artist: e.target.value})} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Género</label>
                  <input type="text" value={metadata.genre} onChange={(e) => setMetadata({...metadata, genre: e.target.value})} style={{ ...inputStyle, border: '1px solid rgba(0,255,255,0.3)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Año</label>
                  <input type="text" value={metadata.year} onChange={(e) => setMetadata({...metadata, year: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Álbum</label>
                  <input type="text" value={metadata.album} onChange={(e) => setMetadata({...metadata, album: e.target.value})} style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          {/* Letras y Fanart TV */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '30px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#00ffff', marginBottom: '10px' }}>
                <Music size={16} /> Letras Sincronizadas
              </label>
              <textarea 
                value={metadata.lyrics} 
                onChange={(e) => setMetadata({...metadata, lyrics: e.target.value})}
                style={{ ...inputStyle, height: '180px', resize: 'none', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#00ffff', marginBottom: '10px' }}>
                <ImageIcon size={16} /> Fondo TV-Style
              </label>
              <div style={{ position: 'relative', height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                {metadata.background_url ? (
                  <img src={metadata.background_url} alt="Fanart" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: '100%', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sin fondo seleccionado</div>
                )}
                <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: '5px' }}>
                  <label style={{ background: 'rgba(0,255,255,0.8)', color: 'black', padding: '5px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>
                    SUBIR FONDO
                    <input type="file" accept="image/*" hidden onChange={async (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setMetadata({...metadata, background_url: url});
                      }
                    }} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '30px' }}>
            <button 
              onClick={handleUpload}
              disabled={uploadStatus === 'uploading' || uploadStatus === 'success'}
              style={{ 
                width: '100%', background: uploadStatus === 'success' ? '#00e676' : '#00ffff', color: 'black', border: 'none', 
                padding: '18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
                fontSize: '1.2rem',
                boxShadow: '0 10px 30px rgba(0,255,255,0.3)'
              }}
            >
              {uploadStatus === 'uploading' ? (
                <><Loader2 size={24} className="spinner" /> Publicando en la Librería Pro...</>
              ) : uploadStatus === 'success' ? (
                <><CheckCircle size={24} /> ¡Publicación Exitosa!</>
              ) : (
                <><Save size={24} /> Guardar Canción con IA Visual</>
              )}
            </button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        .premium-cover-container.ia-animated {
          border: 2px solid #00ffff;
          box-shadow: 0 0 30px rgba(0,255,255,0.4);
        }

        .animated-cover {
          transition: transform 0.5s ease;
        }

        .ia-animated .animated-cover {
          animation: subtle-pulse 4s ease-in-out infinite;
        }

        .sparkle-particles {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background-image: radial-gradient(circle, #fff 1px, transparent 1px);
          background-size: 20px 20px;
          opacity: 0.3;
          animation: sparkle-move 10s linear infinite;
          pointer-events: none;
        }

        @keyframes sparkle-move {
          from { background-position: 0 0; }
          to { background-position: 100% 100%; }
        }

        .shine-overlay {
          position: absolute;
          top: 0; left: -100%;
          width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent);
          transform: skewX(-25deg);
          animation: shine 3s infinite;
        }

        @keyframes shine {
          0% { left: -100%; }
          20% { left: 150%; }
          100% { left: 150%; }
        }

        @keyframes subtle-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: 'white',
  fontSize: '1rem'
};
