import { useState } from 'react';

const WORKER_URL = 'https://musicfy.canonedu17.workers.dev';
const SPOTIFY_API_URL = `${WORKER_URL}/v1/search`;

let spotifyTokenCache = null;
let spotifyTokenExpiresAt = 0;

const uniqueUrls = (items) => [...new Set(items.filter(Boolean))];

const cleanText = (value) => value?.replace(/\[.*?\]|\(.*?\)/g, '').trim() || '';

const extractArtists = (artist) =>
  cleanText(artist)
    .split(/[&,x/]|\bfeat\b/i)
    .map((value) => value.trim())
    .filter(Boolean);

let rateLimitedUntil = 0;
const requestCache = new Map();
const MAX_CONCURRENT_FETCHES = 1;
let activeFetches = 0;
const MIN_FETCH_DELAY_MS = 1100;
let lastFetchTime = 0;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const throttleFetch = async () => {
  const now = Date.now();
  const wait = lastFetchTime + MIN_FETCH_DELAY_MS - now;
  if (wait > 0) await delay(wait);
  lastFetchTime = Date.now();
};

const acquireFetchSlot = async () => {
  while (activeFetches >= MAX_CONCURRENT_FETCHES) {
    await delay(150);
  }
  activeFetches += 1;
};

const releaseFetchSlot = () => {
  activeFetches = Math.max(0, activeFetches - 1);
};

const safeFetchJson = async (url, options) => {
  if (Date.now() < rateLimitedUntil) return null;
  const cacheKey = `json:${url}:${JSON.stringify(options || {})}`;
  if (requestCache.has(cacheKey)) return requestCache.get(cacheKey);

  let attempts = 0;
  while (attempts < 3) {
    await throttleFetch();
    await acquireFetchSlot();
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = Math.max(parseInt(response.headers.get('Retry-After') || '2', 10), 2) * 1000;
        rateLimitedUntil = Date.now() + retryAfter;
        await delay(retryAfter);
        attempts += 1;
        continue;
      }
      if (!response.ok) return null;
      const json = await response.json();
      requestCache.set(cacheKey, json);
      return json;
    } catch {
      attempts += 1;
      await delay(750 * attempts);
    } finally {
      releaseFetchSlot();
    }
  }
  return null;
};

const safeFetchText = async (url, options) => {
  if (Date.now() < rateLimitedUntil) return null;
  const cacheKey = `text:${url}:${JSON.stringify(options || {})}`;
  if (requestCache.has(cacheKey)) return requestCache.get(cacheKey);

  let attempts = 0;
  while (attempts < 3) {
    await throttleFetch();
    await acquireFetchSlot();
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = Math.max(parseInt(response.headers.get('Retry-After') || '2', 10), 2) * 1000;
        rateLimitedUntil = Date.now() + retryAfter;
        await delay(retryAfter);
        attempts += 1;
        continue;
      }
      if (!response.ok) return null;
      const text = await response.text();
      requestCache.set(cacheKey, text);
      return text;
    } catch {
      attempts += 1;
      await delay(750 * attempts);
    } finally {
      releaseFetchSlot();
    }
  }
  return null;
};

const fetchSpotifyToken = async () => {
  if (Date.now() < rateLimitedUntil) return null;
  if (spotifyTokenCache && Date.now() < spotifyTokenExpiresAt) {
    return spotifyTokenCache;
  }

  const data = await safeFetchJson(`${WORKER_URL}/auth`);
  if (!data?.access_token) return null;

  const ttl = Math.max(60, (data.expires_in || 3600) - 60);
  spotifyTokenCache = data.access_token;
  spotifyTokenExpiresAt = Date.now() + ttl * 1000;
  return spotifyTokenCache;
};

