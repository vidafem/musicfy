import { createClient } from '@supabase/supabase-js'

/* 
 * CONEXIÓN A SUPABASE (BASED DE DATOS Y AUTENTICACIÓN)
 * 
 * Reemplaza estas dos constantes con los valores reales de tu proyecto en Supabase.
 * Los encuentras en Supabase > Project Settings > API.
 */
const supabaseUrl = 'https://rrhybvimmjnebatuking.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaHlidmltbWpuZWJhdHVraW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTE1NTMsImV4cCI6MjA5MzQ2NzU1M30.r-sWoSpXcyogLMVwy3V6-Xc3zIOI14cCHQdwgt3DXS4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
