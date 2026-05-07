import { create } from 'zustand';

export const usePlayerStore = create((set, get) => ({
  currentSong: null,
  queue: [],
  isPlaying: false,
  volume: 1, // 0.0 a 1.0
  currentTime: 0,
  duration: 0,
  
  // Acciones
  playSong: (song) => set({ currentSong: song, isPlaying: true }),
  
  togglePlay: () => set((state) => ({ 
    isPlaying: state.currentSong ? !state.isPlaying : false 
  })),
  
  setVolume: (volume) => set({ volume }),
  
  setCurrentTime: (time) => set({ currentTime: time }),
  
  setDuration: (duration) => set({ duration }),
  
  setQueue: (songs) => set({ queue: songs }),
  
  playNext: () => {
    const { currentSong, queue } = get();
    if (!currentSong || queue.length === 0) return;
    
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex < queue.length - 1) {
      set({ currentSong: queue[currentIndex + 1], isPlaying: true });
    }
  },
  
  playPrevious: () => {
    const { currentSong, queue, currentTime } = get();
    if (!currentSong || queue.length === 0) return;
    
    // Si han pasado más de 3 segundos, reiniciar la canción actual en lugar de ir a la anterior
    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }
    
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex > 0) {
      set({ currentSong: queue[currentIndex - 1], isPlaying: true });
    }
  }
}));