const searchSpotify = async (token, query, type = 'track', limit = 1) => {
  if (!token || !query) return null;
  const url = `${SPOTIFY_API_URL}?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}&limit=${limit}`;
  return safeFetchJson(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

const fetchSuggestionSnapshot = async (title, artist) => {
  const cleanTitle = cleanText(title);
  const artists = extractArtists(artist);
  const firstArtist = artists[0] || '';

  const snapshot = { itunes: null, spotify: null };

  const itunesData = await safeFetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(`${cleanTitle} ${firstArtist}`)}&entity=song&limit=1`
  );
  const itunesTrack = itunesData?.results?.[0];
  if (itunesTrack) {
    snapshot.itunes = {
      title: itunesTrack.trackName,
      artist: itunesTrack.artistName,
      album: itunesTrack.collectionName,
      year: itunesTrack.releaseDate ? itunesTrack.releaseDate.split('-')[0] : null,
      genre: itunesTrack.primaryGenreName
    };
  }

  const token = await fetchSpotifyToken();
  if (Date.now() >= rateLimitedUntil && token) {
    const spotifyData = await searchSpotify(token, `track:${cleanTitle} artist:${firstArtist}`, 'track', 1);
    const track = spotifyData?.tracks?.items?.[0];
    if (track) {
      snapshot.spotify = {
        title: track.name,
        artist: track.artists?.map((item) => item.name).join(', ') || '',
        album: track.album?.name || ''
      };
    }
  }

  return snapshot;
};

const fetchVisualSnapshot = async (title, artist, currentYear, originalCoverBackup, album) => {
  const cleanTitle = cleanText(title);
  const artistsList = extractArtists(artist);
  const firstArtist = artistsList[0] || '';

  const foundCovers = originalCoverBackup ? [originalCoverBackup] : [];
  const foundFanarts = [];

  // 1. iTunes: Forzar 1200x1200bb para máxima nitidez en portadas
  try {
    const itunesData = await safeFetchJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(`${cleanTitle} ${firstArtist}`)}&entity=song&limit=10`
    );
    if (itunesData?.results) {
      foundCovers.push(...itunesData.results.map(r => r.artworkUrl100?.replace('100x100bb', '1400x1400bb')));
    }
  } catch (e) { console.warn("[AI] iTunes error:", e); }

  // 2. Spotify: Imágenes de Artista y Álbum en alta resolución
  try {
    const token = await fetchSpotifyToken();
    if (Date.now() >= rateLimitedUntil && token) {
      const spotifyTracks = await searchSpotify(token, `track:${cleanTitle} artist:${firstArtist}`, 'track', 5);
      if (spotifyTracks?.tracks?.items) {
        foundCovers.push(...spotifyTracks.tracks.items.map(t => t.album?.images?.[0]?.url));
      }

      for (const name of artistsList.slice(0, 2)) {
        const spotifyArtists = await searchSpotify(token, `artist:${name}`, 'artist', 2);
        const artistItems = spotifyArtists?.artists?.items || [];
        artistItems.forEach(art => {
          if (art.images?.length) {
            // La primera imagen de Spotify suele ser la de mayor calidad (>640px)
            foundFanarts.push(art.images[0].url);
          }
        });
      }
    }
  } catch (e) { console.warn("[AI] Spotify error:", e); }

  // 3. YouTube: Solo usamos hqdefault como último recurso (Siempre existe)
  try {
    const ytHtml = await safeFetchText(
      `${WORKER_URL}/proxy-image?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleanTitle} ${firstArtist} official music video`)}`)}`
    );
    if (ytHtml) {
      const videoIds = [...ytHtml.matchAll(/"videoId":"(.*?)"/g)].map(m => m[1]).slice(0, 2);
      videoIds.forEach(id => {
        foundFanarts.push(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
      });
    }
  } catch (e) { console.warn("[AI] YouTube error:", e); }

  // 4. Búsqueda profunda en TheAudioDB y Spotify para TODOS los artistas
  const adbKey = import.meta.env.VITE_THEAUDIODB_API_KEY || '2';
  
  // Recorremos todos los artistas encontrados (no solo los 2 primeros)
  for (const name of artistsList) {
    // A. TheAudioDB (Fanarts de 1920x1080)
    try {
      const audioDbData = await safeFetchJson(`https://www.theaudiodb.com/api/v1/json/${adbKey}/search.php?s=${encodeURIComponent(name)}`);
      const info = audioDbData?.artists?.[0];
      if (info) {
        // Intentamos extraer hasta 10 fanarts por cada artista
        for (let i = 1; i <= 10; i++) {
          const key = i === 1 ? 'strArtistFanart' : `strArtistFanart${i}`;
          if (info[key]) foundFanarts.push(info[key]);
        }
        // También incluimos imágenes de "Wide Thumb" si existen
        if (info.strArtistWideThumb) foundFanarts.push(info.strArtistWideThumb);
      }
    } catch (e) { console.warn(`[AI] AudioDB error (${name}):`, e); }

    // B. Spotify Artist Images (Alta resolución)
    try {
      const token = await fetchSpotifyToken();
      if (Date.now() >= rateLimitedUntil && token) {
        const spotifyArtists = await searchSpotify(token, `artist:${name}`, 'artist', 3);
        const artistItems = spotifyArtists?.artists?.items || [];
        artistItems.forEach(art => {
          if (art.images?.length) {
            foundFanarts.push(art.images[0].url);
          }
        });
      }
    } catch (e) { console.warn(`[AI] Spotify Artist error (${name}):`, e); }
  }

  return {
    covers: uniqueUrls(foundCovers),
    fanarts: uniqueUrls(foundFanarts)
  };
};

export function useMusicAI() {
  const [isAISearching, setIsAISearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [alternativeCovers, setAlternativeCovers] = useState([]);
  const [alternativeFanarts, setAlternativeFanarts] = useState([]);

  const fetchAIData = async (title, artist) => {
    setIsAISearching(true);
    setAiSuggestions(null);
    try {
      const suggestions = await fetchSuggestionSnapshot(title, artist);
      setAiSuggestions(suggestions);
      return suggestions;
    } finally {
      setIsAISearching(false);
    }
  };

  const fetchAIVisuals = async (title, artist, currentYear, originalCoverBackup, album) => {
    setIsAISearching(true);
    try {
      const snapshot = await fetchVisualSnapshot(title, artist, currentYear, originalCoverBackup, album);
      setAlternativeCovers(snapshot.covers);
      setAlternativeFanarts(snapshot.fanarts);
      return snapshot;
    } finally {
      setIsAISearching(false);
    }
  };

  const prefetchSongAssets = async ({ title, artist, year, coverUrl, album }) => {
    const suggestions = await fetchSuggestionSnapshot(title, artist);
    const visuals = await fetchVisualSnapshot(title, artist, year, coverUrl, album);
    return {
      suggestions,
      covers: visuals.covers,
      fanarts: visuals.fanarts
    };
  };

  return {
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
  };
}
