import { create } from 'zustand';
import { supabase } from '../supabaseClient';

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
  
  initialize: async () => {
    // Timeout de seguridad: Si la consulta a Supabase tarda más de 3.5 segundos en Vercel, forzar loading = false
    const safetyTimeout = setTimeout(() => {
      if (get().loading) {
        console.warn('[useAuthStore] Timeout de seguridad alcanzado en inicialización de Auth. Forzando fin de carga.');
        set({ loading: false });
      }
    }, 3500);

    try {
      // 1. Obtener sesión actual al abrir la app
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      
      const user = session?.user || null;
      let isAdmin = false;
      
      if (user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          
          if (profile && profile.role === 'admin') {
            isAdmin = true;
          }
        } catch (pe) {
          console.warn('[useAuthStore] Error leyendo perfil de usuario:', pe);
        }
      }
      
      set({ session, user, isAdmin, loading: false });
    } catch (err) {
      console.warn('[useAuthStore] Error o ausencia de sesión previa:', err);
      set({ session: null, user: null, isAdmin: false, loading: false });
    } finally {
      clearTimeout(safetyTimeout);
    }

    // 2. Escuchar en tiempo real si el usuario inicia o cierra sesión
    try {
      supabase.auth.onAuthStateChange(async (_event, session) => {
        const currentUser = session?.user || null;
        let currentIsAdmin = false;
        
        if (currentUser) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', currentUser.id)
              .maybeSingle();
              
            if (profile && profile.role === 'admin') {
              currentIsAdmin = true;
            }
          } catch (pe) {}
        }
        
        set({ session, user: currentUser, isAdmin: currentIsAdmin, loading: false });
      });
    } catch (e) {
      set({ loading: false });
    }
  },
  
  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error al cerrar sesión en servidor:", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      
      set({ user: null, session: null, isAdmin: false });
      window.location.href = '/login';
    }
  }
}));

