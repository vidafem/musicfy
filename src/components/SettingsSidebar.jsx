import React from 'react';
import { X, Settings, Sliders, Trash2, LogOut, Disc3, Palette } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import GlassButtonWrapper from './ui/GlassButtonWrapper';
import './SettingsSidebar.css';

export default function SettingsSidebar({ isOpen, onClose }) {
  const { 
    animatedCovers, toggleAnimatedCovers,
    crossfadeEnabled, toggleCrossfade,
    crossfadeTime, setCrossfadeTime,
    equalizerEnabled, toggleEqualizer,
    accentColor, setAccentColor,
    accentOpacity, setAccentOpacity,
    clearCache
  } = useSettingsStore();
  
  const { signOut, user } = useAuthStore();

  return (
    <>
      {/* Fondo oscuro desenfocado */}
      <div className={`settings-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
      
      {/* Panel Lateral que entra desde la derecha */}
      <div className={`settings-sidebar ${isOpen ? 'open' : ''}`}>
        
        <div className="settings-header">
          <h2><Settings size={22} /> Configuración</h2>
          <button className="close-btn" onClick={onClose}><X size={26} /></button>
        </div>
        
        {/* CONTROLES (Lista deslizable completa) */}
        <div className="settings-content">
          
          {/* Información del Usuario Integrada al Scroll */}
          <div className="settings-user-info">
            <div className="user-avatar">
              {user?.email?.charAt(0).toUpperCase() || 'M'}
            </div>
            <div className="user-details">
              <span className="user-email">{user?.email}</span>
              <span className="user-plan">Cuenta Cliente</span>
            </div>
          </div>
          
          <div className="settings-section">
            <h3>Reproducción</h3>
            
            <div className="setting-item">
              <div className="setting-info">
                <span><Disc3 size={18}/> Carátulas Animadas</span>
                <p>Usa animaciones en loop en las portadas. (Desactívalo si tienes problemas de batería).</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={animatedCovers} onChange={toggleAnimatedCovers} />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <span>Crossfade</span>
                <p>Funde el final de una canción con el inicio de la siguiente automáticamente.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={crossfadeEnabled} onChange={toggleCrossfade} />
                <span className="slider round"></span>
              </label>
            </div>

            {/* Slider de tiempo, solo aparece si el Crossfade está activo */}
            {crossfadeEnabled && (
              <div className="setting-item sub-item">
                <span>Tiempo de fusión: {crossfadeTime} segundos</span>
                <input 
                  type="range" 
                  min="3" 
                  max="20" 
                  value={crossfadeTime} 
                  onChange={(e) => setCrossfadeTime(parseInt(e.target.value))}
                  style={{ width: '100%', marginTop: '10px' }}
                />
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3>Audio Avanzado</h3>
            <div className="setting-item">
              <div className="setting-info">
                <span><Sliders size={18}/> Ecualizador de Estudio</span>
                <p>Activa el ajuste avanzado de frecuencias. (Próximamente)</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={equalizerEnabled} onChange={toggleEqualizer} />
                <span className="slider round"></span>
              </label>
            </div>
          </div>

          <div className="settings-section">
            <h3>Personalización (Tema)</h3>
            <div className="setting-item">
               <div className="setting-info">
                 <span><Palette size={18}/> Color Neón del Sistema</span>
                 <p>Personaliza el color de acento, botones e iconos de la app.</p>
               </div>
               <input 
                 type="color" 
                 value={accentColor} 
                 onChange={(e) => setAccentColor(e.target.value)}
                 className="theme-color-input"
               />
            </div>

            <div className="setting-item sub-item">
               <span>Opacidad del Sistema: {Math.round(accentOpacity * 100)}%</span>
               <input 
                 type="range" 
                 min="0.3" 
                 max="1" 
                 step="0.05"
                 value={accentOpacity} 
                 onChange={(e) => setAccentOpacity(parseFloat(e.target.value))}
                 style={{ width: '100%', marginTop: '10px' }}
               />
            </div>
          </div>

          <div className="settings-section">
            <h3>Almacenamiento</h3>
            <div className="setting-item action-item" onClick={clearCache}>
              <div className="setting-info">
                <span style={{ color: '#ff4d4f' }}><Trash2 size={18} color="#ff4d4f"/> Limpiar Caché Musical</span>
                <p>Libera espacio de almacenamiento eliminando portadas temporales y canciones pre-cargadas.</p>
              </div>
            </div>
          </div>
          
          {/* BOTÓN DE CIERRE DE SESIÓN MOVIDO ADENTRO DEL DESLIZABLE */}
          <div className="settings-section" style={{ marginTop: '30px', display: 'flex', justifyContent: 'center' }}>
             <GlassButtonWrapper
                radius="25"
                depth="8"
                blur="1"
                strength="40"
                background-color="rgba(255, 0, 0, 0.08)"
                chromatic-aberration="3">
                <button onClick={signOut} className="logout-glass-btn" style={{ minWidth: '200px' }}>
                   <LogOut size={20} /> Cerrar Sesión
                </button>
             </GlassButtonWrapper>
          </div>
          
        </div>

      </div>
    </>
  );
}
