const express = require('express');
const musicService = require('../services/musicService');
const playlistService = require('../services/playlistService');
const recommendationService = require('../services/recommendationService');
const feedbackService = require('../services/feedbackService');
const { getStatusSnapshot } = require('../services/statusService');
const authRoutes = require('./authRoutes');
const { requireAuth } = require('../middleware/authMiddleware');
const userService = require('../services/userService');

const router = express.Router();

router.use('/auth', authRoutes);

router.get('/health', async (_req, res) => {
  const snapshot = await getStatusSnapshot();
  res.json({
    status: 'ok',
    ...snapshot
  });
});

router.get('/songs', async (req, res, next) => {
  try {
    const songs = await musicService.getSongs({
      genre: req.query.genre,
      search: req.query.search,
      limit: Number(req.query.limit) || 20
    });
    res.json(songs);
  } catch (error) {
    next(error);
  }
});

router.get('/songs/:id', async (req, res, next) => {
  try {
    const song = await musicService.getSongById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }
    res.json(song);
  } catch (error) {
    next(error);
  }
});

router.get('/playlists', async (req, res, next) => {
  try {
    const playlists = await playlistService.getFeaturedPlaylists();
    res.json(playlists);
  } catch (error) {
    next(error);
  }
});

router.get('/playlists/:id', async (req, res, next) => {
  try {
    const playlist = await playlistService.getPlaylistById(req.params.id);
    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }
    res.json(playlist);
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id/recommendations', async (req, res, next) => {
  try {
    const payload = await recommendationService.getRecommendationsForUser(req.params.id);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
});

router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const allowed = {
      displayName: req.body.displayName,
      bio: req.body.bio,
      avatarUrl: req.body.avatarUrl
    };
    const updated = await userService.updateProfile(req.user.id, allowed);
    res.json({ user: updated });
  } catch (error) {
    next(error);
  }
});

router.post('/feedback', async (req, res, next) => {
  try {
    const result = await feedbackService.submitFeedback(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Internal server error'
  });
});

module.exports = router;
