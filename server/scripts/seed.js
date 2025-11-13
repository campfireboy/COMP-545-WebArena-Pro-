require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const sampleData = require('../src/data/sampleData');

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL is not defined. Skipping seed.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  try {
    await pool.query('BEGIN');
    await pool.query('TRUNCATE password_reset_tokens, playlist_songs, playlists, songs, albums, artists, users RESTART IDENTITY CASCADE');

    const artistIds = new Map();
    const albumIds = new Map();

    for (const song of sampleData.songs) {
      if (!artistIds.has(song.artist)) {
        const { rows } = await pool.query(
          'INSERT INTO artists (name) VALUES ($1) RETURNING id',
          [song.artist]
        );
        artistIds.set(song.artist, rows[0].id);
      }

      if (!albumIds.has(song.album)) {
        const { rows } = await pool.query(
          'INSERT INTO albums (name, cover_url) VALUES ($1, $2) RETURNING id',
          [song.album, song.coverUrl]
        );
        albumIds.set(song.album, rows[0].id);
      }

      await pool.query(
        `INSERT INTO songs
          (id, title, duration, genre, mood, cover_url, audio_url, popularity, artist_id, album_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           duration = EXCLUDED.duration,
           genre = EXCLUDED.genre,
           mood = EXCLUDED.mood,
           cover_url = EXCLUDED.cover_url,
           audio_url = EXCLUDED.audio_url,
           popularity = EXCLUDED.popularity,
           artist_id = EXCLUDED.artist_id,
           album_id = EXCLUDED.album_id`,
        [
          song.id,
          song.title,
          song.duration,
          song.genre,
          song.mood,
          song.coverUrl,
          song.audioUrl,
          song.popularity,
          artistIds.get(song.artist),
          albumIds.get(song.album)
        ]
      );
    }

    for (const playlist of sampleData.playlists) {
      await pool.query(
        `INSERT INTO playlists (id, name, description, cover_url, followers)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           cover_url = EXCLUDED.cover_url,
           followers = EXCLUDED.followers`,
        [
          playlist.id,
          playlist.title,
          playlist.description,
          playlist.coverUrl,
          playlist.followers
        ]
      );

      await pool.query('DELETE FROM playlist_tags WHERE playlist_id = $1', [playlist.id]);
      for (const tag of playlist.tags || []) {
        await pool.query(
          `INSERT INTO playlist_tags (playlist_id, tag)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [playlist.id, tag]
        );
      }

      let position = 1;
      for (const songId of playlist.songs) {
        await pool.query(
          `INSERT INTO playlist_songs (playlist_id, song_id, sequence)
           VALUES ($1,$2,$3)
           ON CONFLICT (playlist_id, song_id) DO UPDATE SET
             sequence = EXCLUDED.sequence`,
          [playlist.id, songId, position]
        );
        position += 1;
      }
    }

    const demoPasswordHash = await bcrypt.hash('password123', 10);
    await pool.query(
      `INSERT INTO users (email, display_name, password_hash, tier, provider)
       VALUES ($1, $2, $3, 'premium', 'local')
       ON CONFLICT (email) DO NOTHING`,
      ['demo@listener.fm', 'Demo Listener', demoPasswordHash]
    );

    await pool.query('COMMIT');
    console.log('Database seeded with sample data ✅');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Seeding failed', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
