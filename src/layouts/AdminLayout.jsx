import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { LayoutDashboard, Music, Users, ImagePlay, Settings, LogOut, UploadCloud, Layers, Menu, X as CloseIcon } from 'lucide-react';
import MusicManager from '../pages/admin/MusicManager';
import AdminDashboard from '../pages/admin/AdminDashboard';
import MediaLibrary from '../pages/admin/MediaLibrary';
import UserManager from '../pages/admin/UserManager';
import './AdminLayout.css';

export default function AdminLayout() {
  const { signOut, user } = useAuthStore();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  // Función para obtener el título según la ruta actual
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/admin') return 'Dashboard';
    if (path.includes('/admin/music')) return 'Librería & IA';
    if (path.includes('/admin/media')) return 'Media';
    if (path.includes('/admin/users')) return 'Usuarios';
    if (path.includes('/admin/settings')) return 'Ajustes';
    return 'Panel';
  };

  return (
    <div className={`admin-container ${isSidebarOpen ? 'sidebar-open' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      
      {/* OVERLAY PARA MÓVIL */}
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* SIDEBAR */}
      <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="admin-logo">
          <img src="/icono.png" alt="Musicfy" />
          {!isSidebarCollapsed && <h2>Musicfy<span>Admin</span></h2>}
          <button className="sidebar-close-mobile" onClick={() => setIsSidebarOpen(false)}>
            <CloseIcon size={24} />
          </button>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin" end onClick={() => setIsSidebarOpen(false)} className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`} title="Dashboard">
            <LayoutDashboard size={20} /> {!isSidebarCollapsed && <span>Dashboard</span>}
          </NavLink>
          <NavLink to="/admin/music" onClick={() => setIsSidebarOpen(false)} className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`} title="Librería Musical">
            <Music size={20} /> {!isSidebarCollapsed && <span>Librería Musical</span>}
          </NavLink>
          <NavLink to="/admin/media" onClick={() => setIsSidebarOpen(false)} className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`} title="Media & Fondos">
            <ImagePlay size={20} /> {!isSidebarCollapsed && <span>Media & Fondos</span>}
          </NavLink>
          <NavLink to="/admin/users" onClick={() => setIsSidebarOpen(false)} className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`} title="Usuarios">
            <Users size={20} /> {!isSidebarCollapsed && <span>Usuarios</span>}
          </NavLink>
          <NavLink to="/admin/settings" onClick={() => setIsSidebarOpen(false)} className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`} title="Configuraciones">
            <Settings size={20} /> {!isSidebarCollapsed && <span>Ajustes</span>}
          </NavLink>
        </nav>

        <div className="admin-user-card">
          {!isSidebarCollapsed && (
            <div className="admin-user-info">
              <span className="role">Admin</span>
              <span className="email">{user?.email?.split('@')[0] || 'admin'}</span>
            </div>
          )}
          <button className="admin-logout-btn" onClick={signOut} title="Cerrar Sesión">
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="admin-main-content">
        
        {/* TOPBAR */}
        <header className="admin-topbar">
          <button className="sidebar-toggle-btn" onClick={() => {
            if (window.innerWidth <= 900) {
              setIsSidebarOpen(true);
            } else {
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }
          }}>
            <Menu size={24} />
          </button>
          <h1>{getPageTitle()}</h1>
        </header>
        
        {/* ZONA DE VISTAS (RUTAS) */}
        <div className="admin-content-area">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/music" element={<MusicManager />} />
            <Route path="/media" element={<MediaLibrary />} />
            <Route path="/users" element={<UserManager />} />
            <Route path="/settings" element={<div style={{ padding: '20px' }}>Configuración (Próximamente)</div>} />
          </Routes>
        </div>

      </main>
    </div>
  );
}
