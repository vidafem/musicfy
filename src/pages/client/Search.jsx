import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Play, Heart, Music, Loader2, X } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { supabase } from '../../supabaseClient';
import './Search.css';

/**
 * BUSCADOR LOCAL — Busca canciones en la base de datos de Supabase.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const { currentSong, isPlaying, playSong, togglePlay } = usePlayerStore();
  const { likedSongs, toggleLike } = useSettingsStore();

  // Búsqueda en tiempo real con Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        performSearch();
      } else {
        setResults([]);
        setHasSearched(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const performSearch = async () => {
    setLoading(true);
    setHasSearched(true);
    
    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .or(`title.ilike.%${query}%,artist.ilike.%${query}%,album.ilike.%${query}%`)
        .limit(20);

      if (!error) {
        setResults(data || []);
      }
    } catch (err) {
      console.error("Error en la búsqueda:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSongClick = (song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      playSong(song);
    }
  };

  return (
    <div className="search-page">
      
      <div className="search-header">
        <h1 className="search-title">Buscar</h1>
        
        <div className="search-input-container">
          <SearchIcon className="search-bar-icon" size={20} />
          <input 
            type="text" 
            placeholder="¿Qué quieres escuchar hoy?" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-bar-input"
            autoFocus
          />
          {query && (
            <button className="search-clear-btn" onClick={() => setQuery('')}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="search-results">
        {loading && (
          <div className="search-status">
            <Loader2 className="animate-spin" size={32} />
            <p>Buscando en tu biblioteca...</p>
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div className="search-status">
            <Music size={40} opacity={0.3} />
            <p>No encontramos nada para "{query}"</p>
          </div>
        )}

        {!loading && !hasSearched && (
          <div className="search-status">
            <SearchIcon size={40} opacity={0.1} />
            <p>Encuentra tus artistas, canciones o álbumes favoritos.</p>
          </div>
        )}

        <div className="search-results-list">
          {results.map((song) => {
            const isActive = currentSong?.id === song.id;
            const isLiked = likedSongs.includes(song.id);
            
            return (
              <div 
                key={song.id} 
                className={`search-result-row ${isActive ? 'active' : ''}`}
                onClick={() => handleSongClick(song)}
              >
                <div className="search-result-cover">
                  <img src={song.cover_url} alt={song.title} />
                  <div className="search-result-overlay">
                    {isActive && isPlaying ? (
                       <div className="mini-bars"><span /><span /><span /></div>
                    ) : (
                       <Play size={14} fill="white" />
                    )}
                  </div>
                </div>

                <div className="search-result-info">
                  <span className={`search-result-name ${isActive ? 'active' : ''}`}>{song.title}</span>
                  <span className="search-result-artist">{song.artist}</span>
                </div>

                <button 
                  className={`search-result-like ${isLiked ? 'liked' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}
                >
                  <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
