import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, Play, Heart, Music, Loader2, X, Mic2, Radio, Video, Headphones } from 'lucide-react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { supabase } from '../../supabaseClient';
import './Search.css';

const GENRE_CONFIG = {
  'Reggaetón': { color: '#EB1E32', icon: 'Mic2' },
  'Reggaeton': { color: '#EB1E32', icon: 'Mic2' },
  'Pop': { color: '#8C19FF', icon: 'Headphones' },
  'Trap': { color: '#1DB954', icon: 'Music' },
  'Hip Hop': { color: '#F59B23', icon: 'Mic2' },
  'Electrónica': { color: '#477DFF', icon: 'Radio' },
  'K-Pop': { color: '#FF4632', icon: 'Headphones' },
  'R&B': { color: '#16A39A', icon: 'Music' },
  'Rock': { color: '#213165', icon: 'Music' },
  'Salsa': { color: '#8D67AD', icon: 'Music' },
  'Bachata': { color: '#E8115B', icon: 'Music' },
  'Vallenato': { color: '#F037A5', icon: 'Music' },
  'Dembow': { color: '#BC5900', icon: 'Music' },
  'Urbano': { color: '#1DB954', icon: 'Music' },
  'Urbano latino': { color: '#00A38D', icon: 'Music' },
  'Pop Latino': { color: '#E8115B', icon: 'Music' },
  'Jazz': { color: '#1E3264', icon: 'Music' },
  'Clásica': { color: '#7D4B32', icon: 'Music' },
  'Metal': { color: '#E91429', icon: 'Music' },
  'Lo-Fi': { color: '#A56752', icon: 'Music' },
  'Regional Mexicano': { color: '#D84000', icon: 'Music' }
};

const getGenreStyle = (genre = '') => {
  const normalized = genre.trim();
  // Búsqueda insensible a mayúsculas
  const foundKey = Object.keys(GENRE_CONFIG).find(k => k.toLowerCase() === normalized.toLowerCase());
  return GENRE_CONFIG[foundKey || normalized] || { color: '#535353', icon: 'Music' };
};

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState('Música');

  const { currentSong, isPlaying, playSong, togglePlay } = usePlayerStore();
  const { likedSongs, toggleLike } = useLibraryStore();

  useEffect(() => {
    fetchGenres();
  }, []);

  const fetchGenres = async () => {
    try {
      // Obtenemos géneros únicos directamente de la tabla songs
      const { data, error } = await supabase
        .from('songs')
        .select('genre');
      
      if (!error && data) {
        const uniqueGenres = [...new Set(data.map(s => s.genre).filter(Boolean))];
        setGenres(uniqueGenres);
      }
    } catch (err) {
      console.error("Error fetching genres:", err);
    }
  };

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
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      console.log("[Search] Iniciando búsqueda para:", query, "Filtro:", activeFilter);
      
      let request = supabase
        .from('songs')
        .select('*');

      // Aplicar filtros de categoría
      if (activeFilter === 'Videos') {
        request = request.eq('is_video', true);
      } else if (activeFilter === 'Música') {
        request = request.eq('is_video', false);
      }

      // Búsqueda en múltiples campos
      const { data, error } = await request
        .or(`title.ilike.%${query}%,artist.ilike.%${query}%,genre.ilike.%${query}%,album.ilike.%${query}%`)
        .limit(40);

      if (error) {
        console.error("Error de Supabase en búsqueda:", error);
        setResults([]);
      } else {
        console.log(`Búsqueda terminada: ${data?.length || 0} resultados encontrados.`);
        setResults(data || []);
      }
    } catch (err) {
      console.error("Error crítico en performSearch:", err);
    } finally {
      setLoading(false);
    }
  };

  // Re-ejecutar búsqueda si cambia el filtro
  useEffect(() => {
    if (query.trim()) {
      performSearch();
    }
  }, [activeFilter]);

  return (
    <div className="search-page">
      <div className="search-header">
        <h1 className="search-title">Buscar</h1>
        
        <div className="search-input-wrapper">
          <SearchIcon className="search-bar-icon" size={20} />
          <input 
            type="text" 
            placeholder="¿Qué quieres escuchar hoy?" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-bar-input"
          />
          {query && <X size={20} className="clear-search" onClick={() => setQuery('')} />}
        </div>

        <div className="search-filters-chips">
          {['Música', 'Videos'].map(filter => (
            <button 
              key={filter}
              className={`filter-chip ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="search-content">
        {!hasSearched ? (
          <div className="explore-section">
            <h2 className="section-title">Explorar todo</h2>
            <div className="genre-grid">
              {genres.length > 0 ? (
                genres.map(genre => {
                  const style = getGenreStyle(genre);
                  return (
                    <div 
                      key={genre} 
                      className="genre-card"
                      style={{ backgroundColor: style.color }}
                      onClick={() => setQuery(genre)}
                    >
                      <span className="genre-name">{genre}</span>
                      <div className="genre-img-container">
                         <Music size={60} className="genre-icon-bg" />
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Skeleton / Fallback con datos reales simulados si la DB está vacía */
                ['Reggaetón', 'Pop', 'Trap', 'Salsa', 'Rock', 'Vallenato'].map(g => (
                    <div key={g} className="genre-card" style={{ backgroundColor: getGenreStyle(g).color }}>
                        <span className="genre-name">{g}</span>
                        <Music size={60} className="genre-icon-bg" />
                    </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="search-results">
            {loading ? (
              <div className="loading-state"><Loader2 className="animate-spin" /></div>
            ) : results.length > 0 ? (
              <div className="results-list">
                {results.map(song => (
                  <div key={song.id} className="search-song-row" onClick={() => playSong(song)}>
                    <img src={song.cover_url} alt="" />
                    <div className="song-info">
                      <span className="song-title">{song.title}</span>
                      <div className="song-artists-links">
                        {song.artist.split(/[,&/]| ft\. | feat\. /i).map((name, i, arr) => (
                          <React.Fragment key={name.trim()}>
                            <span 
                              className="artist-link" 
                              onClick={(e) => { e.stopPropagation(); navigate(`/artist/${name.trim()}`); }}
                            >
                              {name.trim()}
                            </span>
                            {i < arr.length - 1 && <span className="separator">, </span>}
                          </React.Fragment>
                        ))}
                        <span className="song-extra-info"> • {song.genre || 'Single'}</span>
                      </div>
                    </div>
                    <button className="like-btn" onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}>
                      <Heart size={18} fill={likedSongs.includes(song.id) ? "var(--accent-color)" : "none"} color={likedSongs.includes(song.id) ? "var(--accent-color)" : "white"} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-results">No se encontraron resultados para "{query}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
