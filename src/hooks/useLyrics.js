import { useMemo, useEffect, useRef } from 'react';

export function useLyrics(currentSong, localCurrentTime, showLyrics) {
  const lyricsContainerRef = useRef(null);

  const parsedLyrics = useMemo(() => {
    if (!currentSong?.lyrics) return [];
    return currentSong.lyrics.split('\n').map((line, index) => {
      const timeMatch = line.match(/\[(\d+):(\d+\.\d+)\]/);
      if (timeMatch) {
        return {
          time: parseInt(timeMatch[1]) * 60 + parseFloat(timeMatch[2]),
          text: line.replace(/\[\d+:\d+\.\d+\]/, '').trim()
        };
      }
      return { time: index * 0.001, text: line.trim() };
    }).filter(l => l.text).sort((a, b) => a.time - b.time);
  }, [currentSong?.id, currentSong?.lyrics]);

  useEffect(() => {
    if (showLyrics && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const activeLyric = container.querySelector('.lyric-line.active');
      
      if (activeLyric) {
        const containerHeight = container.offsetHeight;
        const lyricOffset = activeLyric.offsetTop;
        const lyricHeight = activeLyric.offsetHeight;
        
        // Centramos la línea activa en el panel sin mover la pantalla externa
        container.scrollTo({
          top: lyricOffset - (containerHeight / 2) + (lyricHeight / 2),
          behavior: 'smooth'
        });
      }
    }
  }, [localCurrentTime, showLyrics]);

  return {
    parsedLyrics,
    lyricsContainerRef
  };
}
