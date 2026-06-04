import { create } from 'zustand';
import { supabase } from '../supabaseClient';
import { useSettingsStore } from './useSettingsStore';
import { dbStore } from '../utils/indexedDB';
import { BACKEND_URL } from '../config';
import { fetchWithTimeout } from '../utils/fetchHelper';

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

  activeSongMenu: null,
  activePlaylistContext: null,
  setActiveSongMenu: (song, playlistContext = null) => set({ activeSongMenu: song, activePlaylistContext: playlistContext }),
  closeSongMenu: () => set({ activeSongMenu: null, activePlaylistContext: null }),

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

    const isUuid = currentSong?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentSong.id);

    await supabase
      .from('profiles')
      .update({
        last_played_id: isUuid ? currentSong.id : null,
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
    // 1. Carga inicial desde IndexedDB (Carga instantánea)
    try {
      const savedQueue = await dbStore.get('queue');
      const savedSong = await dbStore.get('currentSong');
      const savedTime = await dbStore.get('currentTime');
      
      if (savedQueue && savedQueue.length > 0) {
        set({ 
          queue: savedQueue, 
          currentSong: get().currentSong || savedSong || savedQueue[0],
          currentTime: savedTime || 0
        });
      } else {
        // Fallback a localStorage
        const cachedQueue = localStorage.getItem('musicfy_cached_queue');
        if (cachedQueue) {
          const parsed = JSON.parse(cachedQueue);
          if (parsed.length > 0) {
            set({ queue: parsed, currentSong: get().currentSong || parsed[0] });
          }
        }
      }
    } catch (e) {
      console.warn('[usePlayerStore] Error al cargar de IndexedDB:', e);
    }

    // 2. Sincronización con el servidor a través del HybridMusicProvider
    try {
      const { HybridMusicProvider } = await import('../providers/MusicProvider');
      const songs = await HybridMusicProvider.search('', { includeExternal: false, limit: 100 });
      
      if (songs && songs.length > 0) {
        set({ queue: songs, currentSong: get().currentSong || songs[0] });
        // Guardar en caché para la próxima vez
        localStorage.setItem('musicfy_cached_queue', JSON.stringify(songs));
        await dbStore.set('queue', songs);
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
    // 1. Validar si es un UUID para evitar error HTTP 400 en Supabase
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(songId);
    let lyrics = null;
    let background_url = null;

    if (isUuid) {
      const { data, error } = await supabase
        .from('songs')
        .select('lyrics, background_url')
        .eq('id', songId)
        .maybeSingle();

      if (!error && data) {
        lyrics = data.lyrics;
        background_url = data.background_url;
      }
    }

    // 2. Si no tiene letras (canción externa o vacía en DB), buscar en LRCLib
    if (!lyrics) {
      const song = get().queue.find(s => s.id === songId) || get().currentSong;
      if (song && song.title) {
        try {
          const cleanArtist = song.artist && song.artist !== 'Artista Desconocido' ? song.artist : '';
          let url = '';
          if (cleanArtist) {
            url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(song.title)}`;
          } else {
            url = `https://lrclib.net/api/search?q=${encodeURIComponent(song.title)}`;
          }
          
          const lrcRes = await fetch(url);
          if (lrcRes.ok) {
            const lrcData = await lrcRes.json();
            if (lrcData && lrcData.length > 0) {
              // Preferir syncedLyrics (letras sincronizadas), sino plainLyrics
              lyrics = lrcData[0].syncedLyrics || lrcData[0].plainLyrics || null;
            }
          }
        } catch (e) {
          console.warn('[usePlayerStore] Error al buscar letras en LRCLib:', e);
        }
      }
    }

    // 3. Guardar en el estado si encontramos algún dato nuevo
    if (lyrics || background_url) {
      set((state) => ({
        queue: state.queue.map(s => s.id === songId ? { ...s, lyrics: lyrics || s.lyrics, background_url: background_url || s.background_url } : s),
        currentSong: state.currentSong?.id === songId ? { ...state.currentSong, lyrics: lyrics || state.currentSong.lyrics, background_url: background_url || state.currentSong.background_url } : state.currentSong
      }));
      // Sincronizar estado completo (incluyendo letras) con los espejos
      get().broadcastState();
      get().saveRemotePlaybackState();
    }
  },

  autoplayProcessedId: null,

  loadAutoplayNext: async (song) => {
    if (!song) return;
    const { queue, autoplayProcessedId } = get();
    
    // Evitar procesar el autoplay varias veces para la misma canción
    if (autoplayProcessedId === song.id) return;
    set({ autoplayProcessedId: song.id });

    const currentIndex = queue.findIndex(s => s.id === song.id);
    
    // Solo cargamos autoplay si es la última canción de la cola o no está en la cola
    if (currentIndex === -1 || currentIndex === queue.length - 1) {
      console.log(`[Autoplay] Cargando música similar para: ${song.title} por ${song.artist}`);
      const existingIds = new Set(queue.map(s => s.id));
      
      if (song.source === 'youtube') {
        try {
          const res = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(song.artist)}&type=song`, {}, 15000);
          if (res.ok) {
            const data = await res.json();
            const newSongs = (data.items || []).map(item => {
              const yid = item.id.videoId;
              return {
                id: yid,
                title: item.snippet.title,
                artist: item.snippet.channelTitle,
                cover_url: item.snippet.thumbnails?.high?.url || '',
                url: null,
                source: 'youtube',
                youtube_id: yid,
                is_external: true,
                is_video: false
              };
            }).filter(s => s.id !== song.id && !existingIds.has(s.id)); // Evitar duplicar la actual y las existentes
            
            if (newSongs.length > 0) {
              const updatedQueue = [...queue];
              if (currentIndex === -1) {
                updatedQueue.push(song);
              }
              updatedQueue.push(...newSongs.slice(0, 10)); // agregar 10 canciones similares
              set({ queue: updatedQueue });
              dbStore.set('queue', updatedQueue);
              console.log(`[Autoplay] Agregadas ${newSongs.slice(0, 10).length} canciones de YouTube similares a la cola.`);
            }
          }
        } catch (e) {
          console.warn('[Autoplay] Error cargando canciones similares de YouTube:', e);
        }
      } else {
        // Local
        try {
          let queryBuilder = supabase.from('songs').select('*');
          if (song.artist && song.artist !== 'Artista Desconocido') {
            queryBuilder = queryBuilder.eq('artist', song.artist);
          } else if (song.genre) {
            queryBuilder = queryBuilder.eq('genre', song.genre);
          }
          
          const { data: matches } = await queryBuilder.limit(15);
          let localSongs = (matches || [])
            .map(s => ({ ...s, source: s.source || 'local', is_local: true }))
            .filter(s => s.id !== song.id && !existingIds.has(s.id));
            
          if (localSongs.length === 0) {
            // Fallback a cualquier canción local
            const { data: anyLocal } = await supabase.from('songs').select('*').limit(10);
            localSongs = (anyLocal || [])
              .map(s => ({ ...s, source: s.source || 'local', is_local: true }))
              .filter(s => s.id !== song.id && !existingIds.has(s.id));
          }

          if (localSongs.length > 0) {
            const updatedQueue = [...queue];
            if (currentIndex === -1) {
              updatedQueue.push(song);
            }
            updatedQueue.push(...localSongs.slice(0, 10));
            set({ queue: updatedQueue });
            dbStore.set('queue', updatedQueue);
            console.log(`[Autoplay] Agregadas ${localSongs.slice(0, 10).length} canciones locales similares a la cola.`);
          }
        } catch (e) {
          console.warn('[Autoplay] Error cargando canciones similares locales:', e);
        }
      }
    }
  },

  playSong: async (song) => {
    const { currentSong, playbackHistory, deviceId, activeDeviceId, isPlaying, transferPlayback, queue } = get();

    // NUEVO: Intentar obtener versión offline primero para reproducción inmediata y ahorro de red
    try {
      const { OfflineManager } = await import('../lib/offlineManager');
      const offlineUrl = await OfflineManager.getOfflineUrl(song.id);
      if (offlineUrl) {
        console.log('[Player] Cargando versión offline descargada de:', song.title);
        song = { ...song, url: offlineUrl, is_offline: true };
      } else {
        const isOnline = await OfflineManager.isOnline();
        if (!isOnline) {
          console.warn('[Player] Dispositivo offline y pista no descargada:', song.title);
          return; // Detener reproducción si no hay conectividad ni versión local
        }
      }
    } catch (offlineErr) {
      console.warn('[Player] Offline validation error:', offlineErr);
    }

    // LÓGICA DE CACHÉ INTELIGENTE (solo para recursos remotos locales)
    let playableUrl = song.url;
    const isYouTube = song.source === 'youtube' || song.is_external || (song.url && (song.url.includes('googlevideo.com') || song.url.includes('youtube.com') || song.url.includes('youtu.be')));

    // Si es YouTube y la URL no está definida o es un enlace directo de watch, resolver el stream real.
    const needsYtResolution = isYouTube && (!song.url || song.url.includes('youtube.com') || song.url.includes('youtu.be') || song.url === 'youtube_stream');

    if (needsYtResolution) {
      try {
        const { HybridMusicProvider } = await import('../providers/MusicProvider');
        playableUrl = await HybridMusicProvider.getPlayableUrl(song);
      } catch (e) {
        console.warn('[Player] Backend stream resolution failed, falling back to client-side YouTube Iframe:', e.message);
        playableUrl = 'youtube_iframe_fallback';
      }
    } else if (song.url && !song.url.startsWith('data:') && !song.url.startsWith('blob:') && !isYouTube) {
      const { CacheManager } = await import('../utils/cacheManager');
      playableUrl = await CacheManager.getOrCacheSong(song);
      
      // Pre-cachear la siguiente canción para que no haya saltos
      const currentIndex = queue.findIndex(s => s.id === song.id);
      if (currentIndex !== -1 && currentIndex < queue.length - 1 && queue[currentIndex + 1].url) {
        CacheManager.cacheSong(queue[currentIndex + 1].url);
      }
    }

    if (!activeDeviceId) {
      console.log("[Connect] No active device, taking control...");
      transferPlayback(deviceId);
    }

    if (currentSong && currentSong.id !== song.id) {
      set({ playbackHistory: [...playbackHistory, currentSong].slice(-50) });
    }

    const updatedAt = Date.now();
    // Usamos el playableUrl (que puede ser un blob local o stream de youtube)
    const newSongState = { ...song, url: playableUrl };
    set({ 
      currentSong: newSongState, 
      isPlaying: true, 
      currentTime: 0, 
      playbackUpdatedAt: updatedAt
    });

    // Guardar en IndexedDB
    dbStore.set('currentSong', newSongState);
    dbStore.set('queue', queue);

    if (!song.lyrics) get().fetchSongDetails(song.id);
    get().sendCommand('PLAY_SONG', { song: { ...song, url: song.url }, updatedAt });
    get().saveRemotePlaybackState();
    
    // Registrar reproducción en el recomendador de gustos
    import('../utils/recommendationEngine').then(({ recommendationEngine }) => {
      recommendationEngine.recordPlay(song, queue);
    }).catch(e => console.error(e));

    // Cargar autoplay en segundo plano
    get().loadAutoplayNext(song);
    
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
    // Evitar sobrecargar escrituras en IDB limitándolo
    if (Math.round(time) % 5 === 0) {
      dbStore.set('currentTime', time);
    }
  },

  setDuration: (duration) => set({ duration }),
  setQueue: (songs) => {
    set({ queue: songs });
    dbStore.set('queue', songs);
  },

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
        recommendationEngine.recordPlay(nextSong, queue);
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
        recommendationEngine.recordPlay(prevSong, allSongs);
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
