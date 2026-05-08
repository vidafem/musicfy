import { create } from 'zustand';
import { supabase } from '../supabaseClient';

export const usePlayerStore = create((set, get) => ({
  currentSong: null,
  queue: [],
  isPlaying: false,
  volume: 1,
  currentTime: 0,
  duration: 0,

  // Shuffle y Repeat
  isShuffled: false,
  repeatMode: 'none', // 'none' | 'one' | 'all'

  fetchSongs: async () => {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data.length > 0) {
      set({ queue: data, currentSong: get().currentSong || data[0] });
    }
  },

  playSong: (song) => set({ currentSong: song, isPlaying: true }),

  togglePlay: () => set((state) => ({
    isPlaying: state.currentSong ? !state.isPlaying : false
  })),

  setVolume: (volume) => set({ volume }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setQueue: (songs) => set({ queue: songs }),

  toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),

  toggleRepeat: () => set((state) => {
    const next = { none: 'one', one: 'all', all: 'none' };
    return { repeatMode: next[state.repeatMode] };
  }),

  playNext: () => {
    const { currentSong, queue, isShuffled, repeatMode } = get();
    if (!currentSong || queue.length === 0) return;

    const currentIndex = queue.findIndex(s => s.id === currentSong.id);

    // Repetir una sola canción: no cambiamos de canción, PlayerBar
    // detecta el onEnded y llama a playNext → aquí reiniciamos el índice
    if (repeatMode === 'one') {
      // Re-asignar la misma canción fuerza al useEffect de PlayerBar
      // a detectar el cambio de .id (no hay cambio) entonces usamos
      // un truco: ponemos isPlaying en true para que el onEnded lo
      // maneje el elemento audio directamente con el loop nativo
      const sameS = queue[currentIndex];
      set({ currentSong: { ...sameS }, isPlaying: true });
      return;
    }

    if (isShuffled) {
      let randomIndex;
      do {
        randomIndex = Math.floor(Math.random() * queue.length);
      } while (randomIndex === currentIndex && queue.length > 1);
      set({ currentSong: queue[randomIndex], isPlaying: true });
      return;
    }

    if (currentIndex < queue.length - 1) {
      set({ currentSong: queue[currentIndex + 1], isPlaying: true });
    } else if (repeatMode === 'all') {
      set({ currentSong: queue[0], isPlaying: true });
    }
  },

  playPrevious: () => {
    const { currentSong, queue, currentTime } = get();
    if (!currentSong || queue.length === 0) return;

    // Si han pasado más de 3 segundos, solo reiniciar en el store.
    // El elemento <audio> continuará desde su posición actual hasta
    // que el usuario use la barra de progreso (comportamiento original).
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
