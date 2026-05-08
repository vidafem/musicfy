import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Music, Image as ImageIcon, Save, X, Loader2, Sparkles, CheckCircle, Trash2 } from 'lucide-react';
import * as jsmediatags from 'jsmediatags';
import { uploadToR2, deleteFromR2 } from '../../lib/cloudflareR2';
import { supabase } from '../../supabaseClient';
import './Admin.css';

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
    artist_image: '',
    composer: '',
    bpm: '',
    key: '',
    label: '',
    language: '',
    mood: '',
    lyrics: '',
    duration: 0
  });
  const [coverUrl, setCoverUrl] = useState(null);
  const [originalCoverBackup, setOriginalCoverBackup] = useState(null);
  const [alternativeCovers, setAlternativeCovers] = useState([]);
  const [alternativeFanarts, setAlternativeFanarts] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAISearching, setIsAISearching] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedUrls, setUploadedUrls] = useState({ mp3: null, cover: null, background: null });
  const [currentSessionTimestamp] = useState(new Date().getTime());

  // Token de Spotify (Auto-renovable simplificado para el ejemplo)
  // URL de tu Cloudflare Worker
  const WORKER_URL = 'https://musicfy.canonedu17.workers.dev'; // O la URL de tu worker

  const getSpotifyToken = async () => {
    try {
      const res = await fetch(`${WORKER_URL}/auth`);
      if (!res.ok) throw new Error('Fallo en Bridge Cloudflare');
      const data = await res.json();
      return data.access_token;
    } catch (e) {
      console.error("Error Auth vía Worker:", e);
      throw e;
    }
  };

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
      const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
      
      // 1. Función auxiliar para extraer Key de una URL
      const getKey = (url) => url?.includes(publicUrl) ? url.replace(`${publicUrl}/`, '') : null;

      // 2. Borrar todos los archivos de R2
      const mp3Key = getKey(song.url);
      const coverKey = getKey(song.cover_url);
      const bgKey = getKey(song.background_url);

      if (mp3Key) await deleteFromR2(mp3Key);
      if (coverKey) await deleteFromR2(coverKey);
      if (bgKey) await deleteFromR2(bgKey);

      // 3. Borrar de Supabase
      const { error } = await supabase.from('songs').delete().eq('id', song.id);
      if (error) throw error;
      
      fetchSongs();
    } catch (error) {
      console.error("Error al eliminar completo:", error);
      alert("Error al eliminar los archivos.");
    }
  };


  const fetchAIMetadata = async (title, artist) => {
    setIsAISearching(true);
    setAlternativeCovers([]);
    setAlternativeFanarts([]);

    const clean = (str) => {
      if (!str) return '';
      return str
        .replace(/\(Official.*?\)/gi, '')
        .replace(/\[Official.*?\]/gi, '')
        .replace(/- Topic/gi, '')
        .replace(/\(Lyrics.*?\)/gi, '')
        .replace(/ft\..*?$/gi, '')
        .replace(/feat\..*?$/gi, '')
        .trim();
    };

    const cleanTitle = clean(title);
    const firstArtist = clean(artist).split(',')[0].split('y')[0].split('&')[0].trim();

    let newMeta = { ...metadata };
    let foundCovers = originalCoverBackup ? [originalCoverBackup] : [];
    let foundFanarts = [];

    try {
      // 1. MOTOR PRINCIPAL: ITUNES (Gratis, Sin 403, Portadas 4K)
      try {
        const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle + ' ' + firstArtist)}&entity=song&limit=5`);
        if (itunesRes.ok) {
          const itData = await itunesRes.json();
          itData.results.forEach((r, idx) => {
            if (r.artworkUrl100) {
              const highRes = r.artworkUrl100.replace('100x100bb', '1200x1200bb');
              if (!foundCovers.includes(highRes)) foundCovers.push(highRes);
            }
            if (idx === 0) {
               newMeta.title = r.trackName || newMeta.title;
               newMeta.artist = r.artistName || newMeta.artist;
               newMeta.genre = r.primaryGenreName || newMeta.genre;
               newMeta.album = r.collectionName || newMeta.album;
               newMeta.year = r.releaseDate?.split('-')[0] || newMeta.year;
            }
          });
        }
      } catch (e) {
        console.warn("Fallo en iTunes:", e);
      }

      // 2. FONDOS TV: THEAUDIODB
      const adbKey = import.meta.env.VITE_THEAUDIODB_API_KEY || '2';
      try {
        const adbRes = await fetch(`https://www.theaudiodb.com/api/v1/json/${adbKey}/search.php?s=${encodeURIComponent(firstArtist)}`);
        if (adbRes.ok) {
          const adbData = await adbRes.json();
          if (adbData.artists?.[0]) {
            const art = adbData.artists[0];
            newMeta.label = art.strLabel || newMeta.label;
            if (art.strArtistFanart) foundFanarts.push(art.strArtistFanart);
            if (art.strArtistFanart2) foundFanarts.push(art.strArtistFanart2);
            if (art.strArtistWideThumb) foundFanarts.push(art.strArtistWideThumb);
            if (foundFanarts.length > 0) newMeta.background_url = foundFanarts[0];
          }
        }
      } catch (e) {}

      // 3. MOTOR EXTRA: SPOTIFY (Ahora con Premium activo)
      try {
        const token = await getSpotifyToken();
        if (token) {
          const searchTitle = cleanTitle.replace(/[()]/g, '').trim();
          const spotRes = await fetch(`${WORKER_URL}/v1/search?q=track:${encodeURIComponent(searchTitle)}%20artist:${encodeURIComponent(firstArtist)}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (spotRes.ok) {
            const d = await spotRes.json();
            const spotData = d.tracks?.items[0];
            if (spotData) {
              // Si Spotify encuentra algo, intentamos sacar BPM y Key
              const featRes = await fetch(`${WORKER_URL}/v1/audio-features/${spotData.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (featRes.ok) {
                const feat = await featRes.json();
                newMeta.bpm = Math.round(feat.tempo) || newMeta.bpm;
                const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                newMeta.key = feat.key !== undefined ? `${keys[feat.key]} ${feat.mode === 1 ? 'Mayor' : 'Menor'}` : newMeta.key;
              } else if (featRes.status === 403) {
                console.log("Spotify aún procesando tu suscripción Premium. BPM/Key disponibles en breve.");
                newMeta.bpm = ''; // Dejar vacío para evitar error de validación
                newMeta.key = 'Pendiente (Premium)';
              }
            }
          }
        }
      } catch (e) {
        console.warn("Spotify falló (aunque tengas Premium):", e);
      }

      // Fallback de Fondos
      if (foundFanarts.length === 0 && foundCovers.length > 0) {
        foundFanarts = [foundCovers[foundCovers.length - 1]];
        newMeta.background_url = foundCovers[foundCovers.length - 1];
      }

      setMetadata(newMeta);
      setAlternativeCovers(foundCovers);
      setAlternativeFanarts(foundFanarts);
      if (foundCovers.length > 0) setCoverUrl(foundCovers[0]);
    } catch (err) {
      console.error("Error en motor de IA:", err);
    } finally {
      setIsAISearching(false);
    }
  };

  const extractMetadata = (file) => {
    // 1. Obtener duración real usando el API de Audio del navegador
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      setMetadata(prev => ({ ...prev, duration: Math.floor(audio.duration) }));
      URL.revokeObjectURL(audio.src);
    };

    jsmediatags.read(file, {
      onSuccess: function(tag) {
        const { 
          title, artist, album, year, genre, picture,
          TCOM, TBPM, TKEY, TPUB, TLAN, TCON, COMM
        } = tag.tags;
        
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

        // Mapeo avanzado de etiquetas nativas
        setMetadata(prev => ({
          ...prev,
          title: detectedTitle,
          artist: detectedArtist,
          album: album || '',
          year: year || '',
          genre: genre || TCON || '', // TCON es el tag nativo de genero
          composer: TCOM?.data || '',
          bpm: TBPM?.data || '',
          key: TKEY?.data || '',
          label: TPUB?.data || '', // Publisher / Editor
          language: TLAN?.data || '',
          mood: COMM?.data?.text || '' // A veces el mood viene en comentarios
        }));
        
        if (imageUrl) {
          setCoverUrl(imageUrl);
          setOriginalCoverBackup(imageUrl);
          setAlternativeCovers([imageUrl]);
        }
        setIsProcessing(false);

        if (detectedTitle) {
          fetchSyncedLyricsOnly(detectedTitle, detectedArtist);
        }
      },
      onError: function(error) {
        const title = file.name.replace(/\.[^/.]+$/, "");
        setMetadata(prev => ({ ...prev, title }));
        setIsProcessing(false);
      }
    });
  };

  const fetchSyncedLyricsOnly = async (title, artist) => {
    try {
      const lrcRes = await fetch(`https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        if (lrcData.length > 0) {
          setMetadata(prev => ({
            ...prev,
            lyrics: lrcData[0].syncedLyrics || lrcData[0].plainLyrics || prev.lyrics
          }));
        }
      }
    } catch (e) {
      console.log("Error buscando letras auto:", e);
    }
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
      const safeTitle = metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      let finalMp3Url = uploadedUrls.mp3;
      let finalCoverUrl = uploadedUrls.cover;
      let finalBackgroundUrl = uploadedUrls.background;

      // 1. Subir MP3 solo si no se ha subido en esta sesión
      if (!finalMp3Url) {
        const mp3Path = `music/${safeTitle}_${currentSessionTimestamp}.mp3`;
        finalMp3Url = await uploadToR2(file, mp3Path);
      }
      
      // 2. Subir Carátula (Local o Externa para Espejo)
      if (!finalCoverUrl && coverUrl) {
        if (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:') || !coverUrl.includes(import.meta.env.VITE_R2_PUBLIC_URL)) {
          try {
            const isVideo = coverUrl.includes('video') || coverUrl.includes('.mp4');
            // Usamos el PROXY del Worker para evitar CORS
            const fetchUrl = (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:')) 
              ? coverUrl 
              : `${WORKER_URL}/proxy-image?url=${encodeURIComponent(coverUrl)}`;
            
            const res = await fetch(fetchUrl);
            const blob = await res.blob();
            const ext = isVideo ? 'mp4' : 'jpg';
            const coverPath = `covers/${safeTitle}_${currentSessionTimestamp}.${ext}`;
            finalCoverUrl = await uploadToR2(blob, coverPath);
          } catch (e) {
            console.warn("No se pudo espejar la carátula, usando URL original:", e);
            finalCoverUrl = coverUrl;
          }
        }
      }

      // 3. Subir Fondo TV (Local o Externo para Espejo)
      if (!finalBackgroundUrl && metadata.background_url) {
        if (metadata.background_url.startsWith('data:') || metadata.background_url.startsWith('blob:') || !metadata.background_url.includes(import.meta.env.VITE_R2_PUBLIC_URL)) {
          try {
            // Usamos el PROXY del Worker para evitar CORS
            const fetchUrl = (metadata.background_url.startsWith('data:') || metadata.background_url.startsWith('blob:')) 
              ? metadata.background_url 
              : `${WORKER_URL}/proxy-image?url=${encodeURIComponent(metadata.background_url)}`;

            const res = await fetch(fetchUrl);
            const blob = await res.blob();
            const bgPath = `backgrounds/${safeTitle}_bg_${currentSessionTimestamp}.jpg`;
            finalBackgroundUrl = await uploadToR2(blob, bgPath);
          } catch (e) {
            console.warn("No se pudo espejar el fondo, usando URL original:", e);
            finalBackgroundUrl = metadata.background_url;
          }
        }
      }

      // Actualizar estado de archivos subidos para evitar duplicados en el siguiente clic
      setUploadedUrls({ mp3: finalMp3Url, cover: finalCoverUrl, background: finalBackgroundUrl });

      // 4. Guardar todo en Supabase
      const { error } = await supabase.from('songs').insert([{
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        genre: metadata.genre,
        year: metadata.year ? parseInt(metadata.year) : null,
        lyrics: metadata.lyrics,
        cover_url: finalCoverUrl,
        background_url: finalBackgroundUrl,
        url: finalMp3Url,
        is_video: finalCoverUrl?.endsWith('.mp4'),
        visual_settings: filters,
        composer: metadata.composer,
        bpm: metadata.bpm ? parseInt(metadata.bpm) : null,
        musical_key: metadata.key,
        label: metadata.label,
        language: metadata.language,
        mood: metadata.mood,
        duration: metadata.duration
      }]);

      if (error) throw error;
      
      console.log("¡Guardado exitoso en Supabase!");
      setUploadStatus('success');
      if (fetchSongs) fetchSongs(); 
      setTimeout(() => {
        handleCancel();
      }, 2000);
      
    } catch (error) {
      console.error("Error crítico en subida:", error);
      alert("Error al guardar. Revisa el Worker o la consola.");
      setUploadStatus(null);
    }
  };



  return (
    <div style={{ animation: 'fadeIn 0.5s ease', width: '100%' }}>
      {/* HEADER ELIMINADO PARA EVITAR DUPLICIDAD CON EL TOPBAR */}
      
      {!file && (
        <div 
          {...getRootProps()} 
          className={`upload-zone ${isDragActive ? 'active' : ''}`}
          style={{ 
            padding: '40px 20px', 
            minHeight: '200px', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <input {...getInputProps()} />
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-glow)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
            color: 'var(--accent-color)',
            boxShadow: '0 0 20px var(--accent-glow)'
          }}>
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
        <div className="dashboard-section" style={{ position: 'relative' }}>
          
          <div className="manager-form-container">
            {/* Previsualización de Carátula */}
            <div className="manager-cover-preview" style={{ width: '100%', maxWidth: '240px' }}>
              <div className={`premium-cover-container ${metadata.animated ? 'ia-animated' : ''}`} style={{ 
                position: 'relative', 
                borderRadius: '12px', 
                overflow: 'hidden',
                width: '100%',
                aspectRatio: '1/1',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                background: '#000',
                marginBottom: '20px'
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
              
              {/* CARRUSEL DE OPCIONES DE CARÁTULA */}
              {alternativeCovers.length > 1 && (
                <div style={{ marginBottom: '20px' }}>
                   <p style={{ fontSize: '0.65rem', color: 'var(--accent-color)', margin: '0 0 10px 0', fontWeight: 'bold' }}>CAMBIAR PORTADA</p>
                   <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
                      {alternativeCovers.map((url, idx) => (
                        <img 
                          key={idx} 
                          src={url} 
                          onClick={() => setCoverUrl(url)}
                          style={{ 
                            width: '50px', height: '50px', borderRadius: '6px', cursor: 'pointer',
                            border: coverUrl === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)',
                            opacity: coverUrl === url ? 1 : 0.6
                          }} 
                        />
                      ))}
                   </div>
                </div>
              )}

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
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginBottom: '8px'
                }}
              >
                <Sparkles size={14} />
                {metadata.animated ? 'ANIMACIÓN ACTIVA' : 'PROCESAR ANIMACIÓN IA'}
              </button>
              
              <label style={{
                width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', textAlign: 'center', cursor: 'pointer',
                border: '1px dashed rgba(255,255,255,0.2)', display: 'block'
              }}>
                SUBIR MP4 / LOOP
                <input type="file" accept="video/mp4" hidden onChange={async (e) => {
                  const vidFile = e.target.files[0];
                  if (vidFile) {
                    const vidUrl = URL.createObjectURL(vidFile);
                    setCoverUrl(vidUrl);
                  }
                }} />
              </label>
            </div>

            {/* Formulario Principal */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
                  <CheckCircle size={20} color="var(--accent-color)" /> Clasificación Inteligente
                </h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => fetchAIMetadata(metadata.title, metadata.artist)}
                    disabled={isAISearching}
                    style={{ 
                      background: 'var(--accent-glow)', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', 
                      padding: '8px 15px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold'
                    }}
                  >
                    {isAISearching ? <Loader2 size={14} className="spinner" /> : <Sparkles size={14} />}
                    Sincronizar IA
                  </button>
                  <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Título</label>
                  <input type="text" value={metadata.title} onChange={(e) => setMetadata({...metadata, title: e.target.value})} className="admin-input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Artista</label>
                  <input type="text" value={metadata.artist} onChange={(e) => setMetadata({...metadata, artist: e.target.value})} className="admin-input" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Género</label>
                  <input type="text" value={metadata.genre} onChange={(e) => setMetadata({...metadata, genre: e.target.value})} className="admin-input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Año</label>
                  <input type="text" value={metadata.year} onChange={(e) => setMetadata({...metadata, year: e.target.value})} className="admin-input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Álbum</label>
                  <input type="text" value={metadata.album} onChange={(e) => setMetadata({...metadata, album: e.target.value})} className="admin-input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Duración (seg)</label>
                  <input type="text" value={metadata.duration} readOnly className="admin-input" style={{ opacity: 0.7 }} />
                </div>
              </div>

              <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 'bold', margin: '0 0 15px 0', letterSpacing: '1px' }}>INFORMACIÓN TÉCNICA / AVANZADA</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '5px' }}>Compositor</label>
                    <input type="text" value={metadata.composer} onChange={(e) => setMetadata({...metadata, composer: e.target.value})} className="admin-input" style={{ fontSize: '0.85rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '5px' }}>BPM</label>
                    <input type="number" value={metadata.bpm} onChange={(e) => setMetadata({...metadata, bpm: e.target.value})} className="admin-input" style={{ fontSize: '0.85rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '5px' }}>Tonalidad (Key)</label>
                    <input type="text" value={metadata.key} onChange={(e) => setMetadata({...metadata, key: e.target.value})} className="admin-input" style={{ fontSize: '0.85rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '5px' }}>Sello (Label)</label>
                    <input type="text" value={metadata.label} onChange={(e) => setMetadata({...metadata, label: e.target.value})} className="admin-input" style={{ fontSize: '0.85rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '5px' }}>Idioma</label>
                    <input type="text" value={metadata.language} onChange={(e) => setMetadata({...metadata, language: e.target.value})} className="admin-input" style={{ fontSize: '0.85rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '5px' }}>Estado de ánimo</label>
                    <input type="text" value={metadata.mood} onChange={(e) => setMetadata({...metadata, mood: e.target.value})} className="admin-input" style={{ fontSize: '0.85rem' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Letras y Fanart TV */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '30px', marginTop: '20px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--accent-color)', marginBottom: '10px' }}>
                <Music size={16} /> Letras Sincronizadas
              </label>
              <textarea 
                value={metadata.lyrics} 
                onChange={(e) => setMetadata({...metadata, lyrics: e.target.value})}
                className="admin-input"
                style={{ height: '180px', resize: 'none', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--accent-color)', marginBottom: '10px' }}>
                <ImageIcon size={16} /> Fondo TV (Fanart)
              </label>
              <div style={{ position: 'relative', height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                {metadata.background_url ? (
                  <img src={metadata.background_url} alt="Fanart" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: '100%', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sin fondo seleccionado</div>
                )}
                <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: '5px' }}>
                  <label style={{ background: 'var(--accent-color)', color: 'black', padding: '5px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>
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
              
              {/* CARRUSEL DE FONDOS TV */}
              {alternativeFanarts.length > 1 && (
                <div style={{ marginTop: '10px' }}>
                   <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
                      {alternativeFanarts.map((url, idx) => (
                        <img 
                          key={idx} 
                          src={url} 
                          onClick={() => setMetadata({...metadata, background_url: url})}
                          style={{ 
                            width: '80px', height: '45px', borderRadius: '4px', cursor: 'pointer', objectFit: 'cover',
                            border: metadata.background_url === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)',
                            opacity: metadata.background_url === url ? 1 : 0.6
                          }} 
                        />
                      ))}
                   </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '30px' }}>
            <button 
              onClick={handleUpload}
              disabled={uploadStatus === 'uploading' || uploadStatus === 'success'}
              style={{ 
                width: '100%', background: uploadStatus === 'success' ? '#00e676' : 'var(--accent-color)', color: 'black', border: 'none', 
                padding: '18px', borderRadius: '15px', fontWeight: 'bold', cursor: 'pointer',
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
                fontSize: '1.1rem',
                boxShadow: uploadStatus === 'success' ? 'none' : '0 10px 30px var(--accent-glow)'
              }}
            >
              {uploadStatus === 'uploading' ? (
                <><Loader2 size={24} className="spinner" /> Publicando en Musicfy Cloud...</>
              ) : uploadStatus === 'success' ? (
                <><CheckCircle size={24} /> ¡Publicada con éxito!</>
              ) : (
                <><Save size={24} /> Guardar Obra con IA Visual</>
              )}
            </button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        .premium-cover-container.ia-animated {
          border: 2px solid var(--accent-color);
          box-shadow: 0 0 30px var(--accent-glow);
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
