import { useState, useEffect, useRef } from 'react';

export function useIdle(isFullScreen, isPlaying, delay = 4000) {
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef(null);

  useEffect(() => {
    if (!isFullScreen || window.innerWidth <= 768) {
      setIsIdle(false);
      return;
    }

    const resetIdle = () => {
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      
      if (isPlaying) {
        idleTimerRef.current = setTimeout(() => {
          setIsIdle(true);
        }, delay); 
      }
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetIdle));

    resetIdle();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isFullScreen, isPlaying, delay]);

  return isIdle;
}
