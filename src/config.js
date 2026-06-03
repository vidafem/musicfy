/*
 * CONFIGURACIÓN GLOBAL DE VARIABLES DE ENTORNO
 * Proporciona fallbacks para producción (despliegues en Vercel, móviles, etc.)
 */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rrhybvimmjnebatuking.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaHlidmltbWpuZWJhdHVraW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTE1NTMsImV4cCI6MjA5MzQ2NzU1M30.r-sWoSpXcyogLMVwy3V6-Xc3zIOI14cCHQdwgt3DXS4';
export const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://musicfy.canonedu17.workers.dev';
export const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || 'https://pub-c61fea6d07d64baeaf11a818a5e3f274.r2.dev';

// Determinar si estamos en localhost o en la red local privada (Smart TV, móviles)
const isLocalhost = typeof window !== 'undefined' && (
  ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
  window.location.hostname.startsWith('192.168.') ||
  window.location.hostname.startsWith('10.') ||
  window.location.hostname.startsWith('172.')
);

// URL del backend:
// 1. Prioridad: variable de entorno VITE_BACKEND_URL (apunta a Render en producción, sanitizada)
// 2. Si estamos en red local, usar el backend local en el mismo host
// 3. Fallback a /api (Vercel serverless, limitado)
const getBackendUrl = () => {
  let url = import.meta.env.VITE_BACKEND_URL;
  if (url) {
    url = url.trim().replace(/\/+$/, ''); // Eliminar barras diagonales al final
    if (!url.endsWith('/api')) {
      url = `${url}/api`;
    }
    return url;
  }
  return isLocalhost
    ? `${window.location.protocol}//${window.location.hostname}:5000/api`
    : '/api';
};

export const BACKEND_URL = getBackendUrl();

// Advertir al usuario en la consola si está en producción pero usa las funciones de Vercel
if (typeof window !== 'undefined' && !isLocalhost && BACKEND_URL === '/api') {
  console.warn(
    '%c[Musicfy] ⚠️ ALERTA DE CONFIGURACIÓN:\n' +
    'El frontend está corriendo en producción pero no se ha detectado la variable de entorno VITE_BACKEND_URL.\n' +
    'Las peticiones de streaming se están haciendo a Vercel (/api/stream), las cuales fallarán con error 503 debido al bloqueo de IPs de AWS por parte de YouTube.\n\n' +
    'Para solucionarlo:\n' +
    '1. Despliega el backend (carpeta /server) en Render.com o similar.\n' +
    '2. En el panel de Vercel de tu proyecto, ve a Settings -> Environment Variables.\n' +
    '3. Agrega la variable: VITE_BACKEND_URL = https://tu-backend-en-render.onrender.com/api\n' +
    '4. Haz un redeploy en Vercel para aplicar los cambios.',
    'color: #ff9800; font-weight: bold; font-size: 12px;'
  );
}

