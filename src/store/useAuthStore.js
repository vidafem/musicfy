import { create } from 'zustand';
import { supabase } from '../supabaseClient';

export const useAuthStore = create((set) => ({
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
  
  initialize: async () => {
    // 1. Obtener sesión actual al abrir la app
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user || null;
    
    // VERIFICACIÓN DE ROL DESDE BASE DE DATOS:
    // Hacemos una consulta a la tabla 'profiles' para saber si es admin
    let isAdmin = false;
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle(); // Usamos maybeSingle para que no lance error si no hay fila
      
      if (profile && profile.role === 'admin') {
        isAdmin = true;
      }
    }
    
    set({ session, user, isAdmin, loading: false });

    // 2. Escuchar en tiempo real si el usuario inicia o cierra sesión
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user || null;
      let currentIsAdmin = false;
      
      if (currentUser) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUser.id)
          .maybeSingle();
          
        if (profile && profile.role === 'admin') {
          currentIsAdmin = true;
        }
      }
      
      set({ session, user: currentUser, isAdmin: currentIsAdmin, loading: false });
    });
  },
  
  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error al cerrar sesión en servidor:", error);
    } finally {
      // LIMPIEZA TOTAL: Borramos todo rastro local para evitar sesiones fantasma
      localStorage.clear();
      sessionStorage.clear();
      
      set({ user: null, session: null, isAdmin: false });
      
      // Forzamos recarga para limpiar estados de otros stores (Settings, Library, etc)
      window.location.href = '/login';
    }
  }
}));
