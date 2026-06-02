import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

/* 
 * CONEXIÓN A SUPABASE
 * Las credenciales se leen desde config.js con fallbacks para producción
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
