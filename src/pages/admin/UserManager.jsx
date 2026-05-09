import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Trash2, 
  Settings, 
  Activity, 
  Heart, 
  ListMusic, 
  Sliders, 
  Clock, 
  ShieldCheck,
  MoreVertical,
  Mail,
  User,
  CheckCircle,
  X,
  Loader2,
  Lock
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'user' });
  const [selectedUser, setSelectedUser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Nota: En una app real, los usuarios de Auth se gestionan vía Admin API (Edge Functions)
      // Aquí consultamos nuestra tabla de 'profiles' que contiene la data extendida
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      // 1. Crear el usuario en Auth (Normalmente vía Edge Function para Admin)
      // Para este demo, simularemos la creación en nuestra tabla de perfiles
      const { data, error } = await supabase
        .from('profiles')
        .insert([{
          email: newUser.email,
          full_name: newUser.full_name,
          role: newUser.role,
          crossfade_seconds: 5,
          is_live: false,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;
      
      setShowAddModal(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'user' });
      fetchUsers();
    } catch (error) {
      alert("Error al crear usuario: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este usuario? Perderá toda su configuración y playlists.")) return;
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      fetchUsers();
    } catch (error) {
      alert("Error al eliminar: " + error.message);
    }
  };

  return (
    <div style={containerStyle}>
      
      {/* HEADER & ACTIONS */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Users size={32} color="var(--accent-color)" /> Gestión de Comunidad
          </h2>
          <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
            Control total sobre perfiles, preferencias y actividad en vivo.
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={addButtonStyle}>
          <UserPlus size={20} /> NUEVO USUARIO
        </button>
      </div>

      {/* SEARCH & FILTERS */}
      <div style={searchContainerStyle}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={searchIconStyle} size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o email..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInputStyle}
          />
        </div>
        <div style={filterBadgeStyle}>
          {users.length} Miembros Activos
        </div>
      </div>

      {/* USERS GRID */}
      {loading ? (
        <div style={loadingContainerStyle}>
          <Loader2 className="spinner" size={40} color="var(--accent-color)" />
          <p>Sincronizando perfiles...</p>
        </div>
      ) : (
        <div style={gridStyle}>
          {users.filter(u => u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())).map(user => (
            <div key={user.id} style={cardStyle} onClick={() => setSelectedUser(user)}>
              <div style={cardHeaderStyle}>
                <div style={avatarContainerStyle}>
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" style={avatarImgStyle} />
                  ) : (
                    <div style={avatarPlaceholderStyle}>
                      <User size={24} />
                    </div>
                  )}
                  {user.is_live && <div style={liveBadgeStyle} />}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{user.full_name || 'Sin Nombre'}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                    <Mail size={12} /> {user.email}
                  </div>
                </div>
                <button style={moreButtonStyle}><MoreVertical size={18} /></button>
              </div>

              <div style={cardBodyStyle}>
                <div style={statsRowStyle}>
                  <div style={statItemStyle}>
                    <Activity size={14} color="#00e676" />
                    <span>{user.is_live ? 'En Vivo' : 'Offline'}</span>
                  </div>
                  <div style={statItemStyle}>
                    <Sliders size={14} color="var(--accent-color)" />
                    <span>{user.crossfade_seconds}s Fade</span>
                  </div>
                </div>

                <div style={dividerStyle} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div title="Playlists" style={miniStatStyle}><ListMusic size={14} /> 4</div>
                    <div title="Favoritos" style={miniStatStyle}><Heart size={14} /> 128</div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteUser(user.id); }} 
                    style={deleteButtonStyle}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: ADD USER */}
      {showAddModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={modalHeaderStyle}>
              <h3><UserPlus size={24} style={{ verticalAlign: 'middle', marginRight: '10px' }} /> Crear Nuevo Perfil</h3>
              <button onClick={() => setShowAddModal(false)} style={closeButtonStyle}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateUser} style={formStyle}>
              <div style={inputGroupStyle}>
                <label>Nombre Completo</label>
                <input 
                  required 
                  type="text" 
                  value={newUser.full_name} 
                  onChange={e => setNewUser({...newUser, full_name: e.target.value})} 
                  placeholder="Ej: Juan Perez"
                />
              </div>
              <div style={inputGroupStyle}>
                <label>Correo Electrónico</label>
                <input 
                  required 
                  type="email" 
                  value={newUser.email} 
                  onChange={e => setNewUser({...newUser, email: e.target.value})} 
                  placeholder="usuario@musicfy.com"
                />
              </div>
              <div style={inputGroupStyle}>
                <label>Contraseña de Acceso</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={inputIconStyle} />
                  <input 
                    required 
                    type="password" 
                    value={newUser.password} 
                    onChange={e => setNewUser({...newUser, password: e.target.value})} 
                    placeholder="••••••••"
                    style={{ paddingLeft: '40px' }}
                  />
                </div>
              </div>
              <div style={inputGroupStyle}>
                <label>Rol del Usuario</label>
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                  <option value="user">Oyente Estándar</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              
              <button type="submit" disabled={isProcessing} style={submitButtonStyle}>
                {isProcessing ? <Loader2 className="spinner" size={20} /> : 'CREAR CUENTA MUSICFY'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* STYLES */}
      <style>{`
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        input, select {
          width: 100%;
          padding: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: white;
          outline: none;
          transition: all 0.2s ease;
        }
        input:focus, select:focus {
          border-color: var(--accent-color);
          background: rgba(255,255,255,0.1);
        }
      `}</style>
    </div>
  );
}

