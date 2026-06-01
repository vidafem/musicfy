import { create } from 'zustand';
import { supabase } from '../supabaseClient';
import { useSettingsStore } from './useSettingsStore';

// Generamos o recuperamos un ID de dispositivo único (sessionStorage para separar pestañas)
const getDeviceId = () => {
  let id = localStorage.getItem('musicfy_device_id');
  if (!id) {
    id = `dev_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem('musicfy_device_id', id);
  }
  return id;
};

const getDeviceName = () => {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    if (/TV|AFT|BRAVIA|SHIELD|SmartTV/i.test(ua)) return 'Android TV';
    return 'Android';
  }
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'Navegador Web';
};

export const usePlayerStore = create((set, get) => ({
  deviceId: getDeviceId(),
  deviceName: getDeviceName(),
  activeDeviceId: null,
  currentSong: null,
  queue: [],
  isPlaying: false,
  volume: 1,
  currentTime: 0,
  duration: 0,
  playbackUpdatedAt: Date.now(),
  mixerState: null,
  playbackHistory: [], // Historial real de lo que ha sonado

  onlineDevices: [],
  connectChannel: null,
  isFullScreen: false,
  showDeviceSelector: false,

  setIsFullScreen: (val) => set({ isFullScreen: val }),
  setShowDeviceSelector: (val) => set({ showDeviceSelector: val }),

  // --- LÓGICA DE SINCRONIZACIÓN (CONNECT PRO) ---

  // 1. Enviar comandos instantáneos (Cualquier dispositivo puede mandar órdenes)
  sendCommand: (command, data = {}, targetDeviceId = null) => {
    const { connectChannel, deviceId, activeDeviceId } = get();
    if (!connectChannel) return;

    const payload = {
      commandId: Math.random().toString(36).substring(2, 15),
      senderId: deviceId,
      targetDeviceId, // Si es null, lo reciben todos
      sentAt: Date.now(),
      command,
      data: { ...data, activeDeviceId: activeDeviceId || deviceId }
    };

    connectChannel.send({
      type: 'broadcast',
      event: 'player_command',
      payload
    });
  },

  saveRemotePlaybackState: async () => {
    const { currentSong, isPlaying, currentTime, activeDeviceId } = get();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('profiles')
      .update({
        last_played_id: currentSong?.id || null,
        is_playing: isPlaying,
        current_playback_time: currentTime || 0,
        active_device_id: activeDeviceId
      })
      .eq('id', user.id);
  },

  // 2. Difusión de estado completo (Fuerza bruta para evitar desincronización)
  broadcastState: () => {
    const { currentSong, queue, isPlaying, currentTime, duration, activeDeviceId, mixerState } = get();
    const updatedAt = Date.now();
    
    // Si la canción tiene un blob local, recuperar la URL remota original para los espejos
    let songToSend = currentSong;
    if (currentSong && (currentSong.url?.startsWith('blob:') || currentSong.url?.startsWith('data:'))) {
      const originalSong = queue.find(s => s.id === currentSong.id);
      if (originalSong && originalSong.url) {
        songToSend = { ...currentSong, url: originalSong.url };
      }
    }

    get().sendCommand('SYNC_ALL', {
      song: songToSend,
      isPlaying,
      currentTime,
      duration,
      activeDeviceId,
      mixerState,
      updatedAt
    });
    set({ playbackUpdatedAt: updatedAt });
  },

  setMixerState: (mixerState, shouldBroadcast = true) => {
    set({ mixerState });
    if (shouldBroadcast) {
      get().sendCommand('MIXER_STATE', mixerState);
    }
  },

  clearMixerState: (shouldBroadcast = true) => {
    set({ mixerState: null });
    if (shouldBroadcast) {
      get().sendCommand('MIXER_STATE', null);
    }
  },

  // 3. Recuperar estado desde la NUBE (Base de datos)
  fetchRemoteState: async (userId) => {
    if (!userId) return;
    console.log("[Connect] Recuperando ajustes de la nube para el usuario:", userId);

    const { data, error } = await supabase
      .from('profiles')
      .select('last_played_id, is_playing, current_playback_time, active_device_id, settings')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      // Sincronizar Ajustes Visuales
      if (data.settings) {
        const { useSettingsStore } = await import('./useSettingsStore');
        useSettingsStore.getState().applyRemoteSettings(data.settings);
      }

      // Sincronizar Música
      if (data.last_played_id) {
        const { data: songData } = await supabase.from('songs').select('*').eq('id', data.last_played_id).maybeSingle();
        if (songData) {
          set({
            currentSong: songData,
            isPlaying: data.is_playing,
            currentTime: data.current_playback_time,
            activeDeviceId: data.active_device_id,
            playbackUpdatedAt: Date.now()
          });
        }
      }
    } else {
      console.log("[Connect] No se encontró perfil previo o error leve. Iniciando estado limpio.");
    }
  },

  // 4. Iniciar Canal Connect Pro
  initConnect: (userId) => {
    if (!userId) return;
    const { connectChannel, deviceId, deviceName } = get();

    // Si ya existe un canal, no creamos otro pero nos aseguramos de estar trackeados
    if (connectChannel) return;

    console.log("[Connect] 🔌 Inicializando conexión para usuario:", userId);

    const channel = supabase.channel(`musicfy_connect_${userId}`, {
      config: { presence: { key: deviceId } },
    });

    const handledCommands = new Set();

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const devices = Object.values(newState).flat();
        // Deduplicar por ID para evitar errores de llaves duplicadas en React
        const uniqueDevices = Array.from(new Map(devices.map(d => [d.id, d])).values());
        set({ onlineDevices: uniqueDevices });
      })
      .on('broadcast', { event: 'player_command' }, async ({ payload }) => {
        const { command, data, senderId, targetDeviceId, commandId } = payload;

        // 1. Evitar duplicados por ID de comando
        if (commandId) {
          if (handledCommands.has(commandId)) return;
          handledCommands.add(commandId);
          if (handledCommands.size > 200) handledCommands.clear();
        }

        // 2. Filtrar por destinatario (si existe)
        if (targetDeviceId && targetDeviceId !== deviceId) return;

        // 3. Ignorar comandos propios
        if (senderId === deviceId) return;

        console.log(`[Connect] 📥 Recibido ${command} de ${senderId}`, data);

        switch (command) {
          case 'TRANSFER_PLAYBACK':
            set({
              activeDeviceId: data.activeDeviceId,
              currentSong: data.song || get().currentSong,
              isPlaying: data.isPlaying ?? get().isPlaying,
              currentTime: data.currentTime ?? get().currentTime,
              duration: data.duration ?? get().duration,
              playbackUpdatedAt: data.updatedAt || Date.now()
            });
            // Si el comando fue para nosotros, el useEffect de PlayerBar se encargará del resto
            get().saveRemotePlaybackState();
            break;
          case 'PLAY_SONG':
            set({
              currentSong: data.song,
              isPlaying: true,
              currentTime: 0,
              activeDeviceId: data.activeDeviceId,
              playbackUpdatedAt: data.updatedAt || Date.now()
            });
            break;
          case 'TOGGLE_PLAY':
            set({ isPlaying: data.isPlaying, activeDeviceId: data.activeDeviceId, playbackUpdatedAt: data.updatedAt || Date.now() });
            break;
          case 'SEEK':
            set({ currentTime: data.time, playbackUpdatedAt: data.updatedAt || Date.now() });
            break;
          case 'MIXER_STATE':
            set({ mixerState: data || null });
            break;
          case 'SYNC_ALL':
            set({
              isPlaying: data.isPlaying,
              currentTime: data.currentTime,
              duration: data.duration || get().duration,
              activeDeviceId: data.activeDeviceId,
              mixerState: data.mixerState || null,
              playbackUpdatedAt: data.updatedAt || Date.now()
            });
            if (data.song) set({ currentSong: data.song });
            break;
          case 'SYNC_SETTINGS':
            {
              const { useSettingsStore } = await import('./useSettingsStore');
              useSettingsStore.getState().applyRemoteSettings(data);
            }
            break;
          case 'SET_VOLUME':
            set({ volume: data.volume });
            break;
          default:
            break;
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log("[Connect] ✅ Subscrito al canal");
          channel.track({ id: deviceId, name: deviceName, lastSeenAt: Date.now() });
          get().fetchRemoteState(userId);
        }
      });

    set({ connectChannel: channel });

    // Devolvemos la función de limpieza para useEffect
    return () => {
      console.log("[Connect] 🔌 Cerrando canal...");
      supabase.removeChannel(channel);
      set({ connectChannel: null, onlineDevices: [] });
    };
  },

  transferPlayback: (targetDeviceId = null) => {
    const myId = get().deviceId;
    const nextActiveDeviceId = targetDeviceId || myId;
    const { currentSong, isPlaying, currentTime, duration } = get();
    const updatedAt = Date.now();

    set({ activeDeviceId: nextActiveDeviceId, playbackUpdatedAt: updatedAt });
    get().sendCommand('TRANSFER_PLAYBACK', {
      activeDeviceId: nextActiveDeviceId,
      song: currentSong,
      isPlaying,
      currentTime,
      duration,
      updatedAt
    }, targetDeviceId);

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').update({ active_device_id: nextActiveDeviceId }).eq('id', user.id);
    });
  },

  fetchSongs: async (options = { sources: ['local'] }) => {
    // 1. Carga inicial desde caché local (Carga instantánea)
    const cachedQueue = localStorage.getItem('musicfy_cached_queue');
    if (cachedQueue) {
      const parsed = JSON.parse(cachedQueue);
      if (parsed.length > 0) {
        set({ queue: parsed, currentSong: get().currentSong || parsed[0] });
      }
    }

    // 2. Sincronización con el servidor a través del HybridMusicProvider
    try {
      const { HybridMusicProvider } = await import('../providers/MusicProvider');
      const songs = await HybridMusicProvider.search('', { includeExternal: false, limit: 100 });
      
      if (songs && songs.length > 0) {
        set({ queue: songs, currentSong: get().currentSong || songs[0] });
        // Guardar en caché para la próxima vez
        localStorage.setItem('musicfy_cached_queue', JSON.stringify(songs));
      }
    } catch (err) {
      console.warn('[usePlayerStore] Error al sincronizar cola local híbrida:', err);
    }
  },

  searchExternal: async (query) => {
    try {
      const { HybridMusicProvider } = await import('../providers/MusicProvider');
      return await HybridMusicProvider.search(query, { includeExternal: true, limit: 20 });
    } catch (err) {
      console.error('[usePlayerStore] Error en searchExternal:', err);
      return [];
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
      // Sincronizar estado completo (incluyendo letras) con los espejos
      get().broadcastState();
      get().saveRemotePlaybackState();
    }
  },

  playSong: async (song) => {
    const { currentSong, playbackHistory, deviceId, activeDeviceId, isPlaying, transferPlayback, queue } = get();

    // NUEVO: Intentar obtener versión offline primero si estamos desconectados
    try {
      const { OfflineManager } = await import('../lib/offlineManager');
      const isOnline = await OfflineManager.isOnline();
      
      if (!isOnline) {
        const offlineUrl = await OfflineManager.getOfflineUrl(song.id);
        if (offlineUrl) {
          console.log('[Player] Cargando versión offline de:', song.title);
          song = { ...song, url: offlineUrl, is_offline: true };
        } else {
          console.warn('[Player] Dispositivo offline y pista no descargada:', song.title);
          return; // Detener reproducción si no hay conectividad ni versión local
        }
      }
    } catch (offlineErr) {
      console.warn('[Player] Offline validation error:', offlineErr);
    }

    // LÓGICA DE CACHÉ INTELIGENTE (solo para recursos remotos)
    let playableUrl = song.url;
    if (!song.url && song.source === 'youtube') {
      try {
        const { HybridMusicProvider } = await import('../providers/MusicProvider');
        playableUrl = await HybridMusicProvider.getPlayableUrl(song);
      } catch (e) {
        console.error('[Player] Error al obtener URL de stream YouTube:', e);
        return;
      }
    } else if (song.url && !song.url.startsWith('data:') && !song.url.startsWith('blob:')) {
      const { CacheManager } = await import('../utils/cacheManager');
      playableUrl = await CacheManager.getOrCacheSong(song);
      
      // Pre-cachear la siguiente canción para que no haya saltos
      const currentIndex = queue.findIndex(s => s.id === song.id);
      if (currentIndex !== -1 && currentIndex < queue.length - 1 && queue[currentIndex + 1].url) {
        CacheManager.cacheSong(queue[currentIndex + 1].url);
      }
    }

    if (!activeDeviceId || !isPlaying) {
      if (activeDeviceId !== deviceId) {
        console.log("[Connect] ⚡ Sistema libre detectado. Tomando el control...");
        transferPlayback();
      }
    }

    if (currentSong && currentSong.id !== song.id) {
      set({ playbackHistory: [...playbackHistory, currentSong].slice(-50) });
    }

    const updatedAt = Date.now();
    // Usamos el playableUrl (que puede ser un blob local o stream de youtube)
    set({ 
      currentSong: { ...song, url: playableUrl }, 
      isPlaying: true, 
      currentTime: 0, 
      playbackUpdatedAt: updatedAt 
    });

    if (song.source !== 'youtube' && !song.lyrics) get().fetchSongDetails(song.id);
    get().sendCommand('PLAY_SONG', { song: { ...song, url: song.url }, updatedAt });
    get().saveRemotePlaybackState();
    
    // Registrar reproducción en el recomendador de gustos
    import('../utils/recommendationEngine').then(({ recommendationEngine }) => {
      recommendationEngine.recordPlay(song.id, queue);
    }).catch(e => console.error(e));
    
    // Mantenimiento de caché
    try {
      const { CacheManager } = await import('../utils/cacheManager');
      CacheManager.cleanOldCache(30);
    } catch {}
  },

  togglePlay: () => {
    const { isPlaying, activeDeviceId, transferPlayback, sendCommand } = get();
    const newState = !isPlaying;

    // Si vamos a poner PLAY y no hay nadie activo, tomamos el control
    if (newState && !activeDeviceId) {
      console.log("[Connect] ⚡ Reclamando audio al pulsar Play...");
      transferPlayback();
    }

    const updatedAt = Date.now();
    set({ isPlaying: newState, playbackUpdatedAt: updatedAt });
    sendCommand('TOGGLE_PLAY', { isPlaying: newState, updatedAt });
    get().saveRemotePlaybackState();
  },

  setVolume: (volume) => {
    set({ volume });
    get().sendCommand('SET_VOLUME', { volume });
  },

  setCurrentTime: (time, fromUI = false) => {
    if (fromUI) {
      const updatedAt = Date.now();
      set({ currentTime: time, playbackUpdatedAt: updatedAt });
      get().sendCommand('SEEK', { time, updatedAt });
      get().saveRemotePlaybackState();
    } else {
      set({ currentTime: time });
    }
  },

  setDuration: (duration) => set({ duration }),
  setQueue: (songs) => set({ queue: songs }),

  toggleShuffle: () => {
    const settings = useSettingsStore.getState();
    const nextShuffle = !settings.isShuffled;

    let newQueue = [...get().queue];

    if (nextShuffle) {
      // Algoritmo Fisher-Yates para mezclar la cola físicamente
      for (let i = newQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
      }
    } else {
      newQueue.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    set({ queue: newQueue });
    settings.setShuffle(nextShuffle);
  },

  toggleRepeat: () => {
    const settings = useSettingsStore.getState();
    const next = { none: 'one', one: 'all', all: 'none' };
    settings.setRepeatMode(next[settings.repeatMode]);
  },

  playNext: () => {
    const { currentSong, queue, playbackHistory } = get();
    const { repeatMode } = useSettingsStore.getState();

    if (!currentSong || queue.length === 0) return;

    // Guardar en historial antes de avanzar
    set({ playbackHistory: [...playbackHistory, currentSong].slice(-50) });

    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    let nextSong;

    if (repeatMode === 'one') {
      nextSong = { ...currentSong };
    } else if (currentIndex < queue.length - 1) {
      nextSong = queue[currentIndex + 1];
    } else if (repeatMode === 'all') {
      nextSong = queue[0];
    }

    if (nextSong) {
      const updatedAt = Date.now();
      set({
        currentSong: nextSong,
        isPlaying: true,
        currentTime: 0, // Reset estricto
        playbackUpdatedAt: updatedAt
      });
      if (!nextSong.lyrics) get().fetchSongDetails(nextSong.id);
      get().sendCommand('PLAY_SONG', { song: nextSong, updatedAt });
      get().saveRemotePlaybackState();
      
      // Registrar reproducción en el recomendador de gustos
      import('../utils/recommendationEngine').then(({ recommendationEngine }) => {
        recommendationEngine.recordPlay(nextSong.id, queue);
      }).catch(e => console.error(e));
    }
  },

  playPrevious: () => {
    const { playbackHistory, currentTime } = get();

    // 1. Si la canción lleva más de 3 segundos, solo reiniciamos el tiempo
    if (currentTime > 3) {
      const updatedAt = Date.now();
      set({ currentTime: 0, playbackUpdatedAt: updatedAt });
      get().sendCommand('SEEK', { time: 0, updatedAt });
      console.log("[Player] ⏮️ Reiniciando canción actual.");
      return;
    }

    // 2. Si estamos al principio, intentamos ir a la canción REAL anterior del historial
    if (playbackHistory.length > 0) {
      const newHistory = [...playbackHistory];
      const prevSong = newHistory.pop();

      set({
        currentSong: prevSong,
        isPlaying: true,
        playbackHistory: newHistory,
        playbackUpdatedAt: Date.now()
      });

      if (!prevSong.lyrics) get().fetchSongDetails(prevSong.id);
      get().sendCommand('PLAY_SONG', { song: prevSong, updatedAt: Date.now() });
      get().saveRemotePlaybackState();
      
      // Registrar reproducción en el recomendador de gustos
      const allSongs = get().queue;
      import('../utils/recommendationEngine').then(({ recommendationEngine }) => {
        recommendationEngine.recordPlay(prevSong.id, allSongs);
      }).catch(e => console.error(e));

      console.log("[Player] ⏪ Retrocediendo a:", prevSong.title);
    } else {
      // Si no hay historial, solo reiniciamos
      const updatedAt = Date.now();
      set({ currentTime: 0, playbackUpdatedAt: updatedAt });
      get().sendCommand('SEEK', { time: 0, updatedAt });
    }
  }
}));
