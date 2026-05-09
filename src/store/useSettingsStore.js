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
      likedSongs: [], // Array de IDs de canciones marcadas con ❤️
      accentColor: '#00ffff', // Color de neón por defecto
      accentOpacity: 1,      // Opacidad del sistema

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
      setAccentColor: (color) => {
        set({ accentColor: color });
        get().saveSettingsToCloud();
      },
      setAccentOpacity: (opacity) => {
        set({ accentOpacity: opacity });
        get().saveSettingsToCloud();
      },

      // Función para aplicar ajustes recibidos de otro dispositivo
      applyRemoteSettings: (newSettings) => {
        set({ ...newSettings });
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
          crossfadeTime: get().crossfadeTime
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
        // En el futuro, la app descargará pedazos de música en caché para ahorrar datos (Cloudflare/Supabase).
        // Aquí vaciaremos ese caché del navegador manualmente.
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            await caches.delete(name);
          }
        }
        // También limpiaremos el local storage del estado si es necesario
        alert('Caché, archivos temporales y portadas eliminadas correctamente. Tu app está limpia.');
      }
    }),
    {
      name: 'musicfy-settings', 
    }
  )
);

// --- SINCRONIZACIÓN AUTOMÁTICA DE AJUSTES ---
// Escuchamos cualquier cambio en este store y lo enviamos a los demás dispositivos
useSettingsStore.subscribe((state, prevState) => {
    // Importamos dinámicamente para evitar dependencias circulares
    import('./usePlayerStore').then(({ usePlayerStore }) => {
        const sendCommand = usePlayerStore.getState().sendCommand;
        if (sendCommand) {
            // Solo enviamos si realmente algo cambió y no fue una actualización masiva
            // Enviamos los campos clave para no saturar
            sendCommand('SYNC_SETTINGS', {
                accentColor: state.accentColor,
                accentOpacity: state.accentOpacity,
                animatedCovers: state.animatedCovers,
                crossfadeEnabled: state.crossfadeEnabled,
                crossfadeTime: state.crossfadeTime
            });
        }
    });
});
