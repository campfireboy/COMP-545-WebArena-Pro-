import { demoSongs, demoPlaylists } from '../data/demoData';

const storage = typeof window !== 'undefined' ? window.localStorage : null;

const USERS_KEY = 'demoAuthUsers';
const RESET_KEY = 'demoAuthResetTokens';
const FEEDBACK_KEY = 'demoFeedbackSubmissions';
const RESET_WINDOW_MINUTES = 30;

const defaultUsers = [
  {
    id: 'demo-user',
    email: 'demo@listener.fm',
    displayName: 'Demo Listener',
    tier: 'premium',
    avatarUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=320&q=80',
    bio: 'Loves curated electronica and deep focus playlists.',
    provider: 'demo-local',
    password: 'password123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

let memoryUsers = [...defaultUsers];
let memoryResetTokens = [];
let memoryFeedback = [];

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const persist = (key, value, memoryRef) => {
  if (storage) {
    storage.setItem(key, JSON.stringify(value));
  }
  if (memoryRef === 'users') {
    memoryUsers = value;
  } else if (memoryRef === 'resets') {
    memoryResetTokens = value;
  } else if (memoryRef === 'feedback') {
    memoryFeedback = value;
  }
};

const load = (key, memoryValue) => {
  if (storage) {
    const parsed = safeParse(storage.getItem(key), null);
    if (parsed) {
      return parsed;
    }
  }
  return memoryValue;
};

const ensureDefaults = (users) => {
  const existing = new Set((users || []).map((user) => user.email.toLowerCase()));
  const hydrated = Array.isArray(users) ? [...users] : [];
  defaultUsers.forEach((user) => {
    if (!existing.has(user.email.toLowerCase())) {
      hydrated.push({ ...user });
    }
  });
  return hydrated;
};

const getUsers = () => {
  const stored = ensureDefaults(load(USERS_KEY, memoryUsers));
  persist(USERS_KEY, stored, 'users');
  return stored;
};

const saveUsers = (users) => {
  persist(USERS_KEY, users, 'users');
};

const cleanupResetTokens = () => {
  const now = Date.now();
  const tokens = load(RESET_KEY, memoryResetTokens).filter((token) => {
    if (token.used) {
      return false;
    }
    return new Date(token.expiresAt).getTime() > now;
  });
  persist(RESET_KEY, tokens, 'resets');
  return tokens;
};

const saveResetTokens = (tokens) => {
  persist(RESET_KEY, tokens, 'resets');
};

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}`;
};

const encodeToken = (userId) => `demo-token::${userId}`;
const decodeToken = (token = '') => {
  if (!token.startsWith('demo-token::')) {
    return null;
  }
  return token.split('demo-token::')[1] || null;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
};

const buildAuthPayload = (user) => ({
  token: encodeToken(user.id),
  user: sanitizeUser(user)
});

const filterSongs = ({ genre, search } = {}) => {
  let results = [...demoSongs];
  if (genre) {
    results = results.filter((song) => song.genre === genre);
  }
  if (search) {
    const query = search.trim().toLowerCase();
    if (query) {
      results = results.filter((song) => {
        return [song.title, song.artist, song.album]
          .some((field) => field.toLowerCase().includes(query));
      });
    }
  }
  return results;
};

const recordFeedback = (payload) => {
  const submissions = load(FEEDBACK_KEY, memoryFeedback) || [];
  const next = [
    {
      id: randomId(),
      receivedAt: new Date().toISOString(),
      ...payload
    },
    ...submissions
  ].slice(0, 50);
  persist(FEEDBACK_KEY, next, 'feedback');
};

export const demoApi = {
  async fetchSongs(params) {
    return filterSongs(params);
  },

  async fetchPlaylists() {
    return demoPlaylists;
  },

  async fetchRecommendations(userId = 'demo') {
    const favoriteGenre = userId === 'demo' ? 'electronic' : null;
    const seeds = filterSongs({ genre: favoriteGenre }).slice(0, 4);
    const fallback = [...demoSongs].sort((a, b) => b.popularity - a.popularity).slice(0, 4);
    return { songs: seeds.length ? seeds : fallback };
  },

  async sendFeedback(payload) {
    recordFeedback(payload);
    return { message: 'Feedback stored in demo mode.' };
  },

  async health() {
    return { status: 'ok', mode: 'demo' };
  },

  async register({ email, password, displayName }) {
    const users = getUsers();
    const exists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      throw new Error('Email already registered (demo)');
    }
    const user = {
      id: randomId(),
      email,
      displayName,
      tier: 'free',
      avatarUrl: '',
      bio: '',
      provider: 'demo-local',
      password,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);
    return buildAuthPayload(user);
  },

  async login({ email, password }) {
    const users = getUsers();
    const user = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) {
      throw new Error('Invalid credentials (demo)');
    }
    return buildAuthPayload(user);
  },

  async requestPasswordReset(email) {
    const users = getUsers();
    const user = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return { message: 'If the account exists, a reset token was generated.' };
    }
    const token = randomId();
    const expiresAt = new Date(Date.now() + RESET_WINDOW_MINUTES * 60 * 1000).toISOString();
    const tokens = cleanupResetTokens();
    tokens.push({
      token,
      userId: user.id,
      expiresAt,
      used: false
    });
    saveResetTokens(tokens);
    return {
      message: 'Demo reset token generated locally.',
      resetToken: token
    };
  },

  async resetPassword({ token, password }) {
    const tokens = cleanupResetTokens();
    const entry = tokens.find((item) => item.token === token && !item.used);
    if (!entry) {
      throw new Error('Invalid or expired reset token (demo)');
    }
    entry.used = true;
    saveResetTokens(tokens);
    const users = getUsers();
    const index = users.findIndex((user) => user.id === entry.userId);
    if (index === -1) {
      throw new Error('User missing for reset token (demo)');
    }
    users[index] = {
      ...users[index],
      password,
      updatedAt: new Date().toISOString()
    };
    saveUsers(users);
    return buildAuthPayload(users[index]);
  },

  async getProfile(token) {
    const userId = decodeToken(token);
    if (!userId) {
      throw new Error('Invalid session token (demo)');
    }
    const users = getUsers();
    const user = users.find((entry) => entry.id === userId);
    if (!user) {
      throw new Error('Session expired (demo)');
    }
    return { user: sanitizeUser(user) };
  },

  async updateProfile(token, payload = {}) {
    const userId = decodeToken(token);
    if (!userId) {
      throw new Error('Invalid session token (demo)');
    }
    const users = getUsers();
    const index = users.findIndex((entry) => entry.id === userId);
    if (index === -1) {
      throw new Error('Session expired (demo)');
    }
    const nextUser = {
      ...users[index],
      displayName: payload.displayName ?? users[index].displayName,
      bio: payload.bio ?? users[index].bio,
      avatarUrl: payload.avatarUrl ?? users[index].avatarUrl,
      updatedAt: new Date().toISOString()
    };
    users[index] = nextUser;
    saveUsers(users);
    return { user: sanitizeUser(nextUser) };
  }
};