// ESTILOS EN OBJETOS
const containerStyle = { padding: '10px', animation: 'fadeIn 0.5s ease' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' };
const addButtonStyle = {
  background: 'var(--accent-color)', color: 'black', border: 'none', padding: '12px 24px',
  borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
  boxShadow: '0 10px 20px rgba(0,255,255,0.2)'
};

const searchContainerStyle = { display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '30px' };
const searchInputStyle = { width: '100%', padding: '15px 15px 15px 50px', borderRadius: '15px' };
const searchIconStyle = { position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 };
const filterBadgeStyle = { background: 'rgba(255,255,255,0.05)', padding: '10px 20px', borderRadius: '25px', fontSize: '0.9rem', color: 'var(--accent-color)', fontWeight: 'bold', border: '1px solid rgba(0,255,255,0.2)' };

const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' };
const cardStyle = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '24px', padding: '20px', cursor: 'pointer', transition: 'all 0.3s ease'
};

const cardHeaderStyle = { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' };
const avatarContainerStyle = { position: 'relative', width: '55px', height: '55px' };
const avatarImgStyle = { width: '100%', height: '100%', borderRadius: '15px', objectFit: 'cover' };
const avatarPlaceholderStyle = { width: '100%', height: '100%', borderRadius: '15px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)' };
const liveBadgeStyle = { position: 'absolute', bottom: '-2px', right: '-2px', width: '14px', height: '14px', borderRadius: '50%', background: '#00e676', border: '3px solid #111' };

const moreButtonStyle = { background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' };
const cardBodyStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const statsRowStyle = { display: 'flex', gap: '15px' };
const statItemStyle = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '10px' };
const dividerStyle = { height: '1px', background: 'rgba(255,255,255,0.05)', width: '100%' };
const miniStatStyle = { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' };
const deleteButtonStyle = { background: 'rgba(255,71,87,0.1)', border: 'none', color: '#ff4757', padding: '8px', borderRadius: '8px', cursor: 'pointer' };

const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 };
const modalContentStyle = { width: '90%', maxWidth: '450px', background: '#111', borderRadius: '30px', padding: '30px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' };
const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' };
const closeButtonStyle = { background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' };
const formStyle = { display: 'flex', flexDirection: 'column', gap: '20px' };
const inputGroupStyle = { display: 'flex', flexDirection: 'column', gap: '8px' };
const inputIconStyle = { position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 };
const submitButtonStyle = { background: 'var(--accent-color)', color: 'black', border: 'none', padding: '15px', borderRadius: '15px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: '10px', boxShadow: '0 10px 20px rgba(0,255,255,0.2)' };
const loadingContainerStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'rgba(255,255,255,0.4)', gap: '15px' };
