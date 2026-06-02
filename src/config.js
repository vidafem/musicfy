/*
 * CONFIGURACIÓN GLOBAL DE VARIABLES DE ENTORNO
 * Proporciona fallbacks para producción (despliegues en Vercel, móviles, etc.)
 */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rrhybvimmjnebatuking.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaHlidmltbWpuZWJhdHVraW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTE1NTMsImV4cCI6MjA5MzQ2NzU1M30.r-sWoSpXcyogLMVwy3V6-Xc3zIOI14cCHQdwgt3DXS4';
export const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://musicfy.canonedu17.workers.dev';
export const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || 'https://pub-c61fea6d07d64baeaf11a818a5e3f274.r2.dev';
