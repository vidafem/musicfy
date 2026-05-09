import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Usamos el middleware "persist" de Zustand para que la configuración 
// se guarde automáticamente en el disco local (localStorage) de cada dispositivo.
export const useSettingsStore = create(
  persist(
    (set, get) => ({
      // ESTADOS POR DEFECTO
      animatedCovers: true,
      crossfadeEnabled: false,
      crossfadeTime: 10,
      equalizerEnabled: false,
      eqGains: [0, 0, 0, 0, 0], // Niveles del EQ por defecto
      likedSongs: [], // Array de IDs de canciones marcadas con ❤️
      accentColor: '#00ffff', // Color de neón por defecto
      accentOpacity: 1,      // Opacidad del sistema
      isShuffled: false,
      repeatMode: 'none',    // 'none', 'one', 'all'

      // ACCIONES PARA MODIFICAR ESTADOS
      toggleAnimatedCovers: () => {
        set((state) => ({ animatedCovers: !state.animatedCovers }));
        get().saveSettingsToCloud();
      },
      toggleCrossfade: () => {
        set((state) => ({ crossfadeEnabled: !state.crossfadeEnabled }));
        get().saveSettingsToCloud();
      },
      setCrossfadeTime: (time) => {
        set({ crossfadeTime: Math.min(20, time) });
        get().saveSettingsToCloud();
      },
      toggleEqualizer: () => {
        set((state) => ({ equalizerEnabled: !state.equalizerEnabled }));
        get().saveSettingsToCloud();
      },
      setEqGains: (gains) => {
        set({ eqGains: gains });
        get().saveSettingsToCloud();
      },
      setAccentColor: (color) => {
        set({ accentColor: color });
        get().saveSettingsToCloud();
      },
      setAccentOpacity: (opacity) => {
        set({ accentOpacity: opacity });
        get().saveSettingsToCloud();
      },

      setShuffle: (val) => {
        set({ isShuffled: val });
        get().saveSettingsToCloud();
      },

      setRepeatMode: (mode) => {
        set({ repeatMode: mode });
        get().saveSettingsToCloud();
      },

      // Función para aplicar ajustes recibidos de otro dispositivo
      applyRemoteSettings: (newSettings) => {
        window._isRemoteSettingsUpdate = true;
        set({ ...newSettings });
        // Liberamos la bandera después de un breve momento para permitir cambios locales
        setTimeout(() => { window._isRemoteSettingsUpdate = false; }, 100);
      },

      // Guardar en la base de datos de Supabase para persistencia entre sesiones/dispositivos
      saveSettingsToCloud: async () => {
        const { supabase } = await import('../supabaseClient');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const currentSettings = {
          accentColor: get().accentColor,
          accentOpacity: get().accentOpacity,
          animatedCovers: get().animatedCovers,
          crossfadeEnabled: get().crossfadeEnabled,
          crossfadeTime: get().crossfadeTime,
          equalizerEnabled: get().equalizerEnabled,
          eqGains: get().eqGains,
          isShuffled: get().isShuffled,
          repeatMode: get().repeatMode
        };

        await supabase
          .from('profiles')
          .update({ settings: currentSettings })
          .eq('id', user.id);
      },

      // Agregar o quitar una canción de Me Gusta (guarda solo el ID)
      toggleLike: (songId, songData = null) => {
        const { likedSongs, addExternalSong } = get();
        const already = likedSongs.includes(songId);
        
        // Si es una canción externa (YouTube) y no la tenemos, la guardamos en la DB primero
        if (!already && songData?.is_external) {
            addExternalSong(songData);
        }

        set({
          likedSongs: already
            ? likedSongs.filter(id => id !== songId)
            : [...likedSongs, songId]
        });
      },

      // Persistir metadata de YouTube en Supabase
      addExternalSong: async (song) => {
        const { supabase } = await import('../supabaseClient');
        const { data: existing } = await supabase
            .from('songs')
            .select('id')
            .eq('title', song.title)
            .eq('artist', song.artist)
            .single();

        if (!existing) {
            await supabase.from('songs').insert([{
                title: song.title,
                artist: song.artist,
                url: song.url,
                cover_url: song.cover_url,
                lyrics: '[Streaming de YouTube]'
            }]);
        }
      },
      
      // LÓGICA PARA ELIMINAR CACHÉ
      clearCache: async () => {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            await caches.delete(name);
          }
        }
        alert('Caché, archivos temporales y portadas eliminadas correctamente.');
      }
    }),
    {
      name: 'musicfy-settings', 
    }
  )
);

// --- SINCRONIZACIÓN INTELIGENTE DE AJUSTES ---
let syncTimeout = null;
useSettingsStore.subscribe((state) => {
    // Si la actualización viene de otro dispositivo, NO la re-transmitimos
    if (window._isRemoteSettingsUpdate) return;

    // Usamos un pequeño 'debounce' para no saturar la red con cada movimiento del slider
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        import('./usePlayerStore').then(({ usePlayerStore }) => {
            const sendCommand = usePlayerStore.getState().sendCommand;
            if (sendCommand) {
                sendCommand('SYNC_SETTINGS', {
                    accentColor: state.accentColor,
                    accentOpacity: state.accentOpacity,
                    animatedCovers: state.animatedCovers,
                    crossfadeEnabled: state.crossfadeEnabled,
                    crossfadeTime: state.crossfadeTime,
                    equalizerEnabled: state.equalizerEnabled,
                    eqGains: state.eqGains
                });
            }
        });
    }, 500); // Esperamos 500ms tras el último cambio antes de sincronizar
});
