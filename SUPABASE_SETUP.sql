-- ====================================
-- SUPABASE SQL SETUP - MUSICFY
-- ====================================

-- Tabla: playlists
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cover_url TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Tabla: playlist_songs (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS playlist_songs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id UUID NOT NULL,
  position INT NOT NULL,
  added_at TIMESTAMP DEFAULT now()
);

-- Tabla: likes (canciones marcadas como favoritas)
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Índices para optimizar queries
CREATE INDEX idx_playlists_user_id ON playlists(user_id);
CREATE INDEX idx_playlist_songs_playlist_id ON playlist_songs(playlist_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);
CREATE INDEX idx_likes_song_id ON likes(song_id);

-- RLS (Row Level Security) - Seguridad por usuario
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios solo ven sus propias playlists
CREATE POLICY "Users can view their own playlists" ON playlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create playlists" ON playlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own playlists" ON playlists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playlists" ON playlists
  FOR DELETE USING (auth.uid() = user_id);

-- Política: Acceso a playlist_songs relacionadas
CREATE POLICY "Users can view playlist_songs from their playlists" ON playlist_songs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM playlists WHERE playlists.id = playlist_songs.playlist_id AND playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add songs to their playlists" ON playlist_songs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM playlists WHERE playlists.id = playlist_songs.playlist_id AND playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete songs from their playlists" ON playlist_songs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM playlists WHERE playlists.id = playlist_songs.playlist_id AND playlists.user_id = auth.uid()
    )
  );

-- Política: Likes
CREATE POLICY "Users can view their own likes" ON likes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add likes" ON likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove likes" ON likes
  FOR DELETE USING (auth.uid() = user_id);
