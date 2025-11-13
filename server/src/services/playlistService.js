const db = require('../db/pool');
const sampleData = require('../data/sampleData');

function normalizePlaylist(row) {
  return {
    id: row.id,
    title: row.title || row.name,
    description: row.description,
    coverUrl: row.cover_url || row.coverUrl,
    tags: row.tags ? row.tags.split(',').map((tag) => tag.trim()) : row.tags,
    followers: row.followers || row.listeners || 0
  };
}

async function getFeaturedPlaylists() {
  if (db.isConfigured()) {
    try {
      const { rows } = await db.query(
        `SELECT id, name AS title, description, cover_url, followers, string_agg(tag, ',') AS tags
         FROM playlists
         LEFT JOIN playlist_tags ON playlists.id = playlist_tags.playlist_id
         GROUP BY playlists.id
         ORDER BY followers DESC
         LIMIT 6`
      );
      if (rows.length) {
        return rows.map(normalizePlaylist);
      }
    } catch (error) {
      console.warn('Playlist query failed, falling back to sample data', error.message);
    }
  }

  return sampleData.playlists;
}

async function getPlaylistById(id) {
  if (db.isConfigured()) {
    try {
      const playlistQuery = await db.query(
        `SELECT id, name AS title, description, cover_url, followers
         FROM playlists
         WHERE id = $1`,
        [id]
      );

      if (!playlistQuery.rows.length) {
        return null;
      }

      const songsQuery = await db.query(
        `SELECT s.id, s.title, s.duration, s.cover_url, s.audio_url,
                a.name AS artist_name, al.name AS album_name
         FROM playlist_songs ps
         JOIN songs s ON ps.song_id = s.id
         LEFT JOIN artists a ON s.artist_id = a.id
         LEFT JOIN albums al ON s.album_id = al.id
         WHERE ps.playlist_id = $1
         ORDER BY ps.sequence ASC`,
        [id]
      );

      return {
        ...normalizePlaylist(playlistQuery.rows[0]),
        songs: songsQuery.rows.map((row) => ({
          id: row.id,
          title: row.title,
          artist: row.artist_name,
          album: row.album_name,
          coverUrl: row.cover_url,
          audioUrl: row.audio_url,
          duration: Number(row.duration)
        }))
      };
    } catch (error) {
      console.warn('Playlist lookup failed, falling back to sample data', error.message);
    }
  }

  const playlist = sampleData.playlists.find((item) => String(item.id) === String(id));
  return playlist || null;
}

module.exports = {
  getFeaturedPlaylists,
  getPlaylistById
};
