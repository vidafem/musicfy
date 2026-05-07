import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Usamos el middleware "persist" de Zustand para que la configuración 
// se guarde automáticamente en el disco local (localStorage) de cada dispositivo.
export const useSettingsStore = create(
  persist(
    (set) => ({
      // ESTADOS POR DEFECTO
      animatedCovers: true,
      crossfadeEnabled: false,
      crossfadeTime: 3, // Segundos de mezcla
      equalizerEnabled: false,
      
      // ACCIONES PARA MODIFICAR ESTADOS
      toggleAnimatedCovers: () => set((state) => ({ animatedCovers: !state.animatedCovers })),
      toggleCrossfade: () => set((state) => ({ crossfadeEnabled: !state.crossfadeEnabled })),
      setCrossfadeTime: (time) => set({ crossfadeTime: time }),
      toggleEqualizer: () => set((state) => ({ equalizerEnabled: !state.equalizerEnabled })),
      
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
      name: 'musicfy-settings', // Nombre de la base de datos local
    }
  )
);
