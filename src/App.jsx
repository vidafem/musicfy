import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import ClientLayout from './layouts/ClientLayout';
import AdminLayout from './layouts/AdminLayout';
import { useAuthStore } from './store/useAuthStore';
import './App.css';

export default function App() {
  // Traemos el estado de autenticación global que configuramos con Zustand
  const { initialize, user, isAdmin, loading } = useAuthStore();

  useEffect(() => {
    // Al abrir la app, verificamos si ya hay un usuario logueado en Supabase
    initialize();
  }, [initialize]);

  // Pantalla de carga súper limpia mientras verificamos la sesión
  if (loading) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <img src="/icono.png" alt="Cargando Musicfy..." style={{ width: '60px', opacity: 0.5, animation: 'pulse 1.5s infinite' }} />
        <style>{`@keyframes pulse { 0% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 0.5; } }`}</style>
      </div>
    );
  }

  // ENRUTAMIENTO INTELIGENTE Y SEGURO (Protección de rutas)
  return (
    <BrowserRouter>
      <Routes>
        
        {/* RUTA PÚBLICA: El Login que ya terminamos */}
        <Route 
          path="/login" 
          // Si el usuario YA está logueado, lo pateamos a su respectivo panel
          element={!user ? <Login /> : <Navigate to={isAdmin ? "/admin" : "/"} replace />} 
        />

        {/* RUTAS DEL CLIENTE (El clon de Spotify/Apple Music) */}
        <Route 
          path="/*" 
          // Si es usuario normal, lo dejamos entrar. Si no hay usuario, al login. Si es admin, al panel de admin.
          element={user && !isAdmin ? <ClientLayout /> : <Navigate to={user ? "/admin" : "/login"} replace />} 
        />

        {/* RUTAS DEL ADMINISTRADOR (Tu panel de control privado) */}
        <Route 
          path="/admin/*" 
          // Solo entra si existe el usuario Y además es administrador
          element={user && isAdmin ? <AdminLayout /> : <Navigate to={user ? "/" : "/login"} replace />} 
        />

      </Routes>
    </BrowserRouter>
  );
}
