import React, { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader } from 'lucide-react';
import ParticleWave from './components/ParticleWave';
import GlassButtonWrapper from './components/ui/GlassButtonWrapper';
import { supabase } from './supabaseClient'; // Conexión a tu base de datos
import './Login.css';

export default function Login() {
  const [phase, setPhase] = useState('center');
  const [showPassword, setShowPassword] = useState(false);

  // Estados de autenticación
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('gliding'), 1500);
    const t2 = setTimeout(() => setPhase('form-visible'), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Función para manejar el login con Supabase
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor ingresa tus datos.');
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);
    
    // Llamada oficial a Supabase para verificar el usuario
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      // Si la contraseña o usuario son incorrectos
      setErrorMsg('Usuario o contraseña incorrectos.');
      setLoading(false);
    } else {
      // El inicio de sesión es correcto
      // La redirección ocurre automáticamente gracias a Zustand y App.jsx
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <ParticleWave />

      <div className={`global-header ${phase}`}>
        <img src="/icono.png" alt="Musicfy Icon" className="app-logo" />
        <img src="/nombre.png" alt="Musicfy" className="app-name" />
      </div>

      <div className={`login-center-layout ${phase === 'form-visible' ? 'visible' : 'hidden'}`}>
        <div className="login-content-full">
          
          <div className="login-titles">
            <h1>¡Bienvenido de nuevo!</h1>
          </div>

          <form className="login-form-flat" onSubmit={handleLogin}>
            
            {/* Si hay error, se muestra aquí de forma bonita */}
            {errorMsg && <div className="error-message fade-in-up">{errorMsg}</div>}

            <div className="input-pill-container">
              <label>Correo Electrónico</label>
              <div className="input-pill-wrapper">
                <Mail className="input-icon" size={20} />
                <input 
                  type="email" 
                  placeholder="tu@correo.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>
            
            <div className="input-pill-container">
              <label>Contraseña</label>
              <div className="input-pill-wrapper">
                <Lock className="input-icon" size={20} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                
                {/* Botón de Ojo para ver la contraseña */}
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            
            <div className="forgot-password">
              <a href="#">¿Olvidaste tu contraseña?</a>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '10px' }}>
              <GlassButtonWrapper
                  radius="30"
                  depth="12"
                  blur="2"
                  strength="80"
                  // IMPORTANTE: Lo hice translúcido (0.1) en lugar de oscuro. 
                  // El Liquid Glass NO se ve si el fondo es oscuro sólido porque bloquea la luz.
                  // Ahora verás la ola de partículas a través del botón distorsionándose.
                  background-color="rgba(255, 255, 255, 0.08)"
                  chromatic-aberration="4">
                  <button 
                      type="submit"
                      disabled={loading}
                      style={{ 
                          width: '350px', 
                          height: '60px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: 'white', 
                          fontWeight: 'bold', 
                          fontSize: '1.2rem',
                          letterSpacing: '1px',
                          background: 'transparent',
                          border: 'none',
                          cursor: loading ? 'wait' : 'pointer',
                          outline: 'none'
                      }}>
                      {loading ? <Loader className="spin-icon" /> : 'Ingresar'}
                  </button>
              </GlassButtonWrapper>
            </div>
            
          </form>
        </div>
      </div>
    </div>
  );
}
