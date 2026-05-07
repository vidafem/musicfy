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
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUser.id)
          .single();
          
        if (profile && profile.role === 'admin') {
          currentIsAdmin = true;
        }
      }
      
      set({ session, user: currentUser, isAdmin: currentIsAdmin, loading: false });
    });
  },
  
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, isAdmin: false });
  }
}));
