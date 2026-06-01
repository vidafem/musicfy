import { useState, useCallback } from 'react';
import * as jsmediatags from 'jsmediatags';

export function useMusicTags() {
  const [isProcessing, setIsProcessing] = useState(false);

  const extractMetadata = useCallback((file, onComplete) => {
    setIsProcessing(true);
    
    // 1. Obtener duración real usando el API de Audio del navegador
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      const duration = Math.floor(audio.duration);
      URL.revokeObjectURL(audio.src);
      
      // 2. Leer etiquetas ID3
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

          const metadata = {
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
            mood: COMM?.data?.text || '',
            duration: duration
          };

          setIsProcessing(false);
          if (onComplete) onComplete(metadata, imageUrl);
        },
        onError: function (error) {
          console.error("Error al leer etiquetas:", error);
          const detectedTitle = file.name.replace(/\.[^/.]+$/, "");
          setIsProcessing(false);
          if (onComplete) onComplete({ title: detectedTitle, duration }, null);
        }
      });
    };
  }, []);

  const fetchSyncedLyricsOnly = async (title, artist) => {
    try {
      const cleanArtist = artist && artist !== 'Artista Desconocido' ? artist : '';
      let url = '';
      if (cleanArtist) {
        url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(title)}`;
      } else {
        url = `https://lrclib.net/api/search?q=${encodeURIComponent(title)}`;
      }
      const lrcRes = await fetch(url);
      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        if (lrcData && lrcData.length > 0) {
          return lrcData[0].syncedLyrics || lrcData[0].plainLyrics || null;
        }
      }
    } catch (e) {
      console.log("Error buscando letras auto:", e);
    }
    return null;
  };

  return {
    isProcessing,
    setIsProcessing,
    extractMetadata,
    fetchSyncedLyricsOnly
  };
}
