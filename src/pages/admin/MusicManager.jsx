import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Music, Image as ImageIcon, Save, X, Loader2, Sparkles, CheckCircle } from 'lucide-react';
import * as jsmediatags from 'jsmediatags';

export default function MusicManager() {
  const [file, setFile] = useState(null);
  const [metadata, setMetadata] = useState({ title: '', artist: '', album: '' });
  const [coverUrl, setCoverUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'uploading', 'success', 'error'

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

        setMetadata({
          title: title || file.name.replace(/\.[^/.]+$/, ""),
          artist: artist || 'Artista Desconocido',
          album: album || 'Sencillo'
        });
        
        if (imageUrl) setCoverUrl(imageUrl);
        setIsProcessing(false);
      },
      onError: function(error) {
        console.log('Error reading tags:', error);
        // Fallback simple
        setMetadata({
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: 'Artista Desconocido',
          album: 'Sencillo'
        });
        setIsProcessing(false);
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
      // AQUÍ IRÁ LA LÓGICA REAL:
      // 1. Subir file a Cloudflare R2 (aws-sdk/client-s3)
      // 2. Subir coverUrl a Cloudflare R2
      // 3. Insertar registro en Supabase (título, artista, urls)
      
      // Simulamos la subida por ahora (esperando tus credenciales)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setUploadStatus('success');
      setTimeout(() => {
        handleCancel(); // Limpiar después del éxito
      }, 3000);
    } catch (error) {
      setUploadStatus('error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>Gestión de Música e IA</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>Sube MP3 a Cloudflare R2, extrae metadatos y guarda en Supabase.</p>
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
            {isDragActive ? 'Suelta el MP3 aquí...' : 'Arrastra o haz clic para subir un MP3'}
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '400px', margin: '0 auto' }}>
            Nuestro motor extraerá automáticamente el Nombre, Artista y Carátula incrustada antes de subirlo a Cloudflare.
          </p>
        </div>
      )}

      {isProcessing && (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Loader2 size={40} className="spinner" style={{ animation: 'spin 1s linear infinite', color: '#00ffff', marginBottom: '20px' }} />
          <h3>La IA está analizando el audio...</h3>
        </div>
      )}

      {file && !isProcessing && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '30px',
          display: 'flex',
          gap: '30px'
        }}>
          
          {/* Previsualización de Carátula */}
          <div style={{ width: '200px', flexShrink: 0 }}>
            {coverUrl ? (
              <img src={coverUrl} alt="Carátula detectada" style={{ width: '100%', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
            ) : (
              <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'rgba(255,255,255,0.3)' }}>
                <ImageIcon size={40} style={{ marginBottom: '10px' }} />
                <span>Sin Carátula</span>
              </div>
            )}
            <button style={{ width: '100%', marginTop: '15px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>
              Cambiar Imagen
            </button>
          </div>

          {/* Formulario de Edición */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle size={20} color="#00ffff" /> Metadatos Detectados
              </h3>
              <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Archivo Original</label>
                <div style={{ padding: '12px', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Título de la Canción</label>
                <input 
                  type="text" 
                  value={metadata.title}
                  onChange={(e) => setMetadata({...metadata, title: e.target.value})}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '1rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Artista</label>
                <input 
                  type="text" 
                  value={metadata.artist}
                  onChange={(e) => setMetadata({...metadata, artist: e.target.value})}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '1rem' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
              <button 
                onClick={handleUpload}
                disabled={uploadStatus === 'uploading' || uploadStatus === 'success'}
                style={{ 
                  flex: 1, background: uploadStatus === 'success' ? '#00e676' : '#00ffff', color: 'black', border: 'none', 
                  padding: '14px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
                  opacity: uploadStatus === 'uploading' ? 0.7 : 1
                }}
              >
                {uploadStatus === 'uploading' ? (
                  <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Subiendo a Cloudflare...</>
                ) : uploadStatus === 'success' ? (
                  <><CheckCircle size={20} /> ¡Subida Exitosa!</>
                ) : (
                  <><Save size={20} /> Guardar Canción</>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
