-- ==========================================
-- OPTIMIZACIÓN Y REALTIME PARA MUSICFY
-- ==========================================

-- 1. ACTIVAR SUPABASE REALTIME
-- Esto es CRÍTICO para que la sincronización entre dispositivos (TV, Celular, PC)
-- funcione como por arte de magia, sin tener que recargar la página.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['profiles', 'likes', 'playlists', 'playlist_songs', 'songs'])
    LOOP
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
        END IF;
    END LOOP;
END;
$$;

-- 2. ÍNDICES DE ALTO RENDIMIENTO (VELOCIDAD)
-- Hace que el fix de la subida masiva que acabamos de hacer sea instantáneo
CREATE INDEX IF NOT EXISTS idx_songs_url ON songs(url);

-- Acelera drásticamente el buscador de la app cuando buscas música
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);

-- Optimiza la carga de las canciones que el usuario está escuchando
CREATE INDEX IF NOT EXISTS idx_profiles_last_played ON profiles(last_played_id);

-- 3. OPTIMIZACIÓN DE REPRODUCCIONES (Opcional pero recomendado)
-- Acelera el ordenamiento de "Canciones más populares"
CREATE INDEX IF NOT EXISTS idx_songs_play_count ON songs(play_count DESC);
