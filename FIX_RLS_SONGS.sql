-- ========================================================
-- SOLUCIÓN DE POLÍTICAS RLS DE SUPABASE PARA SONGS EXTERNAS
-- Ejecuta este script en el editor SQL de tu panel de Supabase
-- ========================================================

-- 1. Permitir a usuarios autenticados insertar canciones de YouTube u otras fuentes externas
DROP POLICY IF EXISTS "Allow authenticated users to insert external songs" ON public.songs;
CREATE POLICY "Allow authenticated users to insert external songs" ON public.songs
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND (source = 'youtube' OR source = 'spotify_preview')
  );

-- 2. Permitir a usuarios autenticados actualizar canciones de YouTube (por si se editan letras o fondos)
DROP POLICY IF EXISTS "Allow authenticated users to update external songs" ON public.songs;
CREATE POLICY "Allow authenticated users to update external songs" ON public.songs
  FOR UPDATE
  USING (
    auth.role() = 'authenticated' AND source = 'youtube'
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND source = 'youtube'
  );

-- 3. Permitir a usuarios autenticados eliminar canciones de YouTube (necesario para el Garbage Collector)
DROP POLICY IF EXISTS "Allow authenticated users to delete external songs" ON public.songs;
CREATE POLICY "Allow authenticated users to delete external songs" ON public.songs
  FOR DELETE
  USING (
    auth.role() = 'authenticated' AND source = 'youtube'
  );

-- Asegurarse de que el RLS siga habilitado
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
