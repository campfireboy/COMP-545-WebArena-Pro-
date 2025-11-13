const db = require('../db/pool');
const sampleData = require('../data/sampleData');

function normalizeRows(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist_name || row.artist,
    album: row.album_name || row.album,
    coverUrl: row.cover_url || row.coverUrl,
    audioUrl: row.audio_url || row.audioUrl,
    duration: Number(row.duration),
    genre: row.genre,
    mood: row.mood,
    popularity: row.popularity || 0
  }));
}

function filterSampleSongs({ genre, search, limit }) {
  let songs = sampleData.songs;

  if (genre) {
    songs = songs.filter((song) => song.genre.toLowerCase() === genre.toLowerCase());
  }

  if (search) {
    const keyword = search.toLowerCase();
    songs = songs.filter((song) => song.title.toLowerCase().includes(keyword)
      || song.artist.toLowerCase().includes(keyword)
      || song.album.toLowerCase().includes(keyword));
  }

  return songs.slice(0, limit);
}

async function getSongs({ genre, search, limit = 20 }) {
  if (db.isConfigured()) {
    const clauses = [];
    const params = [];

    if (genre) {
      params.push(genre);
      clauses.push(`s.genre = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      clauses.push(`(LOWER(s.title) LIKE $${params.length} OR LOWER(a.name) LIKE $${params.length})`);
    }

    params.push(limit);
    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const query = `
      SELECT s.id, s.title, s.genre, s.mood, s.duration, s.cover_url, s.audio_url,
             s.popularity, a.name AS artist_name, al.name AS album_name
      FROM songs s
      LEFT JOIN artists a ON s.artist_id = a.id
      LEFT JOIN albums al ON s.album_id = al.id
      ${whereClause}
      ORDER BY s.popularity DESC
      LIMIT $${params.length}
    `;

    try {
      const { rows } = await db.query(query, params);
      return normalizeRows(rows);
    } catch (error) {
      console.warn('Falling back to sample data because the DB query failed', error.message);
    }
  }

  return filterSampleSongs({ genre, search, limit });
}

async function getSongById(id) {
  if (db.isConfigured()) {
    try {
      const { rows } = await db.query(
        `SELECT s.id, s.title, s.genre, s.mood, s.duration, s.cover_url, s.audio_url,
                s.popularity, a.name AS artist_name, al.name AS album_name
         FROM songs s
         LEFT JOIN artists a ON s.artist_id = a.id
         LEFT JOIN albums al ON s.album_id = al.id
         WHERE s.id = $1
         LIMIT 1`,
        [id]
      );
      if (rows.length) {
        return normalizeRows(rows)[0];
      }
    } catch (error) {
      console.warn('Falling back to sample song because the DB query failed', error.message);
    }
  }

  return sampleData.songs.find((song) => String(song.id) === String(id)) || null;
}

module.exports = {
  getSongs,
  getSongById
};
