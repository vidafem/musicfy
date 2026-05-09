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

  // --- LÓGICA DE SINCRONIZACIÓN (CONNECT PRO) ---
  
  // 1. Enviar comandos instantáneos (Cualquier dispositivo puede mandar órdenes)
  sendCommand: (command, data = {}) => {
    const { connectChannel, deviceId, activeDeviceId } = get();
    if (!connectChannel) return;

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

  // 2. Difusión de estado completo (Fuerza bruta para evitar desincronización)
  broadcastState: () => {
    const { currentSong, isPlaying, currentTime } = get();
    get().sendCommand('SYNC_ALL', {
      song: currentSong, // Enviamos el objeto COMPLETO de la canción
      isPlaying,
      currentTime
    });
  },

  // 3. Recuperar estado desde la NUBE (Base de datos)
  fetchRemoteState: async (userId) => {
    if (!userId) return;
    console.log("[Connect] Recuperando ajustes de la nube para el usuario:", userId);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('last_played_id, is_playing, current_playback_time, active_device_id, settings')
      .eq('id', userId)
      .single();

    if (!error && data) {
      // Sincronizar Ajustes Visuales (Prioridad Nube)
      if (data.settings) {
        console.log("[Connect] Aplicando ajustes remotos:", data.settings);
        const { useSettingsStore } = await import('./useSettingsStore');
        useSettingsStore.getState().applyRemoteSettings(data.settings);
      }

      // Sincronizar Música
      if (data.last_played_id) {
        const { data: songData } = await supabase.from('songs').select('*').eq('id', data.last_played_id).single();
        if (songData) {
          set({ 
            currentSong: songData, 
            isPlaying: data.is_playing, 
            currentTime: data.current_playback_time,
            activeDeviceId: data.active_device_id
          });
        }
      }
    } else if (error) {
      console.error("[Connect] Error al recuperar estado remoto:", error);
    }
  },

  // 4. Iniciar Canal Connect Pro
  initConnect: (userId) => {
    if (!userId || get().connectChannel) return;

    const channel = supabase.channel(`musicfy_connect_${userId}`, {
      config: { presence: { key: get().deviceId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        set({ onlineDevices: Object.values(newState).flat() });
      })
      .on('broadcast', { event: 'player_command' }, async ({ payload }) => {
        const { command, data, senderId } = payload;
        if (senderId !== get().deviceId) {
          console.log(`[Connect] Comando: ${command}`, data);
          switch (command) {
            case 'PLAY_SONG':
              set({ currentSong: data.song, isPlaying: true, activeDeviceId: data.activeDeviceId });
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
              if (data.song && get().currentSong?.id !== data.song.id) {
                set({ currentSong: data.song });
              }
              break;
            case 'SYNC_SETTINGS':
              const { useSettingsStore } = await import('./useSettingsStore');
              useSettingsStore.getState().applyRemoteSettings(data);
              break;
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ id: get().deviceId, name: navigator.userAgent.includes('Mobile') ? 'Móvil' : 'Navegador Web' });
          get().fetchRemoteState(userId);
        }
      });

    set({ connectChannel: channel });
  },

  transferPlayback: () => {
    const myId = get().deviceId;
    set({ activeDeviceId: myId });
    get().broadcastState();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').update({ active_device_id: myId }).eq('id', user.id);
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
      get().sendCommand('PLAY_SONG', { song: nextSong });
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
      get().sendCommand('PLAY_SONG', { song: prevS });
    }
  }
}));
