import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

/**
 * ADMIN LAYOUT
 * Este será tu panel privado para subir música y administrar la app.
 */
export default function AdminLayout() {
  const { signOut, user } = useAuthStore();

  return (
    <div style={{ color: 'white', backgroundColor: '#050505', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* HEADER DE ADMIN */}
      <header style={{ padding: '20px', borderBottom: '1px solid rgba(0,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/icono.png" alt="Musicfy" style={{ width: '30px', filter: 'hue-rotate(90deg)' }} />
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: '#00ffff' }}>Panel de Control (Admin)</h2>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
           <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>{user.email}</span>
           
           <button 
             onClick={signOut} 
             style={{ 
                 background: 'rgba(255,0,0,0.1)', 
                 color: '#ff4d4f', 
                 border: '1px solid rgba(255,0,0,0.3)',
                 padding: '8px 16px',
                 borderRadius: '20px',
                 cursor: 'pointer',
                 fontWeight: 'bold'
             }}
           >
             Cerrar Sesión
           </button>
        </div>
      </header>
      
      {/* ZONA DE ADMINISTRACIÓN */}
      <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
        <Routes>
           <Route path="/" element={
             <div>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Gestión de Música</h1>
                <p style={{ color: 'rgba(255,255,255,0.5)' }}>Desde aquí subiremos archivos MP3 a Supabase Storage y obtendremos carátulas gratis de IMDb/MusicBrainz.</p>
             </div>
           } />
        </Routes>
      </div>
    </div>
  );
}
