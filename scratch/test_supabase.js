import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rrhybvimmjnebatuking.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyaHlidmltbWpuZWJhdHVraW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTE1NTMsImV4cCI6MjA5MzQ2NzU1M30.r-sWoSpXcyogLMVwy3V6-Xc3zIOI14cCHQdwgt3DXS4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runCatalogInspection() {
  console.log('--- INSPECCIÓN DE CATÁLOGOS POSTGRES ---');
  
  console.log('1. Listando disparadores (Triggers) en la tabla songs...');
  try {
    const { data, error } = await supabase.rpc('inspect_triggers', {});
    if (error) {
      console.log('RPC inspect_triggers no existe. Intentando vía query directa...');
      // Intentamos consultar pg_trigger a través de postgrest (si la API lo permite, a veces expone pg_catalog)
      const { data: qData, error: qError } = await supabase
        .from('pg_trigger')
        .select('*')
        .limit(5);
      if (qError) {
        console.error('No se puede consultar pg_trigger directamente:', qError.message);
      } else {
        console.log('Datos de pg_trigger:', qData);
      }
    } else {
      console.log('Triggers encontrados:', data);
    }
  } catch (e) {
    console.error('Error inspeccionando triggers:', e);
  }

  console.log('\n2. Consultando definición de tablas o políticas de RLS...');
  try {
    // Intentamos ver si hay alguna función de inspección o si podemos listar políticas de pg_policies
    const { data, error } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'songs');
    if (error) {
      console.log('No se puede consultar pg_policies directamente:', error.message);
    } else {
      console.log('Políticas de RLS en songs:', data);
    }
  } catch (e) {
    console.error('Error inspeccionando políticas:', e);
  }
}

runCatalogInspection();
