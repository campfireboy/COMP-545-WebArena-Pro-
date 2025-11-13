const musicService = require('./musicService');
const playlistService = require('./playlistService');
const sampleData = require('../data/sampleData');

async function getRecommendationsForUser(userId) {
  const favoriteGenre = sampleData.userProfiles[userId]?.favoriteGenre || 'electronic';

  const [songs, playlists] = await Promise.all([
    musicService.getSongs({ genre: favoriteGenre, limit: 8 }),
    playlistService.getFeaturedPlaylists()
  ]);

  return {
    userId,
    favoriteGenre,
    songs,
    playlists: playlists.slice(0, 4),
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  getRecommendationsForUser
};
