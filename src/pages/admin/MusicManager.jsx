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

  React.useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    console.log("Cargando canciones de Supabase...");
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error cargando canciones:", error);
    } else {
      console.log("Canciones cargadas:", data.length);
      setSongs(data);
    }
  };

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
    try {
      // 1. Buscar en MusicBrainz para Género y Clasificación
      const mbRes = await fetch(`https://musicbrainz.org/ws/2/release?query=release:${encodeURIComponent(title)}%20AND%20artist:${encodeURIComponent(artist)}&fmt=json`);
      const mbData = await mbRes.json();
      
      // 2. Buscar Fanart de Alta Calidad (Nivel IMDb) en TheAudioDB
      const adbRes = await fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist)}`);
      const adbData = await adbRes.json();
      
      let fanart = '';
      let genre = 'Pop';
      
      if (adbData.artists && adbData.artists[0]) {
        const art = adbData.artists[0];
        fanart = art.strArtistFanart || art.strArtistWideThumb || art.strArtistThumb;
        genre = art.strGenre || 'Pop';
      }

      // 3. Buscar Letras en LRCLIB
      const lyricsRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(title + ' ' + artist)}`);
      const lyricsData = await lyricsRes.json();
      
      if (lyricsData && lyricsData.length > 0) {
        const bestMatch = lyricsData[0];
        setMetadata(prev => ({
          ...prev,
          title: bestMatch.trackName || prev.title,
          artist: bestMatch.artistName || prev.artist,
          album: bestMatch.albumName || prev.album,
          lyrics: bestMatch.syncedLyrics || bestMatch.plainLyrics || '',
          genre: genre,
          background_url: fanart || prev.background_url
        }));
      } else {
        setMetadata(prev => ({ ...prev, genre, background_url: fanart || prev.background_url }));
      }

    } catch (error) {
      console.error("Error en búsqueda IA avanzada:", error);
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
    setMetadata({ title: '', artist: '', album: '' });
    setCoverUrl(null);
    setUploadStatus(null);
  };

  const handleUpload = async () => {
    setUploadStatus('uploading');
    
    try {
      const timestamp = new Date().getTime();
      const safeTitle = metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      // 1. Subir MP3 a Cloudflare R2
      const mp3Path = `music/${safeTitle}_${timestamp}.mp3`;
      const mp3Url = await uploadToR2(file, mp3Path);
      
      let finalCoverUrl = null;
      
      // 2. Si hay carátula, convertir base64 a Blob y subir a Cloudflare R2
      if (coverUrl && coverUrl.startsWith('data:image')) {
        const arr = coverUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        const coverBlob = new Blob([u8arr], {type: mime});
        
        const coverPath = `covers/${safeTitle}_${timestamp}.jpg`;
        finalCoverUrl = await uploadToR2(coverBlob, coverPath);
      }

      // 3. Guardar en Supabase Database
      const { data, error } = await supabase
        .from('songs')
        .insert([
          {
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            url: mp3Url,
            cover_url: finalCoverUrl,
            lyrics: metadata.lyrics,
            background_url: metadata.background_url,
            genre: metadata.genre,
            artist_image: metadata.background_url // Usamos el fanart como imagen de artista también
          }
        ]);

      if (error) throw error;
      
      setUploadStatus('success');
      fetchSongs(); // Refrescar la lista inmediatamente
      setTimeout(() => {
        handleCancel(); // Limpiar el formulario
      }, 3000);
    } catch (error) {
      console.error("Error en subida:", error);
      setUploadStatus('error');
    }
  };

  console.log("Renderizando MusicManager. Canciones en estado:", songs.length);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>Estación de Trabajo IA Pro</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>Análisis profundo estilo IMDb, Fanarts de alta resolución y efectos visuales inteligentes.</p>
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
              <div className="premium-cover-container" style={{ 
                position: 'relative', 
                borderRadius: '12px', 
                overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
              }}>
                {coverUrl ? (
                  <>
                    <img src={coverUrl} alt="Carátula" className="animated-cover" style={{ width: '100%', display: 'block' }} />
                    <div className="shine-overlay"></div>
                    <div className="sparkle-particles"></div>
                  </>
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'rgba(255,255,255,0.3)' }}>
                    <ImageIcon size={40} style={{ marginBottom: '10px' }} />
                    <span>Buscando Arte...</span>
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', right: '10px', background: 'rgba(0,255,255,0.8)', color: 'black', padding: '4px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 'bold', textAlign: 'center' }}>
                  ANIMATED LOOP CLASSIFIED
                </div>
              </div>
            </div>

            {/* Formulario Principal */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={20} color="#00ffff" /> Metadatos de Clasificación IMDb
                </h3>
                <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Género (Recomendaciones)</label>
                  <input type="text" value={metadata.genre} onChange={(e) => setMetadata({...metadata, genre: e.target.value})} style={{ ...inputStyle, border: '1px solid #00ffff' }} />
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
                <ImageIcon size={16} /> Fondo TV IMDb-Style (Official Fanart)
              </label>
              <div style={{ position: 'relative', height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                {metadata.background_url ? (
                  <img src={metadata.background_url} alt="Fanart" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: '100%', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Buscando Fanart...</div>
                )}
                <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>
                  HD BACKDROP
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

      {/* Lista de Librería Actual */}
      <div style={{ marginTop: '60px' }}>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Music size={24} color="#00ffff" /> Librería Actual ({songs.length} canciones)
        </h3>
        
        <div style={{ display: 'grid', gap: '15px' }}>
          {songs.map(song => (
            <div key={song.id} style={{ 
              background: 'rgba(255,255,255,0.02)', 
              border: '1px solid rgba(255,255,255,0.05)', 
              borderRadius: '12px', 
              padding: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <img src={song.cover_url} alt="" style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover' }} />
                <div>
                  <div style={{ fontWeight: 'bold' }}>{song.title}</div>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>{song.artist} • {song.genre}</div>
                </div>
              </div>
              
              <button 
                onClick={() => handleDelete(song)}
                style={{ 
                  background: 'rgba(255,50,50,0.1)', 
                  border: 'none', 
                  color: '#ff4444', 
                  padding: '10px', 
                  borderRadius: '8px', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Trash2 size={18} /> Borrar
              </button>
            </div>
          ))}

          {songs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>
              No hay canciones en la librería todavía.
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        .premium-cover-container {
          animation: float 6s ease-in-out infinite;
        }

        .animated-cover {
          animation: subtle-pulse 4s ease-in-out infinite;
        }

        .shine-overlay {
          position: absolute;
          top: 0; left: -100%;
          width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
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
          50% { transform: scale(1.03); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
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
