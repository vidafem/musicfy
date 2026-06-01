-- ========================================================
-- MIGRACIÓN DE BASE DE DATOS: HYBRID STREAMING & SMART FEATURES
-- ========================================================

-- 1. CAMPOS HÍBRIDOS EN SONGS (FUENTES EXTERNAS Y ATRIBUTOS DE AUDIO)
ALTER TABLE public.songs 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'local' CHECK (source IN ('local', 'youtube', 'spotify_preview')),
  ADD COLUMN IF NOT EXISTS external_id TEXT,        -- ID en YouTube/Spotify
  ADD COLUMN IF NOT EXISTS youtube_id TEXT,          -- Video ID de YouTube
  ADD COLUMN IF NOT EXISTS bpm INTEGER,              -- Para smart crossfade
  ADD COLUMN IF NOT EXISTS key_signature TEXT,       -- Para mezcla armónica
  ADD COLUMN IF NOT EXISTS energy FLOAT,             -- 0.0-1.0 (de Spotify Audio Features)
  ADD COLUMN IF NOT EXISTS danceability FLOAT,       -- 0.0-1.0
  ADD COLUMN IF NOT EXISTS mood TEXT,                -- 'happy', 'sad', 'energetic', 'calm'
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS is_downloadable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lyrics_synced TEXT,       -- LRC formato con timestamps precisos
  ADD COLUMN IF NOT EXISTS lyrics_source TEXT;       -- 'genius', 'lrclib', 'manual'

-- 2. CAMPOS NUEVOS EN PROFILES (PARA IA, OFFLINE Y TV)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS listening_stats JSONB DEFAULT '{}',   -- {totalMinutes, topArtists, topGenres}
  ADD COLUMN IF NOT EXISTS tv_device_id TEXT,                    -- ID del TV vinculado
  ADD COLUMN IF NOT EXISTS ios_push_token TEXT,                  -- Para notificaciones iOS
  ADD COLUMN IF NOT EXISTS android_push_token TEXT,
  ADD COLUMN IF NOT EXISTS preferred_quality TEXT DEFAULT 'high' CHECK (preferred_quality IN ('low', 'medium', 'high', 'lossless')),
  ADD COLUMN IF NOT EXISTS downloaded_songs JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_played_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_playing BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_playback_time FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS active_device_id TEXT,
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
  -- IDs de canciones offline

-- 3. CAMPOS EN PLAYLISTS (COLABORATIVAS Y SMART)
ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_smart BOOLEAN DEFAULT false,       -- Auto-playlist por IA
  ADD COLUMN IF NOT EXISTS smart_rules JSONB,                    -- {genre, mood, bpm_range, energy_min}
  ADD COLUMN IF NOT EXISTS collaborators JSONB DEFAULT '[]',     -- Array de user_ids
  ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0;

-- 4. NUEVAS TABLAS

-- Tabla: play_history (historial persistente en BD)
CREATE TABLE IF NOT EXISTS public.play_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  external_id TEXT,         -- Si era una canción externa (YouTube)
  played_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  play_duration INTEGER,    -- Segundos escuchados
  source TEXT DEFAULT 'local',
  device_type TEXT          -- 'mobile', 'tv', 'web'
);

-- Tabla: downloads (tracks offline por usuario)
CREATE TABLE IF NOT EXISTS public.downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  file_size_bytes BIGINT,
  quality TEXT DEFAULT 'high',
  local_path TEXT             -- Path en el dispositivo (Capacitor Filesystem)
);

-- Tabla: ai_recommendations (caché de recomendaciones)
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE,
  external_id TEXT,
  score FLOAT,                -- 0.0-1.0 relevancia
  reason TEXT,                -- Por qué se recomienda
  algorithm TEXT,             -- 'collaborative', 'content', 'hybrid'
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours')
);

-- Tabla: tv_sessions (para control remoto TV ↔ móvil)
CREATE TABLE IF NOT EXISTS public.tv_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tv_device_id TEXT NOT NULL,
  tv_platform TEXT,           -- 'androidtv', 'tizen', 'webos'
  paired_mobile_id TEXT,
  session_token TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  last_ping TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. NUEVOS ÍNDICES DE RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_songs_bpm ON public.songs(bpm) WHERE bpm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_songs_mood ON public.songs(mood) WHERE mood IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_songs_source ON public.songs(source);
CREATE INDEX IF NOT EXISTS idx_songs_external_id ON public.songs(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_play_history_user ON public.play_history(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_history_song ON public.play_history(song_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_downloads_user ON public.downloads(user_id);

-- 6. HABILITAR SEGURIDAD RLS PARA NUEVAS TABLAS
ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_sessions ENABLE ROW LEVEL SECURITY;

-- 7. CREAR POLÍTICAS RLS PARA NUEVAS TABLAS
DROP POLICY IF EXISTS "Users own history" ON public.play_history;
CREATE POLICY "Users own history" ON public.play_history FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own downloads" ON public.downloads;
CREATE POLICY "Users own downloads" ON public.downloads FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own recs" ON public.ai_recommendations;
CREATE POLICY "Users own recs" ON public.ai_recommendations FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own tv sessions" ON public.tv_sessions;
CREATE POLICY "Users own tv sessions" ON public.tv_sessions FOR ALL USING (auth.uid() = user_id);

-- 8. CORRECCIÓN Y POLÍTICA RLS PARA LA TABLA SONGS (EDICIÓN DE CANCIONES POR ADMINS)
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to songs" ON public.songs;
CREATE POLICY "Allow public read access to songs" ON public.songs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to songs" ON public.songs;
CREATE POLICY "Allow admin write access to songs" ON public.songs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Permitir a usuarios autenticados insertar/actualizar/eliminar canciones de YouTube o externas
DROP POLICY IF EXISTS "Allow authenticated users to insert external songs" ON public.songs;
CREATE POLICY "Allow authenticated users to insert external songs" ON public.songs
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND (source = 'youtube' OR source = 'spotify_preview')
  );

DROP POLICY IF EXISTS "Allow authenticated users to update external songs" ON public.songs;
CREATE POLICY "Allow authenticated users to update external songs" ON public.songs
  FOR UPDATE
  USING (
    auth.role() = 'authenticated' AND source = 'youtube'
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND source = 'youtube'
  );

DROP POLICY IF EXISTS "Allow authenticated users to delete external songs" ON public.songs;
CREATE POLICY "Allow authenticated users to delete external songs" ON public.songs
  FOR DELETE
  USING (
    auth.role() = 'authenticated' AND source = 'youtube'
  );

-- 9. ACTIVAR REALTIME PARA TABLAS NUEVAS
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['play_history', 'downloads', 'ai_recommendations', 'tv_sessions'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
    END IF;
  END LOOP;
END;
$$;
