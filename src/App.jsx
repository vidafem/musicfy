import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import { useAuthStore } from './store/useAuthStore';
import { isTV } from './lib/tvDetector';
import './App.css';

// CARGA INTELIGENTE (Lazy Loading) de componentes pesados
const ClientLayout = lazy(() => import('./layouts/ClientLayout'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const TVLayout = lazy(() => import('./layouts/TVLayout'));

export default function App() {
  const { initialize, user, isAdmin, loading } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Detección y redirección automática para Smart TVs
  useEffect(() => {
    if (!loading && user && isTV() && window.location.pathname !== '/tv') {
      console.log('[TV Detector] Smart TV detectada. Redireccionando a la interfaz de TV inmersiva.');
      window.location.replace('/tv');
    }
  }, [loading, user]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        
        {/* RUTA PÚBLICA */}
        <Route 
          path="/login" 
          element={!user ? <Login /> : <Navigate to={isTV() ? "/tv" : (isAdmin ? "/admin" : "/")} replace />} 
        />

        {/* RUTA DE TV INMERSIVA */}
        <Route
          path="/tv"
          element={
            user ? (
              <Suspense fallback={<LoadingScreen />}>
                <TVLayout />
              </Suspense>
            ) : <Navigate to="/login" replace />
          }
        />

        {/* RUTAS DEL CLIENTE (Spotify/Apple Music clone) */}
        <Route 
          path="/*" 
          element={
            user && !isAdmin ? (
              <Suspense fallback={<LoadingScreen />}>
                <ClientLayout />
              </Suspense>
            ) : <Navigate to={user ? "/admin" : "/login"} replace />
          } 
        />

        {/* RUTAS DEL ADMINISTRADOR */}
        <Route 
          path="/admin/*" 
          element={
            user && isAdmin ? (
              <Suspense fallback={<LoadingScreen />}>
                <AdminLayout />
              </Suspense>
            ) : <Navigate to={user ? "/" : "/login"} replace />
          } 
        />

      </Routes>
    </BrowserRouter>
  );
}

// Componente de carga reutilizable
function LoadingScreen() {
  return (
    <div style={{ height: '100vh', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <img src="/icono.png" alt="Cargando..." style={{ width: '60px', opacity: 0.5, animation: 'pulse 1.5s infinite' }} />
      <style>{`@keyframes pulse { 0% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 0.5; } }`}</style>
    </div>
  );
}
