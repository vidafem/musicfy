import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { LayoutDashboard, Music, Users, ImagePlay, Settings, LogOut, UploadCloud, Layers } from 'lucide-react';
import MusicManager from '../pages/admin/MusicManager';
import AdminDashboard from '../pages/admin/AdminDashboard';
import MediaLibrary from '../pages/admin/MediaLibrary';
import './AdminLayout.css';

export default function AdminLayout() {
  const { signOut, user } = useAuthStore();
  const location = useLocation();

  // Función para obtener el título según la ruta actual
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/admin') return 'Dashboard General';
    if (path.includes('/admin/music')) return 'Gestión de Música e IA';
    if (path.includes('/admin/media')) return 'Media y Fondos';
    if (path.includes('/admin/users')) return 'Gestión de Usuarios';
    if (path.includes('/admin/settings')) return 'Configuraciones';
    return 'Panel de Control';
  };

  return (
    <div className="admin-container">
      
      {/* SIDEBAR */}
      <aside className="admin-sidebar">
        <div className="admin-logo">
          <img src="/icono.png" alt="Musicfy" />
          <h2>Musicfy<span>Admin</span></h2>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin" end className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} /> Dashboard
          </NavLink>
          <NavLink to="/admin/music" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Music size={20} /> Librería Musical
          </NavLink>
          <NavLink to="/admin/media" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <ImagePlay size={20} /> Media & Fondos
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Users size={20} /> Usuarios
          </NavLink>
          <NavLink to="/admin/settings" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={20} /> Ajustes Generales
          </NavLink>
        </nav>

        <div className="admin-user-card">
          <div className="admin-user-info">
            <span className="role">Administrador</span>
            <span className="email">{user?.email || 'admin@musicfy.com'}</span>
          </div>
          <button className="admin-logout-btn" onClick={signOut} title="Cerrar Sesión">
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="admin-main-content">
        
        {/* TOPBAR */}
        <header className="admin-topbar">
          <h1>{getPageTitle()}</h1>
        </header>
        
        {/* ZONA DE VISTAS (RUTAS) */}
        <div className="admin-content-area">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/music" element={<MusicManager />} />
            <Route path="/media" element={<MediaLibrary />} />
            <Route path="/users" element={<div style={{ padding: '20px' }}>Gestión de Usuarios (Próximamente)</div>} />
            <Route path="/settings" element={<div style={{ padding: '20px' }}>Configuración (Próximamente)</div>} />
          </Routes>
        </div>

      </main>
    </div>
  );
}
