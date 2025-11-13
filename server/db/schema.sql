CREATE TABLE IF NOT EXISTS artists (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS albums (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cover_url TEXT,
  release_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS songs (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  duration INTEGER NOT NULL,
  genre TEXT,
  mood TEXT,
  cover_url TEXT,
  audio_url TEXT,
  popularity INTEGER DEFAULT 0,
  artist_id BIGINT REFERENCES artists(id) ON DELETE SET NULL,
  album_id BIGINT REFERENCES albums(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  password_hash TEXT,
  avatar_url TEXT,
  bio TEXT,
  provider TEXT DEFAULT 'local',
  provider_id TEXT,
  tier TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens (token_hash);

CREATE TABLE IF NOT EXISTS playlists (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  followers INTEGER DEFAULT 0,
  owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id BIGINT REFERENCES playlists(id) ON DELETE CASCADE,
  song_id BIGINT REFERENCES songs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS playlist_tags (
  playlist_id BIGINT REFERENCES playlists(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (playlist_id, tag)
);

CREATE TABLE IF NOT EXISTS listening_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  song_id BIGINT REFERENCES songs(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ DEFAULT NOW(),
  completed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS feedback (
  id BIGSERIAL PRIMARY KEY,
  email TEXT,
  topic TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
