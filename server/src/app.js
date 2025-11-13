const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');

const app = express();

const allowedOrigins = (process.env.ORIGIN || '').split(',').filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());
app.use('/api', apiRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'Spotify-like API',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

module.exports = app;
