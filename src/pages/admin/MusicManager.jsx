import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Music, Image as ImageIcon, Save, X, Loader2, Sparkles, CheckCircle, Trash2 } from 'lucide-react';
import * as jsmediatags from 'jsmediatags';
import { uploadToR2, deleteFromR2 } from '../../lib/cloudflareR2';
import { supabase } from '../../supabaseClient';
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
    duration: 0
  });
  const [coverUrl, setCoverUrl] = useState(null);
  const [originalCoverBackup, setOriginalCoverBackup] = useState(null);
  const [alternativeCovers, setAlternativeCovers] = useState([]);
  const [alternativeFanarts, setAlternativeFanarts] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAISearching, setIsAISearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [backupMetadata, setBackupMetadata] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);

  const spotifyStyle = { ...suggestionBtnStyle, background: 'rgba(30, 215, 96, 0.1)', borderColor: '#1ed760', color: '#1ed760' };
  const itunesStyle = { ...suggestionBtnStyle, background: 'rgba(250, 45, 114, 0.1)', borderColor: '#fa2d72', color: '#fa2d72' };
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

  // FASE 1: Buscar sugerencias de metadatos (Texto)
  const fetchAIData = async (title, artist) => {
    setIsAISearching(true);
    setAiSuggestions(null);
    try {
      const clean = (str) => str?.replace(/\[.*?\]|\(.*?\)/g, "").trim() || "";
      const cleanTitle = clean(title);
      const firstArtist = clean(artist).split(/[&,x\/]|\bfeat\b/i).map(a => a.trim())[0];

      let results = { itunes: null, spotify: null };

      // Sugerencia iTunes
      try {
        const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle + " " + firstArtist)}&entity=song&limit=1`);
        if (itRes.ok) {
          const itData = await itRes.json();
          const r = itData.results[0];
          if (r) {
            results.itunes = {
              title: r.trackName,
              artist: r.artistName,
              album: r.collectionName,
              year: r.releaseDate ? r.releaseDate.split('-')[0] : null,
              genre: r.primaryGenreName
            };
          }
        }
      } catch (e) { }

      // Sugerencia Spotify
      try {
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
              results.spotify = {
                title: t.name,
                artist: t.artists.map(a => a.name).join(', '),
                album: t.album.name
              };
            }
          }
        }
      } catch (e) { }

      setAiSuggestions(results);
    } catch (e) {
      console.error("Error al sugerir datos:", e);
    } finally {
      setIsAISearching(false);
    }
  };

  const revertMetadata = () => {
    if (backupMetadata) {
      setMetadata(prev => ({
        ...backupMetadata,
        lyrics: prev.lyrics, // Preservamos las letras actuales
        duration: prev.duration // Preservamos la duración física
      }));
      if (originalCoverBackup) setCoverUrl(originalCoverBackup);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setMetadata({ title: '', artist: '', album: '', lyrics: '', background_url: '', genre: '', year: '', artist_image: '' });
    setCoverUrl(null);
    setOriginalCoverBackup(null);
    setAlternativeCovers([]);
    setAlternativeFanarts([]);
    setAiSuggestions(null);
    setUploadStatus(null);
  };

  // FASE 2: Buscar imágenes basadas en la información ACTUAL
  const fetchAIVisuals = async (title, artist) => {
    setIsAISearching(true);
    try {
      const clean = (str) => str?.replace(/\[.*?\]|\(.*?\)/g, "").trim() || "";
      const cleanTitle = clean(title);
      const artistsList = artist.split(/[&,x\/]|\bfeat\b/i).map(a => a.trim()).filter(a => a);
      const yearSuffix = metadata.year ? ` ${metadata.year}` : "";

      let foundCovers = originalCoverBackup ? [originalCoverBackup] : [];
      let allFoundFanarts = [];

      // 1. PORTADAS (iTunes + Spotify + Deezer)
      const coverQueries = [`${cleanTitle} ${artistsList[0]}${yearSuffix}`];
      if (metadata.album) coverQueries.push(`${metadata.album} ${artistsList[0]}`);

      for (const q of coverQueries) {
        // iTunes
        try {
          const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=5`);
          if (itRes.ok) {
            const d = await itRes.json();
            foundCovers.push(...d.results.map(r => r.artworkUrl100.replace('100x100bb', '1200x1200bb')));
          }
        } catch (e) { }

        // Deezer
        try {
          const deezRes = await fetch(`${WORKER_URL}/proxy-image?url=${encodeURIComponent(`https://api.deezer.com/search?q=${q}&limit=5`)}`);
          const deezData = await deezRes.json();
          if (deezData.data) {
            foundCovers.push(...deezData.data.map(t => t.album.cover_xl));
          }
        } catch (e) { }
      }

      // Spotify Exact Track Cover
      const token = await getSpotifyToken();
      if (token) {
        try {
          const q = `track:${cleanTitle} artist:${artistsList[0]}${metadata.year ? ` year:${metadata.year}` : ""}`;
          const spotRes = await fetch(`${WORKER_URL}/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (spotRes.ok) {
            const d = await spotRes.json();
            foundCovers.push(...d.tracks.items.map(t => t.album.images[0]?.url));
          }
        } catch (e) { }
      }

      // 2. FONDOS TV (YouTube + Spotify Artist + TheAudioDB)

      // A) YouTube Thumbnails (Suelen ser el arte oficial del video)
      try {
        const ytSearch = await fetch(`${WORKER_URL}/proxy-image?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${cleanTitle}+${artistsList[0]}+official+video`)}`);
        const ytHtml = await ytSearch.text();
        const videoIds = [...ytHtml.matchAll(/"videoId":"(.*?)"/g)].map(m => m[1]).slice(0, 3);
        videoIds.forEach(id => {
          allFoundFanarts.push(`https://img.youtube.com/vi/${id}/maxresdefault.jpg`);
          allFoundFanarts.push(`https://img.youtube.com/vi/${id}/sddefault.jpg`);
        });
      } catch (e) { }

      // B) Spotify Artist & Fanarts
      const adbKey = import.meta.env.VITE_THEAUDIODB_API_KEY || '2';
      for (const aName of artistsList) {
        if (token) {
          try {
            const spotRes = await fetch(`${WORKER_URL}/v1/search?q=artist:${encodeURIComponent(aName)}&type=artist&limit=1`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (spotRes.ok) {
              const d = await spotRes.json();
              const art = d.artists?.items[0];
              if (art?.images) allFoundFanarts.push(...art.images.map(i => i.url));
            }
          } catch (e) { }
        }

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
        } catch (e) { }
      }

      setAlternativeCovers([...new Set(foundCovers)].filter(u => u));
      setAlternativeFanarts([...new Set(allFoundFanarts)].filter(url => url));
    } catch (err) {
      console.error("Error visuales IA:", err);
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
      onSuccess: function (tag) {
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

        const initialMeta = {
          title: detectedTitle,
          artist: detectedArtist,
          album: album || '',
          year: year || '',
          genre: genre || TCON || '',
          composer: TCOM?.data || '',
          bpm: TBPM?.data || '',
          key: TKEY?.data || '',
          label: TPUB?.data || '',
          language: TLAN?.data || '',
          mood: COMM?.data?.text || ''
        };

        setMetadata(prev => {
          const combined = { ...prev, ...initialMeta };
          // Guardamos el backup con todo incluido (incluyendo duración si ya llegó)
          setTimeout(() => setBackupMetadata(combined), 0);
          return combined;
        });

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
      onError: function (error) {
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

  const [filters, setFilters] = useState({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });

  const [statusModal, setStatusModal] = useState({ show: false, title: '', steps: [], type: 'loading' });

  const updateStatusStep = (stepIndex, status) => {
    setStatusModal(prev => {
      const newSteps = [...prev.steps];
      if (newSteps[stepIndex]) newSteps[stepIndex].status = status;
      return { ...prev, steps: newSteps };
    });
  };

  const handleUpload = async () => {
    if (!file) return;

    const steps = [
      { label: 'Subiendo archivo MP3 (R2)', status: 'pending' },
      { label: 'Espejando Portada (R2)', status: 'pending' },
      { label: 'Espejando Fondo TV (R2)', status: 'pending' }
    ];

    setStatusModal({ show: true, title: 'Publicando Obra Maestra', steps, type: 'loading' });

    try {
      const safeTitle = metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      let finalMp3Url = uploadedUrls.mp3;
      let finalCoverUrl = uploadedUrls.cover;
      let finalBackgroundUrl = uploadedUrls.background;

      // 1. MP3
      updateStatusStep(0, 'active');
      if (!finalMp3Url) {
        const mp3Path = `music/${safeTitle}_${currentSessionTimestamp}.mp3`;
        finalMp3Url = await uploadToR2(file, mp3Path);
      }
      updateStatusStep(0, 'done');

      // 2. Portada
      updateStatusStep(1, 'active');
      if (!finalCoverUrl && coverUrl) {
        if (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:') || !coverUrl.includes(import.meta.env.VITE_R2_PUBLIC_URL)) {
          try {
            const isVideo = coverUrl.includes('video') || coverUrl.includes('.mp4');
            const fetchUrl = (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:'))
              ? coverUrl
              : `${WORKER_URL}/proxy-image?url=${encodeURIComponent(coverUrl)}`;

            const res = await fetch(fetchUrl);
            const blob = await res.blob();
            const ext = isVideo ? 'mp4' : 'jpg';
            const coverPath = `covers/${safeTitle}_${currentSessionTimestamp}.${ext}`;
            finalCoverUrl = await uploadToR2(blob, coverPath);
          } catch (e) { finalCoverUrl = coverUrl; }
        }
      }
      updateStatusStep(1, 'done');

      // 3. Fondo
      updateStatusStep(2, 'active');
      if (!finalBackgroundUrl && metadata.background_url) {
        if (metadata.background_url.startsWith('data:') || metadata.background_url.startsWith('blob:') || !metadata.background_url.includes(import.meta.env.VITE_R2_PUBLIC_URL)) {
          try {
            const fetchUrl = (metadata.background_url.startsWith('data:') || metadata.background_url.startsWith('blob:'))
              ? metadata.background_url
              : `${WORKER_URL}/proxy-image?url=${encodeURIComponent(metadata.background_url)}`;

            const res = await fetch(fetchUrl);
            const blob = await res.blob();
            const bgPath = `backgrounds/${safeTitle}_bg_${currentSessionTimestamp}.jpg`;
            finalBackgroundUrl = await uploadToR2(blob, bgPath);
          } catch (e) { finalBackgroundUrl = metadata.background_url; }
        }
      }
      updateStatusStep(2, 'done');

      // 4. Supabase (Ehn segundo plano)
      const songData = {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        genre: metadata.genre,
        year: (metadata.year && !isNaN(parseInt(metadata.year))) ? parseInt(metadata.year) : null,
        lyrics: metadata.lyrics,
        cover_url: finalCoverUrl,
        background_url: finalBackgroundUrl,
        url: finalMp3Url,
        duration: metadata.duration ? parseFloat(metadata.duration) : 0
      };

      const { error } = await supabase.from('songs').insert([songData]);
      if (error) throw error;

      setStatusModal(prev => ({ ...prev, type: 'success' }));

      if (onMusicAdded) onMusicAdded();

      setTimeout(() => {
        setStatusModal({ show: false, title: '', steps: [], type: 'loading' });
        handleCancel();
      }, 2500);

    } catch (error) {
      console.error("Error crítico Supabase:", error);
      setStatusModal({
        show: true,
        title: 'Error al Sincronizar',
        steps: [{ label: error.message || 'Error en base de datos', status: 'error' }],
        type: 'error'
      });
    }
  };

  const handleDelete = async (song) => {
    if (!window.confirm(`¿Borrar permanentemente "${song.title}"?`)) return;

    const steps = [
      { label: 'Eliminando archivo MP3 (R2)', status: 'pending' },
      { label: 'Eliminando Portada (R2)', status: 'pending' },
      { label: 'Eliminando Fondo TV (R2)', status: 'pending' },
      { label: 'Limpiando registro en Supabase', status: 'pending' }
    ];
    setStatusModal({ show: true, title: 'Eliminando Música y Archivos', steps, type: 'loading' });

    try {
      const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;
      const getKey = (url) => url?.includes(publicUrl) ? url.replace(`${publicUrl}/`, '') : null;

      const mp3Key = getKey(song.url);
      const coverKey = getKey(song.cover_url);
      const bgKey = getKey(song.background_url);

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

      // 4. Supabase
      updateStatusStep(3, 'active');
      const { error } = await supabase.from('songs').delete().eq('id', song.id);
      if (error) throw error;
      updateStatusStep(3, 'done');

      setStatusModal(prev => ({ ...prev, type: 'success' }));

      setTimeout(() => {
        setStatusModal({ show: false, title: '', steps: [], type: 'loading' });
        fetchSongs();
      }, 2000);
    } catch (error) {
      setStatusModal({ show: true, title: 'Error al eliminar', steps: [{ label: error.message, status: 'error' }], type: 'error' });
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
        <>
          <div className="dashboard-section" style={{ position: 'relative' }}>
            {/* Botón Cerrar / Cancelar */}
            <button
              onClick={handleCancel}
              style={{
                position: 'absolute', top: '15px', right: '15px',
                background: 'rgba(255,255,255,0.05)', border: 'none', color: 'rgba(255,255,255,0.5)',
                width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => { e.target.style.background = '#ff4757'; e.target.style.color = 'white'; }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'rgba(255,255,255,0.5)'; }}
            >
              <X size={18} />
            </button>

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


                <button
                  onClick={() => setMetadata({ ...metadata, animated: !metadata.animated })}
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
                      onClick={() => fetchAIData(metadata.title, metadata.artist)}
                      disabled={isAISearching}
                      style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white', padding: '6px 12px', borderRadius: '20px',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                        fontSize: '0.65rem', fontWeight: 'bold'
                      }}
                    >
                      {isAISearching ? <Loader2 size={12} className="spinner" /> : <Sparkles size={12} />}
                      1. BUSCAR DATOS
                    </button>
                    <button
                      onClick={() => fetchAIVisuals(metadata.title, metadata.artist)}
                      disabled={isAISearching}
                      style={{
                        background: 'rgba(0, 255, 255, 0.1)', border: '1px solid var(--accent-color)',
                        color: 'var(--accent-color)', padding: '6px 12px', borderRadius: '20px',
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
                        background: 'rgba(255, 71, 87, 0.1)', border: '1px solid #ff4757',
                        color: '#ff4757', padding: '6px 12px', borderRadius: '20px',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                        fontSize: '0.65rem', fontWeight: 'bold'
                      }}
                    >
                      REVERTIR
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>
                      Título
                      <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                        {aiSuggestions?.spotify?.title && aiSuggestions.spotify.title !== metadata.title && (
                          <button onClick={() => setMetadata({ ...metadata, title: aiSuggestions.spotify.title })} style={spotifyStyle}>
                            SPOTIFY: {aiSuggestions.spotify.title}
                          </button>
                        )}
                        {aiSuggestions?.itunes?.title && aiSuggestions.itunes.title !== metadata.title && (
                          <button onClick={() => setMetadata({ ...metadata, title: aiSuggestions.itunes.title })} style={itunesStyle}>
                            ITUNES: {aiSuggestions.itunes.title}
                          </button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.title || ''} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>
                      Artista
                      <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                        {aiSuggestions?.spotify?.artist && aiSuggestions.spotify.artist !== metadata.artist && (
                          <button onClick={() => setMetadata({ ...metadata, artist: aiSuggestions.spotify.artist })} style={spotifyStyle}>
                            SPOTIFY: {aiSuggestions.spotify.artist}
                          </button>
                        )}
                        {aiSuggestions?.itunes?.artist && aiSuggestions.itunes.artist !== metadata.artist && (
                          <button onClick={() => setMetadata({ ...metadata, artist: aiSuggestions.itunes.artist })} style={itunesStyle}>
                            ITUNES: {aiSuggestions.itunes.artist}
                          </button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.artist || ''} onChange={(e) => setMetadata({ ...metadata, artist: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>
                      Álbum
                      <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                        {aiSuggestions?.spotify?.album && aiSuggestions.spotify.album !== metadata.album && (
                          <button onClick={() => setMetadata({ ...metadata, album: aiSuggestions.spotify.album })} style={spotifyStyle}>
                            SPOTIFY: {aiSuggestions.spotify.album}
                          </button>
                        )}
                        {aiSuggestions?.itunes?.album && aiSuggestions.itunes.album !== metadata.album && (
                          <button onClick={() => setMetadata({ ...metadata, album: aiSuggestions.itunes.album })} style={itunesStyle}>
                            ITUNES: {aiSuggestions.itunes.album}
                          </button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.album || ''} onChange={(e) => setMetadata({ ...metadata, album: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>
                      Año
                      <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                        {aiSuggestions?.itunes?.year && String(aiSuggestions.itunes.year) !== String(metadata.year) && (
                          <button onClick={() => setMetadata({ ...metadata, year: aiSuggestions.itunes.year })} style={itunesStyle}>
                            ITUNES: {aiSuggestions.itunes.year}
                          </button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.year || ''} onChange={(e) => setMetadata({ ...metadata, year: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>
                      Género
                      <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                        {aiSuggestions?.itunes?.genre && aiSuggestions.itunes.genre !== metadata.genre && (
                          <button onClick={() => setMetadata({ ...metadata, genre: aiSuggestions.itunes.genre })} style={itunesStyle}>
                            ITUNES: {aiSuggestions.itunes.genre}
                          </button>
                        )}
                      </div>
                    </label>
                    <input type="text" value={metadata.genre || ''} onChange={(e) => setMetadata({ ...metadata, genre: e.target.value })} className="admin-input" style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Duración (seg)</label>
                  <input type="text" value={metadata.duration || ''} readOnly className="admin-input" style={{ opacity: 0.7 }} />
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
                onChange={(e) => setMetadata({ ...metadata, lyrics: e.target.value })}
                className="admin-input"
                style={{ height: '180px', resize: 'none', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--accent-color)', marginBottom: '10px' }}>
                <ImageIcon size={16} /> Fondo TV (Fanart)
              </label>

              <div style={{ position: 'relative', height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '15px' }}>
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
                        setMetadata({ ...metadata, background_url: url });
                      }
                    }} />
                  </label>
                </div>
              </div>

              {/* GALERÍA DE FONDOS ENCONTRADOS */}
              {alternativeFanarts.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
                  {alternativeFanarts.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      onClick={() => setMetadata({ ...metadata, background_url: url })}
                      style={{
                        width: '80px', height: '45px', borderRadius: '6px', cursor: 'pointer', objectFit: 'cover',
                        border: metadata.background_url === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)',
                        opacity: metadata.background_url === url ? 1 : 0.6
                      }}
                    />
                  ))}
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
        </>
      )}

      {/* MODAL DE ESTADO MAESTRO - Movido fuera para ser global */}
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
