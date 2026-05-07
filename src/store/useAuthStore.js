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
    
    // VERIFICACIÓN DE ROL:
    // Por ahora, para que puedas probar, define aquí el correo que será el administrador.
    // Más adelante lo conectaremos a tu tabla de perfiles en la BD.
    const isAdmin = user?.email === 'tu_correo_admin@ejemplo.com' || user?.user_metadata?.role === 'admin';
    
    set({ session, user, isAdmin, loading: false });

    // 2. Escuchar en tiempo real si el usuario inicia o cierra sesión
    supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;
      const currentIsAdmin = currentUser?.email === 'tu_correo_admin@ejemplo.com' || currentUser?.user_metadata?.role === 'admin';
      
      set({ session, user: currentUser, isAdmin: currentIsAdmin, loading: false });
    });
  },
  
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, isAdmin: false });
  }
}));
