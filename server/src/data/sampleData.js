const songs = [
  {
    id: 1,
    title: 'Neon Skies',
    artist: 'Luna Waves',
    album: 'Chromatic Dreams',
    duration: 224,
    genre: 'electronic',
    mood: 'uplifting',
    coverUrl: 'https://images.unsplash.com/photo-1511376777868-611b54f68947?auto=format&fit=crop&w=600&q=80',
    audioUrl: 'https://cdn.example.com/audio/neon-skies.mp3',
    popularity: 98
  },
  {
    id: 2,
    title: 'Slow Bloom',
    artist: 'Harbor Lights',
    album: 'Golden Hour',
    duration: 262,
    genre: 'lofi',
    mood: 'focus',
    coverUrl: 'https://images.unsplash.com/photo-1487215078519-e21cc028cb29?auto=format&fit=crop&w=600&q=80',
    audioUrl: 'https://cdn.example.com/audio/slow-bloom.mp3',
    popularity: 87
  },
  {
    id: 3,
    title: 'Runaway City',
    artist: 'Metro Pulse',
    album: 'After Midnight',
    duration: 205,
    genre: 'pop',
    mood: 'energetic',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    audioUrl: 'https://cdn.example.com/audio/runaway-city.mp3',
    popularity: 92
  },
  {
    id: 4,
    title: 'Satellite Heart',
    artist: 'Nova Rue',
    album: 'Gravity',
    duration: 248,
    genre: 'indie',
    mood: 'chill',
    coverUrl: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=600&q=80',
    audioUrl: 'https://cdn.example.com/audio/satellite-heart.mp3',
    popularity: 81
  },
  {
    id: 5,
    title: 'Pulse Lines',
    artist: 'Sonic Theory',
    album: 'Blueprint',
    duration: 233,
    genre: 'electronic',
    mood: 'workout',
    coverUrl: 'https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?auto=format&fit=crop&w=600&q=80',
    audioUrl: 'https://cdn.example.com/audio/pulse-lines.mp3',
    popularity: 88
  },
  {
    id: 6,
    title: 'Paper Boats',
    artist: 'Echo North',
    album: 'Ripple',
    duration: 214,
    genre: 'acoustic',
    mood: 'relax',
    coverUrl: 'https://images.unsplash.com/photo-1454922915609-78549ad709bb?auto=format&fit=crop&w=600&q=80',
    audioUrl: 'https://cdn.example.com/audio/paper-boats.mp3',
    popularity: 74
  }
];

const playlists = [
  {
    id: 100,
    title: 'Focus Flow',
    description: 'Lo-fi beats and mellow keys curated for distraction-free deep work sessions.',
    coverUrl: 'https://images.unsplash.com/photo-1513863323963-1ccdb309bc26?auto=format&fit=crop&w=600&q=80',
    tags: ['focus', 'lofi', 'study'],
    followers: 12450,
    songs: [2, 6, 1]
  },
  {
    id: 101,
    title: 'Morning Sprint',
    description: 'Upbeat electronic and pop to kick start your morning commute.',
    coverUrl: 'https://images.unsplash.com/photo-1507874457470-272b3c8d8ee2?auto=format&fit=crop&w=600&q=80',
    tags: ['pop', 'electronic', 'energy'],
    followers: 38760,
    songs: [1, 3, 5]
  },
  {
    id: 102,
    title: 'Indie Moonlight',
    description: 'Discover dreamy indie gems and late-night anthems.',
    coverUrl: 'https://images.unsplash.com/photo-1470229538611-16ba8c7ffbd7?auto=format&fit=crop&w=600&q=80',
    tags: ['indie', 'chill'],
    followers: 18904,
    songs: [4, 6, 1]
  }
];

const userProfiles = {
  demo: {
    id: 'demo',
    name: 'Demo Listener',
    favoriteGenre: 'electronic'
  }
};

module.exports = {
  songs,
  playlists,
  userProfiles
};
