import { create } from 'zustand';
import { supabase } from '../supabaseClient';

// Generamos o recuperamos un ID de dispositivo único (sessionStorage para separar pestañas)
const getDeviceId = () => {
  let id = sessionStorage.getItem('musicfy_device_id');
  if (!id) {
    id = `dev_${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem('musicfy_device_id', id);
  }
  return id;
};

export const usePlayerStore = create((set, get) => ({
  deviceId: getDeviceId(),
  activeDeviceId: null,
  currentSong: null,
  queue: [],
  isPlaying: false,
  volume: 1,
  currentTime: 0,
  duration: 0,

  // Shuffle y Repeat
  isShuffled: false,
  repeatMode: 'none', // 'none' | 'one' | 'all'

  // --- LÓGICA DE SINCRONIZACIÓN (CONNECT) ---
  
  // 1. Enviar mi estado a la nube
  syncToCloud: async (forceUpdate = false) => {
    const { currentSong, isPlaying, currentTime, deviceId, activeDeviceId } = get();
    const { data: { user } } = await supabase.auth.getUser();
    
    // Si no soy el dispositivo activo y no es un forceUpdate, no subo nada
    if (!user || (!forceUpdate && activeDeviceId && activeDeviceId !== deviceId)) return;

    const updateData = {
      is_playing: isPlaying,
      current_playback_time: currentTime,
      active_device_id: activeDeviceId || deviceId,
      sync_source_device: deviceId,
      last_seen: new Date().toISOString()
    };

    if (currentSong?.id) {
      updateData.last_played_id = currentSong.id;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (error) console.error("Error en sincronización Connect:", error);
  },

  // 1.1 Recuperar estado inicial de la nube
  fetchRemoteState: async (userId) => {
    // Esperar un momento a que la cola se cargue si está vacía
    if (get().queue.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('last_played_id, is_playing, current_playback_time, active_device_id')
      .eq('id', userId)
      .single();

    if (!error && data && data.last_played_id) {
      console.log("Estado remoto recuperado:", data);
      const { queue } = get();
      const remoteSong = queue.find(s => s.id === data.last_played_id);
      
      if (remoteSong) {
        set({ 
          currentSong: remoteSong, 
          isPlaying: data.is_playing, 
          currentTime: data.current_playback_time,
          activeDeviceId: data.active_device_id
        });
      }
    }
  },

  // 2. Suscribirse a cambios de otros dispositivos
  subscribeToRemoteControl: (userId) => {
    if (!userId) return;

    // Al iniciar, pedimos el estado actual de la nube
    get().fetchRemoteState(userId);

    const channel = supabase
      .channel(`profile_sync_${userId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles', 
        filter: `id=eq.${userId}` 
      }, (payload) => {
        console.log("Cambio detectado en otro dispositivo:", payload.new);
        const data = payload.new;
        const myDeviceId = get().deviceId;

        // Si el cambio viene de OTRO dispositivo, nos sincronizamos
        if (data.sync_source_device !== myDeviceId) {
          const { queue, currentSong } = get();
          
          // Si cambió la canción
          if (data.last_played_id && data.last_played_id !== currentSong?.id) {
            const newSong = queue.find(s => s.id === data.last_played_id);
            if (newSong) {
              set({ currentSong: newSong, isPlaying: data.is_playing, activeDeviceId: data.active_device_id });
              // ¡IMPORTANTE!: Cargar letras y fondo de la nueva canción sincronizada
              get().fetchSongDetails(newSong.id);
            }
          } else {
            // Si solo cambió el estado de play/pausa o progreso
            set({ 
              isPlaying: data.is_playing, 
              currentTime: data.current_playback_time,
              activeDeviceId: data.active_device_id
            });
          }
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  // Reclamar el audio para este dispositivo
  transferPlayback: () => {
    set({ activeDeviceId: get().deviceId });
    get().syncToCloud(true);
  },

  fetchSongs: async () => {
    // OPTIMIZACIÓN: Solo traemos datos ligeros para la cola inicial
    const { data, error } = await supabase
      .from('songs')
      .select('id, title, artist, cover_url, url, created_at')
      .order('created_at', { ascending: false });
    if (!error && data.length > 0) {
      set({ queue: data, currentSong: get().currentSong || data[0] });
    }
  },

  // Carga las letras y detalles pesados solo cuando se necesitan
  fetchSongDetails: async (songId) => {
    const { data, error } = await supabase
      .from('songs')
      .select('lyrics, background_url')
      .eq('id', songId)
      .single();
    
    if (!error && data) {
      set((state) => ({
        queue: state.queue.map(s => s.id === songId ? { ...s, ...data } : s),
        currentSong: state.currentSong?.id === songId ? { ...state.currentSong, ...data } : state.currentSong
      }));
    }
  },

  playSong: (song) => {
    set({ currentSong: song, isPlaying: true, activeDeviceId: get().deviceId });
    if (!song.lyrics) get().fetchSongDetails(song.id);
    get().syncToCloud();
  },

  togglePlay: () => {
    const newState = !get().isPlaying;
    set({ isPlaying: newState, activeDeviceId: get().deviceId });
    get().syncToCloud();
  },

  setVolume: (volume) => set({ volume }),
  
  setCurrentTime: (time, fromUI = false) => {
    set({ currentTime: time });
    // Solo sincronizamos al hacer seek manual para no saturar la red
    if (fromUI) get().syncToCloud();
  },

  setDuration: (duration) => set({ duration }),
  setQueue: (songs) => set({ queue: songs }),

  toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),

  toggleRepeat: () => set((state) => {
    const next = { none: 'one', one: 'all', all: 'none' };
    return { repeatMode: next[state.repeatMode] };
  }),

  playNext: () => {
    const { currentSong, queue, isShuffled, repeatMode, deviceId } = get();
    if (!currentSong || queue.length === 0) return;

    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    let nextSong;

    if (repeatMode === 'one') {
      nextSong = { ...currentSong };
    } else if (isShuffled) {
      let randomIndex;
      do { randomIndex = Math.floor(Math.random() * queue.length); } 
      while (randomIndex === currentIndex && queue.length > 1);
      nextSong = queue[randomIndex];
    } else if (currentIndex < queue.length - 1) {
      nextSong = queue[currentIndex + 1];
    } else if (repeatMode === 'all') {
      nextSong = queue[0];
    }

    if (nextSong) {
      set({ currentSong: nextSong, isPlaying: true, activeDeviceId: deviceId });
      if (!nextSong.lyrics) get().fetchSongDetails(nextSong.id);
      get().syncToCloud();
    }
  },

  playPrevious: () => {
    const { currentSong, queue, currentTime, deviceId } = get();
    if (!currentSong || queue.length === 0) return;

    if (currentTime > 3) {
      set({ currentTime: 0 });
      get().syncToCloud();
      return;
    }

    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex > 0) {
      const prevS = queue[currentIndex - 1];
      set({ currentSong: prevS, isPlaying: true, activeDeviceId: deviceId });
      if (!prevS.lyrics) get().fetchSongDetails(prevS.id);
      get().syncToCloud();
    }
  }
}));
