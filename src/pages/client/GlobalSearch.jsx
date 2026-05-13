import React, { useState } from 'react';
import { Search, Globe, Play, Heart, Loader2, Music } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import './GlobalSearch.css';

/**
 * GLOBAL SEARCH — MÚSICA DEL MUNDO (Streaming)
 * 
 * Permite buscar en YouTube y reproducir directamente.
 * Sin descargar nada, sin anuncios.
 */
export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const { playSong, currentSong, isPlaying, togglePlay } = usePlayerStore();
  const { likedSongs, toggleLike } = useLibraryStore();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    
    try {
      // Usamos una instancia pública de Piped (YouTube Proxy) para la búsqueda
      const res = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_videos`);
      const data = await res.json();
      
      // Mapeamos los resultados al formato que entiende nuestra app
      const formattedResults = data.items.map(item => ({
        id: item.url.split('=')[1] || item.url.split('/').pop(), // ID de YouTube
        title: item.title,
        artist: item.uploaderName,
        cover_url: item.thumbnail,
        // Generamos una URL de streaming directa (esto es lo que permite reproducir sin anuncios)
        url: `https://pipedapi.kavin.rocks/streams/${item.url.split('=')[1] || item.url.split('/').pop()}`,
        is_external: true, // Marca para saber que viene de YouTube
        duration_text: item.duration ? Math.floor(item.duration / 60) + ":" + (item.duration % 60).toString().padStart(2, '0') : ''
      }));

      setResults(formattedResults);
    } catch (error) {
      console.error("Error buscando música global:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
      return;
    }

    // Para obtener la URL real del stream (mp3/webm) necesitamos hacer un fetch al stream info
    setLoading(true);
    try {
        const res = await fetch(`https://pipedapi.kavin.rocks/streams/${song.id}`);
        const data = await res.json();
        
        // Buscamos el stream de audio con mejor calidad
        const audioStream = data.audioStreams.find(s => s.format === 'M4A' || s.format === 'WEBM') || data.audioStreams[0];
        
        if (audioStream) {
            playSong({
                ...song,
                url: audioStream.url // La URL real del audio
            });
        }
    } catch (err) {
        console.error("Error cargando stream:", err);
        alert("No se pudo cargar el audio de esta canción. Intenta con otra.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="global-search-page">
      
      <div className="gs-header">
        <div className="gs-title-row">
            <Globe className="gs-main-icon" size={32} />
            <h1 className="gs-title">Música Global</h1>
        </div>
        <p className="gs-subtitle">Busca y reproduce cualquier canción del mundo al instante.</p>

        <form className="gs-search-form" onSubmit={handleSearch}>
          <div className="gs-input-wrapper">
            <Search className="gs-input-icon" size={20} />
            <input 
              type="text" 
              placeholder="¿Qué quieres escuchar hoy?" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="gs-input"
            />
            {loading && <Loader2 className="gs-loader animate-spin" size={20} />}
          </div>
          <button type="submit" className="gs-submit-btn" disabled={loading}>
            Buscar
          </button>
        </form>
      </div>

      <div className="gs-results-container">
        {!searched && (
            <div className="gs-empty-state">
                <Music size={60} strokeWidth={1} />
                <h3>Explora millones de canciones</h3>
                <p>Busca artistas, álbumes o nombres de canciones.</p>
            </div>
        )}

        {searched && results.length === 0 && !loading && (
            <div className="gs-empty-state">
                <p>No encontramos resultados para tu búsqueda.</p>
            </div>
        )}

        <div className="gs-grid">
          {results.map((song) => {
            const isLiked = likedSongs.includes(song.id);
            const isActive = currentSong?.id === song.id;

            return (
              <div key={song.id} className={`gs-card ${isActive ? 'active' : ''}`}>
                <div className="gs-card-cover" onClick={() => handlePlay(song)}>
                  <img src={song.cover_url} alt={song.title} />
                  <div className="gs-card-overlay">
                    {isActive && isPlaying ? (
                        <div className="gs-playing-bars"><span></span><span></span><span></span></div>
                    ) : (
                        <Play fill="white" size={24} />
                    )}
                  </div>
                </div>
                
                <div className="gs-card-info">
                  <div className="gs-card-text">
                    <h4 title={song.title}>{song.title}</h4>
                    <p>{song.artist}</p>
                  </div>
                  
                  <button 
                    className={`gs-like-btn ${isLiked ? 'liked' : ''}`}
                    onClick={() => toggleLike(song.id, song)}
                  >
                    <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
