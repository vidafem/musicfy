import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  CheckCircle,
  Edit3,
  Image as ImageIcon,
  Loader2,
  Music,
  Save,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import * as jsmediatags from 'jsmediatags';
import { useMusicActions } from '../../hooks/useMusicActions';
import { useMusicAI } from '../../hooks/useMusicAI';
import { useMusicTags } from '../../hooks/useMusicTags';
import { fetchFromPiped } from '../../utils/pipedService';
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

const spotifyStyle = {
  ...suggestionBtnStyle,
  background: 'rgba(30, 215, 96, 0.1)',
  borderColor: '#1ed760',
  color: '#1ed760'
};

const itunesStyle = {
  ...suggestionBtnStyle,
  background: 'rgba(250, 45, 114, 0.1)',
  borderColor: '#fa2d72',
  color: '#fa2d72'
};

const makeRowId = () => `row_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

const parseAudioMetadata = (file) =>
  new Promise((resolve) => {
    let done = false;

    const resolveOnce = (payload) => {
      if (done) return;
      done = true;
      resolve(payload);
    };

    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;

    const safeResolve = (duration = 0) =>
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          const { title, artist, album, year, genre, picture } = tag.tags;

          let imageUrl = null;
          if (picture) {
            const { data, format } = picture;
            let base64String = '';
            for (let i = 0; i < data.length; i += 1) {
              base64String += String.fromCharCode(data[i]);
            }
            imageUrl = `data:${format};base64,${window.btoa(base64String)}`;
          }

          URL.revokeObjectURL(objectUrl);
          resolveOnce({
            metadata: {
              title: title || file.name.replace(/\.[^/.]+$/, ''),
              artist: artist || 'Artista Desconocido',
              album: album || '',
              year: year || '',
              genre: genre || '',
              lyrics: '',
              background_url: '',
              duration,
              animated: false,
              video_url: ''
            },
            coverUrl: imageUrl
          });
        },
        onError: () => {
          URL.revokeObjectURL(objectUrl);
          resolveOnce({
            metadata: {
              title: file.name.replace(/\.[^/.]+$/, ''),
              artist: 'Artista Desconocido',
              album: '',
              year: '',
              genre: '',
              lyrics: '',
              background_url: '',
              duration,
              animated: false,
              video_url: ''
            },
            coverUrl: null
          });
        }
      });

    audio.onloadedmetadata = () => {
      const duration = Math.floor(audio.duration || 0);
      safeResolve(duration);
    };

    audio.onerror = () => safeResolve(0);
    setTimeout(() => safeResolve(0), 8000);
  });

const getStatusLabel = (row) => {
  if (row.status === 'preloading') return 'Precargando IA';
  if (row.status === 'reviewed') return 'Revisado';
  if (row.status === 'uploading') return 'Subiendo';
  if (row.status === 'done') return 'Guardado';
  if (row.status === 'error') return `Error: ${row.error}`;
  return 'Listo';
};

export default function BulkUploadManager() {
  const [rows, setRows] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [draft, setDraft] = useState(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const [draftOriginalCoverBackup, setDraftOriginalCoverBackup] = useState(null);
  const [draftBackupMetadata, setDraftBackupMetadata] = useState(null);
  const [filters] = useState({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });

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

  const { uploadSong } = useMusicActions();
  const { fetchSyncedLyricsOnly } = useMusicTags();
  const {
    isAISearching,
    aiSuggestions,
    alternativeCovers,
    alternativeFanarts,
    fetchAIData,
    fetchAIVisuals,
    prefetchSongAssets,
    setAiSuggestions,
    setAlternativeCovers,
    setAlternativeFanarts
  } = useMusicAI();

  const queuedRows = useMemo(() => rows.filter((row) => row.status !== 'done'), [rows]);

  useEffect(() => {
    if (!editingRow) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [editingRow]);

  const prefetchRowAssets = useCallback(
    async (row) => {
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                status: 'preloading',
                progress: Math.max(15, item.progress || 0),
                error: null
              }
            : item
        )
      );

      let lyrics = null;
      let aiSnapshot = { suggestions: null, covers: [], fanarts: [] };

      try {
        [lyrics, aiSnapshot] = await Promise.all([
          fetchSyncedLyricsOnly(row.metadata.title, row.metadata.artist || ''),
          prefetchSongAssets({
            title: row.metadata.title,
            artist: row.metadata.artist,
            year: row.metadata.year,
            coverUrl: row.coverUrl,
            album: row.metadata.album
          })
        ]);
      } catch {
        // noop: dejamos datos locales y marcamos 50% como "precarga terminada"
      }

      setRows((prev) =>
        prev.map((item) => {
          if (item.id !== row.id) return item;

          const mergedLyrics = lyrics || item.metadata.lyrics || '';
          const covers = aiSnapshot?.covers?.length ? aiSnapshot.covers : item.aiCovers || [];
          const fanarts = aiSnapshot?.fanarts?.length ? aiSnapshot.fanarts : item.aiFanarts || [];
          const backgroundFromAi = item.metadata.background_url || fanarts[0] || '';

          return {
            ...item,
            status: item.reviewed ? 'reviewed' : 'ready',
            progress: Math.max(50, item.progress || 0),
            metadata: {
              ...item.metadata,
              lyrics: mergedLyrics,
              background_url: backgroundFromAi
            },
            aiSuggestions: aiSnapshot?.suggestions || item.aiSuggestions || null,
            aiCovers: covers,
            aiFanarts: fanarts,
            coverUrl: item.coverUrl || covers[0] || null
          };
        })
      );
    },
    [fetchSyncedLyricsOnly, prefetchSongAssets]
  );

  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (!acceptedFiles?.length) return;
      setIsParsing(true);
      setSummary(null);

      const parsedRows = await Promise.all(
        acceptedFiles.map(async (file) => {
          const { metadata, coverUrl } = await parseAudioMetadata(file);
          return {
            id: makeRowId(),
            file,
            metadata,
            coverUrl,
            progress: 5,
            status: 'preloading',
            error: null,
            reviewed: false,
            aiSuggestions: null,
            aiCovers: coverUrl ? [coverUrl] : [],
            aiFanarts: []
          };
        })
      );

      setRows((prev) => [...prev, ...parsedRows]);
      setIsParsing(false);

      // No prefetch automático durante la carga masiva para evitar saturar
      // el worker de IA y disparar 429. La IA se carga bajo demanda.
    },
    [prefetchRowAssets]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] },
    multiple: true
  });

  const removeRow = (id) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const closeEdit = () => {
    setEditingRow(null);
    setDraft(null);
    setDraftOriginalCoverBackup(null);
    setDraftBackupMetadata(null);
    setAiSuggestions(null);
    setAlternativeCovers([]);
    setAlternativeFanarts([]);
    setVideoSuggestions([]);
  };

  const openEdit = (row) => {
    setEditingRow(row.id);
    setDraft({
      ...row,
      metadata: { ...row.metadata }
    });
    setDraftBackupMetadata({ ...row.metadata });
    setDraftOriginalCoverBackup(row.coverUrl);
    setAiSuggestions(row.aiSuggestions || null);
    setAlternativeCovers(
      row.aiCovers?.length
        ? row.aiCovers
        : row.coverUrl
          ? [row.coverUrl]
          : []
    );
    setAlternativeFanarts(
      row.aiFanarts?.length
        ? row.aiFanarts
        : row.metadata.background_url
          ? [row.metadata.background_url]
          : []
    );
  };

  const applyDraftField = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [field]: value
      }
    }));
  };

  const saveEdit = () => {
    if (!draft) return;
    setRows((prev) =>
      prev.map((row) =>
        row.id === draft.id
          ? {
              ...row,
              metadata: { ...draft.metadata },
              coverUrl: draft.coverUrl,
              reviewed: true,
              status: row.status === 'done' ? 'done' : 'reviewed',
              progress: row.status === 'done' ? 100 : Math.max(75, row.progress || 0),
              aiSuggestions: aiSuggestions || row.aiSuggestions || null,
              aiCovers: alternativeCovers.length ? alternativeCovers : row.aiCovers || [],
              aiFanarts: alternativeFanarts.length ? alternativeFanarts : row.aiFanarts || []
            }
          : row
      )
    );
    closeEdit();
  };

  const revertDraft = () => {
    if (!draft || !draftBackupMetadata) return;
    setDraft((prev) => ({
      ...prev,
      metadata: {
        ...draftBackupMetadata,
        lyrics: prev.metadata.lyrics,
        duration: prev.metadata.duration
      },
      coverUrl: draftOriginalCoverBackup
    }));
  };

  const reloadDraftLyrics = async () => {
    if (!draft?.metadata?.title) return;
    const lyrics = await fetchSyncedLyricsOnly(draft.metadata.title, draft.metadata.artist || '');
    if (lyrics) applyDraftField('lyrics', lyrics);
  };

  const refreshDraftSuggestions = async () => {
    if (!draft?.metadata?.title) return;
    const suggestions = await fetchAIData(draft.metadata.title, draft.metadata.artist);
    if (!suggestions) return;
    setRows((prev) =>
      prev.map((row) =>
        row.id === draft.id ? { ...row, aiSuggestions: suggestions } : row
      )
    );
  };

  const refreshDraftVisuals = async () => {
    if (!draft?.metadata?.title) return;
    const snapshot = await fetchAIVisuals(
      draft.metadata.title,
      draft.metadata.artist,
      draft.metadata.year,
      draftOriginalCoverBackup,
      draft.metadata.album
    );
    if (!snapshot) return;
    setRows((prev) =>
      prev.map((row) =>
        row.id === draft.id
          ? {
              ...row,
              aiCovers: snapshot.covers || row.aiCovers || [],
              aiFanarts: snapshot.fanarts || row.aiFanarts || []
            }
          : row
      )
    );
  };

  const handleSaveAll = async () => {
    if (!queuedRows.length || batchSaving) return;
    setBatchSaving(true);
    setSummary(null);

    const startedAt = Date.now();
    let success = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.status === 'done') continue;

      const uploadBase = row.reviewed ? 75 : Math.max(50, row.progress || 50);

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, status: 'uploading', progress: uploadBase, error: null }
            : item
        )
      );

      try {
        console.log(`[Batch] 🔄 Procesando canción ${i + 1}/${rows.length}: ${row.metadata.title}`);
        
        await uploadSong({
          file: row.file,
          metadata: row.metadata,
          coverUrl: row.coverUrl,
          currentSessionTimestamp: startedAt + i,
          onProgress: (progress) => {
            setRows((prev) =>
              prev.map((item) =>
                item.id === row.id
                  ? {
                      ...item,
                      progress: Math.max(
                        uploadBase,
                        Math.min(100, Math.round(uploadBase + ((100 - uploadBase) * progress) / 100))
                      )
                    }
                  : item
              )
            );
          }
        });

        success += 1;
        setRows((prev) =>
          prev.map((item) =>
            item.id === row.id ? { ...item, status: 'done', progress: 100, error: null } : item
          )
        );

        // PAUSA DE SEGURIDAD EXTENDIDA: 3 segundos para que Supabase libere el pool
        if (i < rows.length - 1) {
          console.log(`[Batch] 😴 Pausa de seguridad (3s) tras canción ${i + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(`[Batch] Error subiendo canción ${row.metadata.title}:`, error);
        failed += 1;
        setRows((prev) =>
          prev.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  status: 'error',
                  error: error?.message || 'Error durante guardado',
                  progress: 0
                }
              : item
          )
        );
      }
    }

    setSummary({ success, failed });
    setBatchSaving(false);
  };

  const clearList = () => {
    setRows([]);
    setSummary(null);
  };

  return (
    <div style={{ width: '100%', animation: 'fadeIn 0.5s ease' }}>
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
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--accent-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--accent-color)',
            boxShadow: '0 0 20px var(--accent-glow)'
          }}
        >
          <Sparkles size={40} />
        </div>
        <h3 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>
          {isDragActive ? 'Suelta los archivos aqui...' : 'Arrastra o haz clic para subida masiva'}
        </h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '620px', margin: '0 auto' }}>
          Precargamos metadata local de cada archivo y tambien intentamos cargar letras sincronizadas
          para cada cancion.
        </p>
      </div>

      {isParsing && (
        <div className="admin-loading-overlay">
          <div className="admin-loading-card">
            <Loader2
              size={40}
              className="spinner"
              style={{
                animation: 'spin 1s linear infinite',
                color: 'var(--accent-color)',
                marginBottom: '20px'
              }}
            />
            <h3 style={{ margin: 0 }}>Analizando archivos...</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '10px' }}>
              Estamos leyendo metadata, portada y letras automaticamente.
            </p>
          </div>
        </div>
      )}

      <div className="dashboard-section" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '10px' }}>Archivo</th>
              <th style={{ padding: '10px' }}>Titulo</th>
              <th style={{ padding: '10px' }}>Artista</th>
              <th style={{ padding: '10px' }}>Duracion</th>
              <th style={{ padding: '10px' }}>Progreso</th>
              <th style={{ padding: '10px' }}>Estado</th>
              <th style={{ padding: '10px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '10px' }}>{row.file.name}</td>
                <td style={{ padding: '10px' }}>{row.metadata.title}</td>
                <td style={{ padding: '10px' }}>{row.metadata.artist}</td>
                <td style={{ padding: '10px' }}>{row.metadata.duration || 0}s</td>
                <td style={{ padding: '10px', width: '220px' }}>
                  <div
                    style={{
                      width: '200px',
                      height: '8px',
                      background: 'rgba(255,255,255,0.12)',
                      borderRadius: '6px'
                    }}
                  >
                    <div
                      style={{
                        width: `${row.progress || 0}%`,
                        height: '100%',
                        borderRadius: '6px',
                        background: row.status === 'error' ? '#ff4d4f' : 'var(--accent-color)',
                        transition: 'width 0.2s ease'
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.72rem', marginTop: '5px', color: 'rgba(255,255,255,0.6)' }}>
                    {Math.round(row.progress || 0)}%
                  </div>
                </td>
                <td style={{ padding: '10px' }}>{getStatusLabel(row)}</td>
                <td style={{ padding: '10px', display: 'flex', gap: '8px' }}>
                  <button
                    className="admin-logout-btn"
                    onClick={() => openEdit(row)}
                    title="Editar fila"
                    disabled={batchSaving || row.status === 'uploading'}
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    className="admin-logout-btn"
                    onClick={() => removeRow(row.id)}
                    title="Borrar fila"
                    disabled={batchSaving || row.status === 'uploading'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  Todavia no hay archivos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px' }}>
        <div style={{ color: 'rgba(255,255,255,0.7)' }}>
          {summary ? `Guardadas: ${summary.success} | Fallidas: ${summary.failed}` : `${queuedRows.length} pendientes`}
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {summary && (
            <button
              className="admin-logout-btn"
              onClick={clearList}
              style={{ padding: '0 25px', height: '54px', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Trash2 size={18} /> Limpiar lista
            </button>
          )}
          <button
            className="main-save-btn"
            onClick={handleSaveAll}
            disabled={batchSaving || queuedRows.length === 0}
            style={{ width: '320px' }}
          >
            {batchSaving ? <Loader2 size={20} className="spinner" /> : <Save size={20} />}
            {batchSaving ? 'Guardando lote...' : 'Guardar todo'}
          </button>
        </div>
      </div>

      {editingRow && draft && (
        <div
          className="admin-loading-overlay"
          style={{
            zIndex: 3500,
            padding: '24px',
            alignItems: 'flex-start',
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.88)'
          }}
        >
          <div
            className="dashboard-section"
            style={{
              width: '100%',
              maxWidth: '1180px',
              margin: '30px auto',
              position: 'relative',
              background: '#090d12',
              border: '1px solid rgba(255,255,255,0.12)'
            }}
          >
            <button onClick={closeEdit} className="close-btn-generic">
              <X size={18} />
            </button>

            <div className="manager-form-container">
              <div className="manager-cover-preview" style={{ width: '100%', maxWidth: '240px' }}>
                <div className={`premium-cover-container ${draft.metadata.animated ? 'ia-animated' : ''}`}>
                  {draft.coverUrl ? (
                    <>
                      {draft.coverUrl.includes('.mp4') || draft.coverUrl.startsWith('data:video') ? (
                        <video
                          src={draft.coverUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <img
                          src={draft.coverUrl}
                          alt="Caratula"
                          className="animated-cover"
                          style={{
                            width: '100%',
                            display: 'block',
                            filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) blur(${filters.blur}px)`
                          }}
                        />
                      )}
                      <div className="shine-overlay" />
                      {draft.metadata.animated && <div className="sparkle-particles" />}
                    </>
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        color: 'rgba(255,255,255,0.3)'
                      }}
                    >
                      <ImageIcon size={40} style={{ marginBottom: '10px' }} />
                      <span>Sin visual</span>
                    </div>
                  )}
                </div>

                {alternativeCovers.length > 1 && (
                  <div style={{ marginBottom: '20px' }}>
                    <p
                      style={{
                        fontSize: '0.65rem',
                        color: 'var(--accent-color)',
                        margin: '0 0 10px 0',
                        fontWeight: 'bold'
                      }}
                    >
                      CAMBIAR PORTADA
                    </p>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
                      {alternativeCovers.map((url, idx) => (
                        <img
                          key={`cover-${idx}`}
                          src={url}
                          alt={`cover-${idx}`}
                          onClick={() => setDraft((prev) => ({ ...prev, coverUrl: url }))}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: draft.coverUrl === url ? '2px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)',
                            opacity: draft.coverUrl === url ? 1 : 0.6
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => applyDraftField('animated', !draft.metadata.animated)}
                  className={`ai-anim-btn ${draft.metadata.animated ? 'active' : ''}`}
                >
                  <Sparkles size={14} />
                  {draft.metadata.animated ? 'ANIMACION ACTIVA' : 'PROCESAR ANIMACION IA'}
                </button>

                <label className="upload-mini-btn">
                  CAMBIAR PORTADA
                  <input
                    type="file"
                    accept="image/*,video/mp4"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setDraft((prev) => ({
                          ...prev,
                          coverUrl: URL.createObjectURL(file)
                        }));
                      }
                    }}
                  />
                </label>
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '1.1rem'
                    }}
                  >
                    <CheckCircle size={20} color="var(--accent-color)" /> Clasificacion Inteligente
                  </h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={refreshDraftSuggestions}
                      disabled={isAISearching}
                      className="ai-action-btn"
                    >
                      {isAISearching ? <Loader2 size={12} className="spinner" /> : <Sparkles size={12} />}
                      1. BUSCAR DATOS
                    </button>
                    <button
                      onClick={refreshDraftVisuals}
                      disabled={isAISearching}
                      className="ai-action-btn accent"
                    >
                      {isAISearching ? <Loader2 size={12} className="spinner" /> : <ImageIcon size={12} />}
                      2. BUSCAR IMAGENES
                    </button>
                    <button onClick={revertDraft} className="ai-action-btn danger">
                      REVERTIR
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '15px',
                    marginBottom: '15px'
                  }}
                >
                  <div>
                    <label className="admin-label">
                      Titulo
                      <div className="suggestion-box">
                        {aiSuggestions?.spotify?.title &&
                          aiSuggestions.spotify.title !== draft.metadata.title && (
                            <button
                              onClick={() => applyDraftField('title', aiSuggestions.spotify.title)}
                              style={spotifyStyle}
                            >
                              SPOTIFY: {aiSuggestions.spotify.title}
                            </button>
                          )}
                        {aiSuggestions?.itunes?.title && aiSuggestions.itunes.title !== draft.metadata.title && (
                          <button
                            onClick={() => applyDraftField('title', aiSuggestions.itunes.title)}
                            style={itunesStyle}
                          >
                            ITUNES: {aiSuggestions.itunes.title}
                          </button>
                        )}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={draft.metadata.title || ''}
                      onChange={(event) => applyDraftField('title', event.target.value)}
                      className="admin-input"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="admin-label">
                      Artista
                      <div className="suggestion-box">
                        {aiSuggestions?.spotify?.artist &&
                          aiSuggestions.spotify.artist !== draft.metadata.artist && (
                            <button
                              onClick={() => applyDraftField('artist', aiSuggestions.spotify.artist)}
                              style={spotifyStyle}
                            >
                              SPOTIFY: {aiSuggestions.spotify.artist}
                            </button>
                          )}
                        {aiSuggestions?.itunes?.artist &&
                          aiSuggestions.itunes.artist !== draft.metadata.artist && (
                            <button
                              onClick={() => applyDraftField('artist', aiSuggestions.itunes.artist)}
                              style={itunesStyle}
                            >
                              ITUNES: {aiSuggestions.itunes.artist}
                            </button>
                          )}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={draft.metadata.artist || ''}
                      onChange={(event) => applyDraftField('artist', event.target.value)}
                      className="admin-input"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '15px',
                    marginBottom: '20px'
                  }}
                >
                  <div>
                    <label className="admin-label">
                      Album
                      <div className="suggestion-box">
                        {aiSuggestions?.spotify?.album &&
                          aiSuggestions.spotify.album !== draft.metadata.album && (
                            <button
                              onClick={() => applyDraftField('album', aiSuggestions.spotify.album)}
                              style={spotifyStyle}
                            >
                              SPOTIFY: {aiSuggestions.spotify.album}
                            </button>
                          )}
                        {aiSuggestions?.itunes?.album &&
                          aiSuggestions.itunes.album !== draft.metadata.album && (
                            <button
                              onClick={() => applyDraftField('album', aiSuggestions.itunes.album)}
                              style={itunesStyle}
                            >
                              ITUNES: {aiSuggestions.itunes.album}
                            </button>
                          )}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={draft.metadata.album || ''}
                      onChange={(event) => applyDraftField('album', event.target.value)}
                      className="admin-input"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="admin-label">
                      Ano
                      {aiSuggestions?.itunes?.year &&
                        String(aiSuggestions.itunes.year) !== String(draft.metadata.year) && (
                          <button
                            onClick={() => applyDraftField('year', aiSuggestions.itunes.year)}
                            style={itunesStyle}
                          >
                            ITUNES: {aiSuggestions.itunes.year}
                          </button>
                        )}
                    </label>
                    <input
                      type="text"
                      value={draft.metadata.year || ''}
                      onChange={(event) => applyDraftField('year', event.target.value)}
                      className="admin-input"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="admin-label">
                      Genero
                      {aiSuggestions?.itunes?.genre && aiSuggestions.itunes.genre !== draft.metadata.genre && (
                        <button
                          onClick={() => applyDraftField('genre', aiSuggestions.itunes.genre)}
                          style={itunesStyle}
                        >
                          ITUNES: {aiSuggestions.itunes.genre}
                        </button>
                      )}
                    </label>
                    <input
                      type="text"
                      value={draft.metadata.genre || ''}
                      onChange={(event) => applyDraftField('genre', event.target.value)}
                      className="admin-input"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px' }}>
                  <div>
                    <label className="admin-label">Duracion (seg)</label>
                    <input
                      type="text"
                      value={draft.metadata.duration || 0}
                      readOnly
                      className="admin-input"
                      style={{ ...inputStyle, opacity: 0.7 }}
                    />
                  </div>
                  <div>
                    <label className="admin-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Enlace de Video (YouTube/MP4)</span>
                      <button
                        type="button"
                        onClick={() => searchVideoSuggestions(draft.metadata.title, draft.metadata.artist)}
                        disabled={searchingVideo || !draft.metadata.title}
                        className="ai-action-btn"
                        style={{ padding: '2px 8px', fontSize: '0.65rem', border: '1px solid var(--accent-color)', height: '20px' }}
                      >
                        {searchingVideo ? <Loader2 size={10} className="spinner" /> : <Sparkles size={10} />}
                        BUSCAR VIDEO IA
                      </button>
                    </label>
                    <input
                      type="text"
                      value={draft.metadata.video_url || ''}
                      onChange={(event) => applyDraftField('video_url', event.target.value)}
                      className="admin-input"
                      style={inputStyle}
                      placeholder="Ej: https://www.youtube.com/watch?v=..."
                    />
                    
                    {videoSuggestions.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'grid', gap: '5px', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <p style={{ fontSize: '0.65rem', color: 'var(--accent-color)', margin: '0 0 5px 0', fontWeight: 'bold' }}>SUGERENCIAS ENCONTRADAS:</p>
                        {videoSuggestions.map(vid => (
                          <button
                            key={vid.id}
                            type="button"
                            onClick={() => {
                              applyDraftField('video_url', `https://www.youtube.com/watch?v=${vid.id}`);
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
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '30px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingTop: '30px',
                marginTop: '20px'
              }}
            >
              <div>
                <label className="section-label">
                  <Music size={16} /> Letras Sincronizadas
                </label>
                <textarea
                  value={draft.metadata.lyrics || ''}
                  onChange={(event) => applyDraftField('lyrics', event.target.value)}
                  className="admin-input"
                  style={{ height: '180px', resize: 'none', fontSize: '0.85rem' }}
                />
                <button
                  onClick={reloadDraftLyrics}
                  className="ai-action-btn"
                  style={{ marginTop: '10px' }}
                  disabled={isAISearching}
                >
                  {isAISearching ? <Loader2 size={12} className="spinner" /> : <Sparkles size={12} />}
                  RECARGAR LETRAS
                </button>
              </div>
              <div>
                <label className="section-label">
                  <ImageIcon size={16} /> Fondo TV (Fanart)
                </label>
                <div className="bg-preview-box">
                  {draft.metadata.background_url ? (
                    <img src={draft.metadata.background_url} alt="Fanart" />
                  ) : (
                    <div>Sin fondo seleccionado</div>
                  )}
                  <label className="upload-overlay-btn">
                    SUBIR FONDO
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) applyDraftField('background_url', URL.createObjectURL(file));
                      }}
                    />
                  </label>
                </div>

                {alternativeFanarts.length > 0 && (
                  <div className="fanart-gallery">
                    {alternativeFanarts.map((url, idx) => (
                      <img
                        key={`fanart-${idx}`}
                        src={url}
                        alt={`fanart-${idx}`}
                        onClick={() => applyDraftField('background_url', url)}
                        className={draft.metadata.background_url === url ? 'active' : ''}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
              <button className="admin-logout-btn" onClick={closeEdit}>
                Cancelar
              </button>
              <button className="main-save-btn" style={{ width: '280px' }} onClick={saveEdit}>
                <Save size={18} /> Guardar cambios de fila
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .premium-cover-container.ia-animated { border: 2px solid var(--accent-color); box-shadow: 0 0 30px var(--accent-glow); }
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
