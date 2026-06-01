-- ========================================================
-- AGREGAR COLUMNA DE VIDEO Y ACTUALIZAR FUNCIÓN RPC
-- ========================================================

-- 1. Agregar la columna video_url a la tabla songs (si no existe)
ALTER TABLE public.songs 
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. Eliminar la firma anterior de la función quick_add_song
DROP FUNCTION IF EXISTS public.quick_add_song(text, text, text, text, text, text, text, text, integer, integer);

-- 3. Recrear la función quick_add_song con el parámetro adicional p_video_url
CREATE OR REPLACE FUNCTION public.quick_add_song(
  p_title text, 
  p_artist text, 
  p_album text, 
  p_url text, 
  p_cover_url text, 
  p_background_url text, 
  p_lyrics text, 
  p_genre text, 
  p_year integer, 
  p_duration integer,
  p_video_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Verificar privilegios de administrador
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Insertar la canción incluyendo el enlace de video
  INSERT INTO public.songs (
    title, artist, album, url, cover_url, background_url, lyrics, genre, year, duration, video_url
  )
  VALUES (
    p_title, p_artist, p_album, p_url, p_cover_url, p_background_url, p_lyrics, p_genre, p_year, p_duration, p_video_url
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;
