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
  onlineDevices: [],
  connectChannel: null,

  // --- LÓGICA DE SINCRONIZACIÓN (CONNECT) ---
  
  // 2. Enviar comandos o estado a los demás (Súper rápido)
  sendCommand: (command, data = {}) => {
    const { connectChannel, deviceId, activeDeviceId } = get();
    if (!connectChannel || (activeDeviceId && activeDeviceId !== deviceId)) return;

    connectChannel.send({
      type: 'broadcast',
      event: 'player_command',
      payload: {
        senderId: deviceId,
        command,
        data: { ...data, activeDeviceId: activeDeviceId || deviceId }
      }
    });
  },

  broadcastState: () => {
    const { currentSong, isPlaying, currentTime } = get();
    get().sendCommand('SYNC_ALL', {
      songId: currentSong?.id,
      isPlaying,
      currentTime
    });
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

  // 2. Suscribirse a cambios de otros dispositivos
  // 2. Iniciar el canal de comunicación rápida (Connect Pro)
  initConnect: (userId) => {
    if (!userId) return;
    if (get().connectChannel) return;

    const channel = supabase.channel(`musicfy_connect_${userId}`, {
      config: {
        presence: { key: get().deviceId },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const devices = Object.values(newState).flat();
        console.log("[Musicfy Connect] Dispositivos sincronizados:", devices.length);
        set({ onlineDevices: devices });
      })
      // B. Escuchar órdenes de otros dispositivos (Protocolo de Comandos Pro)
      .on('broadcast', { event: 'player_command' }, ({ payload }) => {
        const { command, data, senderId } = payload;
        const myId = get().deviceId;

        if (senderId !== myId) {
          console.log(`[Musicfy Connect] Comando recibido de ${senderId}: ${command}`, data);
          
          switch (command) {
            case 'PLAY_SONG':
              const song = get().queue.find(s => s.id === data.songId);
              if (song) set({ currentSong: song, isPlaying: true, activeDeviceId: data.activeDeviceId });
              break;
            case 'TOGGLE_PLAY':
              set({ isPlaying: data.isPlaying, activeDeviceId: data.activeDeviceId });
              break;
            case 'SEEK':
              set({ currentTime: data.time });
              break;
            case 'SYNC_ALL':
              set({ 
                isPlaying: data.isPlaying,
                currentTime: data.currentTime,
                activeDeviceId: data.activeDeviceId
              });
              break;
            case 'SYNC_SETTINGS':
              import('./useSettingsStore').then(({ useSettingsStore }) => {
                useSettingsStore.setState({ ...data });
              });
              break;
          }
        }
      })
      .subscribe(async (status) => {
        console.log(`[Musicfy Connect] Estado de suscripción: ${status}`);
        if (status === 'SUBSCRIBED') {
          await channel.track({
            id: get().deviceId,
            name: navigator.userAgent.includes('Mobile') ? 'Móvil' : 'Navegador Web',
            lastSeen: new Date().toISOString()
          });
          get().fetchRemoteState(userId);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error("[Musicfy Connect] Error crítico en el canal. Reintentando...");
          setTimeout(() => get().initConnect(userId), 3000);
        }
      });

    set({ connectChannel: channel });
    return () => {
      supabase.removeChannel(channel);
      set({ connectChannel: null });
    };
  },

  // 4. Reclamar el audio
  transferPlayback: () => {
    const myId = get().deviceId;
    set({ activeDeviceId: myId });
    get().broadcastState();
    
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').update({ 
          active_device_id: myId
        }).eq('id', user.id);
      }
    });
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
    set({ currentSong: song, isPlaying: true });
    if (!song.lyrics) get().fetchSongDetails(song.id);
    get().sendCommand('PLAY_SONG', { songId: song.id });
  },

  togglePlay: () => {
    const newState = !get().isPlaying;
    set({ isPlaying: newState });
    get().sendCommand('TOGGLE_PLAY', { isPlaying: newState });
  },

  setVolume: (volume) => set({ volume }),
  
  setCurrentTime: (time, fromUI = false) => {
    set({ currentTime: time });
    if (fromUI) get().sendCommand('SEEK', { time });
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
      set({ currentSong: nextSong, isPlaying: true });
      if (!nextSong.lyrics) get().fetchSongDetails(nextSong.id);
      get().sendCommand('SYNC_ALL', { songId: nextSong.id, isPlaying: true, currentTime: 0 });
    }
  },

  playPrevious: () => {
    const { currentSong, queue, currentTime } = get();
    if (!currentSong || queue.length === 0) return;

    if (currentTime > 3) {
      set({ currentTime: 0 });
      get().sendCommand('SEEK', { time: 0 });
      return;
    }

    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex > 0) {
      const prevS = queue[currentIndex - 1];
      set({ currentSong: prevS, isPlaying: true });
      if (!prevS.lyrics) get().fetchSongDetails(prevS.id);
      get().sendCommand('SYNC_ALL', { songId: prevS.id, isPlaying: true, currentTime: 0 });
    }
  }
}));
