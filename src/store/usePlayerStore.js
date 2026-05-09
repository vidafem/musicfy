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
  isMixing: false, // Estado para el fundido cruzado sincronizado

  // Shuffle y Repeat
  isShuffled: false,
  repeatMode: 'none', // 'none' | 'one' | 'all'
  
  // Connect State
  showDeviceModal: false,
  realtimeChannel: null, // Canal persistente

  // --- LÓGICA DE SINCRONIZACIÓN (CONNECT) ---
  
  // 1. Enviar mi estado a la nube
  syncToCloud: async (forceUpdate = false) => {
    const { currentSong, isPlaying, currentTime, deviceId, activeDeviceId } = get();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // REGLA DE ORO: El espejo solo sube cambios si es una acción MANUAL (forceUpdate)
    // El resto del tiempo (progreso automático), solo el MASTER sube a la nube.
    const isMaster = activeDeviceId === deviceId;
    if (!forceUpdate && !isMaster) return;

    const updateData = {
      is_playing: isPlaying,
      current_playback_time: currentTime,
      active_device_id: activeDeviceId,
      sync_source_device: deviceId,
      last_seen: new Date().toISOString(),
      sync_timestamp: Date.now() // Evitar pisar con datos viejos
    };

    if (currentSong?.id) updateData.last_played_id = currentSong.id;

    await supabase.from('profiles').update(updateData).eq('id', user.id);
  },

  // 1.2 Broadcast rápido (Milisegundos)
  broadcastStatus: (payload) => {
    const channel = get().realtimeChannel;
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'sync_fast',
        payload: { 
          ...payload, 
          source: get().deviceId,
          timestamp: Date.now() 
        }
      });
    }
  },

  // 1.1 Recuperar estado inicial de la nube
  fetchRemoteState: async (userId) => {
    if (get().queue.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('last_played_id, is_playing, current_playback_time, active_device_id')
      .eq('id', userId)
      .single();

    if (!error && data && data.last_played_id) {
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

  // 2. Suscribirse a cambios
  subscribeToRemoteControl: (userId) => {
    if (!userId) return;
    get().fetchRemoteState(userId);

    const channel = supabase.channel(`profile_sync_${userId}`, {
      config: { broadcast: { self: false } }
    });
    
    let lastProcessedTimestamp = 0;

    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
        const data = payload.new;
        if (data.sync_source_device === get().deviceId) return;
        
        // Evitar procesar datos viejos
        if (data.sync_timestamp && data.sync_timestamp < lastProcessedTimestamp) return;
        lastProcessedTimestamp = data.sync_timestamp || Date.now();

        const { queue, currentSong } = get();
        if (data.last_played_id && data.last_played_id !== currentSong?.id) {
          const newSong = queue.find(s => s.id === data.last_played_id);
          if (newSong) {
            set({ currentSong: newSong, isPlaying: data.is_playing, activeDeviceId: data.active_device_id });
            get().fetchSongDetails(newSong.id);
          }
        } else {
          set({ isPlaying: data.is_playing, activeDeviceId: data.active_device_id });
        }
      })
      .on('broadcast', { event: 'sync_fast' }, ({ payload }) => {
        if (payload.source === get().deviceId) return;
        
        if (payload.currentTime !== undefined) {
          const diff = Math.abs(get().currentTime - payload.currentTime);
          if (diff > 0.3) { // Margen mínimo
            set({ currentTime: payload.currentTime });
          }
        }
        if (payload.isPlaying !== undefined) set({ isPlaying: payload.isPlaying });
        if (payload.activeDeviceId !== undefined) set({ activeDeviceId: payload.activeDeviceId });
        if (payload.isMixing !== undefined) {
          // Si el maestro está mezclando, activamos el estado local para que la UI reaccione
          set({ isMixing: payload.isMixing });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') set({ realtimeChannel: channel });
      });

    return () => {
      supabase.removeChannel(channel);
      set({ realtimeChannel: null });
    };
  },

  toggleDeviceModal: (val) => set({ showDeviceModal: val !== undefined ? val : !get().showDeviceModal }),
  
  transferPlayback: () => {
    set({ activeDeviceId: get().deviceId, showDeviceModal: false });
    get().syncToCloud(true);
    get().broadcastStatus({ activeDeviceId: get().deviceId });
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
  
  setCurrentTime: (time) => {
    set({ currentTime: time });
  },

  setDuration: (duration) => set({ duration }),
  setQueue: (songs) => set({ queue: songs }),

  toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),

  toggleRepeat: () => set((state) => {
    const next = { none: 'one', one: 'all', all: 'none' };
    return { repeatMode: next[state.repeatMode] };
  }),

  playSong: async (song) => {
    // Mantenemos el activeDeviceId actual para no robar el audio si somos espejo
    set({ currentSong: song, isPlaying: true, currentTime: 0 });
    get().syncToCloud(true);
    get().fetchSongDetails(song.id);
  },

  togglePlay: () => {
    const { isPlaying } = get();
    set({ isPlaying: !isPlaying });
    get().syncToCloud(true);
    get().broadcastStatus({ isPlaying: !isPlaying });
  },

  playNext: () => {
    const { queue, currentSong, isShuffled } = get();
    if (queue.length === 0) return;
    
    let nextSong;
    const currentIndex = queue.findIndex(s => s.id === currentSong?.id);
    
    if (isShuffled) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      nextSong = queue[randomIndex];
    } else {
      nextSong = queue[(currentIndex + 1) % queue.length];
    }
    
    set({ currentSong: nextSong, isPlaying: true, currentTime: 0 });
    get().syncToCloud(true);
    get().fetchSongDetails(nextSong.id);
  },

  playPrevious: () => {
    const { queue, currentSong, currentTime } = get();
    if (queue.length === 0) return;
    
    if (currentTime > 3) {
      set({ currentTime: 0 });
      get().syncToCloud(true);
      return;
    }

    const currentIndex = queue.findIndex(s => s.id === currentSong?.id);
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    const prevSong = queue[prevIndex];
    
    set({ currentSong: prevSong, isPlaying: true, currentTime: 0 });
    get().syncToCloud(true);
    get().fetchSongDetails(prevSong.id);
  }
}));
