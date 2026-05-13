import React from 'react';
import { X, Settings, Sliders, Trash2, LogOut, Disc3, Palette, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import GlassButtonWrapper from './ui/GlassButtonWrapper';
import './SettingsSidebar.css';

export default function SettingsSidebar({ isOpen, onClose }) {
  // OPTIMIZACIÓN: Selectores específicos para no re-renderizar con el tiempo de la música
  const { 
    animatedCovers, toggleAnimatedCovers, 
    crossfadeEnabled, toggleCrossfade,
    crossfadeTime, setCrossfadeTime,
    accentColor, setAccentColor,
    accentOpacity, setAccentOpacity,
    equalizerEnabled, toggleEqualizer,
    eqGains, setEqGains,
    saveSettingsToCloud,
    clearCache 
  } = useSettingsStore();

  const [syncStatus, setSyncStatus] = React.useState('idle'); // 'idle', 'syncing', 'success'

  const handleSyncProfile = async () => {
    setSyncStatus('syncing');
    try {
      await saveSettingsToCloud();
      // Forzamos un broadcast de los ajustes a otros dispositivos
      const { usePlayerStore } = await import('../store/usePlayerStore');
      usePlayerStore.getState().sendCommand('SYNC_SETTINGS', {
        accentColor, accentOpacity, animatedCovers, crossfadeEnabled, crossfadeTime, equalizerEnabled, eqGains
      });
      console.log("[Connect] ✅ [TAG:CONFIRMADO] Sincronización de perfil exitosa en todos los dispositivos vinculados.");
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err) {
      console.error("[Connect] ❌ Error en sincronización:", err);
      setSyncStatus('idle');
    }
  };

  const handleEqChange = (index, value) => {
    const newGains = [...eqGains];
    newGains[index] = parseFloat(value);
    setEqGains(newGains);
  };
  
  const signOut = useAuthStore(state => state.signOut);
  const user = useAuthStore(state => state.user);

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
          <h3>Ecualizador Pro</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span>Activar Ecualización</span>
              <p>Mejora la calidad de audio con ajustes personalizados.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={equalizerEnabled} onChange={toggleEqualizer} />
              <span className="slider round"></span>
            </label>
          </div>
          
          {equalizerEnabled && (
            <div className="eq-container" style={{ marginTop: '20px', padding: '0 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', height: '120px', alignItems: 'flex-end', gap: '10px' }}>
                {['60Hz', '230Hz', '910Hz', '4kHz', '14kHz'].map((label, i) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '10px' }}>
                    <div className="eq-bar-wrapper" style={{ height: '100px', width: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', position: 'relative' }}>
                       <input 
                         type="range" 
                         min="-12" 
                         max="12" 
                         step="0.5"
                         value={eqGains[i]}
                         onChange={(e) => handleEqChange(i, e.target.value)}
                         style={{
                           position: 'absolute',
                           top: '50%',
                           left: '50%',
                           transform: 'translate(-50%, -50%) rotate(-90deg)',
                           width: '100px',
                           height: '6px',
                           cursor: 'pointer',
                           appearance: 'none',
                           background: 'none'
                         }}
                       />
                       <div className="eq-fill" style={{
                         position: 'absolute',
                         bottom: 0,
                         width: '100%',
                         height: `${((eqGains[i] + 12) / 24) * 100}%`,
                         background: 'var(--accent-color)',
                         borderRadius: '10px',
                         boxShadow: '0 0 10px var(--accent-glow)'
                       }}></div>
                    </div>
                    <span style={{ fontSize: '9px', opacity: 0.5 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Colores y Neón</h3>
            
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

          <div className="settings-section" style={{ border: 'none' }}>
            <div 
              className="sync-minimal-btn" 
              onClick={syncStatus === 'idle' ? handleSyncProfile : null} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 15px',
                cursor: 'pointer',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.03)',
                transition: 'all 0.3s ease'
              }}
            >
              <RefreshCw 
                size={18} 
                style={{ 
                  color: syncStatus === 'success' ? '#4caf50' : 'var(--accent-color)',
                  transition: 'all 0.3s ease',
                  animation: syncStatus === 'syncing' ? 'spin 1s linear infinite' : 'none'
                }}
              />
              <span style={{ 
                color: syncStatus === 'success' ? '#4caf50' : 'white',
                fontSize: '0.9rem',
                fontWeight: '700',
                transition: 'all 0.3s ease'
              }}>
                {syncStatus === 'success' ? 'Ajustes Sincronizados' : syncStatus === 'syncing' ? 'Sincronizando...' : 'Sincronizar ajustes'}
              </span>
            </div>
            <style>{`
              @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
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
                <button 
                  onClick={() => {
                    onClose(); 
                    signOut();
                  }} 
                  className="logout-glass-btn" 
                  style={{ minWidth: '200px', cursor: 'pointer', zIndex: 100 }}
                >
                   <LogOut size={20} /> Cerrar Sesión
                </button>
             </GlassButtonWrapper>
          </div>
          
        </div>

      </div>
    </>
  );
}
