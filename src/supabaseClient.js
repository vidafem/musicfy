import { createClient } from '@supabase/supabase-js'

/* 
 * CONEXIÓN A SUPABASE
 * Las credenciales ahora se leen de forma segura desde el archivo .env
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
