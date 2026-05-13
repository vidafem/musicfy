-- Fix security warnings: revoke EXECUTE from anon and set search_path

-- Revoke EXECUTE on functions from anon
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.quick_add_song(text, text, text, text, text, text, text, text, integer, integer) FROM anon;

-- Recreate functions with SET search_path

-- Recreate is_admin with SET search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Drop and recreate quick_add_song with SET search_path
DROP FUNCTION IF EXISTS public.quick_add_song(text, text, text, text, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.quick_add_song(p_title text, p_artist text, p_album text, p_url text, p_cover_url text, p_background_url text, p_lyrics text, p_genre text, p_year integer, p_duration integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;
  -- Insert the song
  INSERT INTO public.songs (title, artist, album, url, cover_url, background_url, lyrics, genre, year, duration)
  VALUES (p_title, p_artist, p_album, p_url, p_cover_url, p_background_url, p_lyrics, p_genre, p_year, p_duration)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Recreate handle_new_user with SET search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN new;
END;
$$;