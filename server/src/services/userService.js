const db = require('../db/pool');

const inMemoryState = {
  users: new Map(),
  resetTokens: new Map(),
  sequence: 1
};

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || row.displayName,
    tier: row.tier || 'free',
    avatarUrl: row.avatar_url || row.avatarUrl,
    bio: row.bio,
    provider: row.provider || 'local',
    providerId: row.provider_id || row.providerId,
    passwordHash: row.password_hash || row.passwordHash,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  const clone = { ...user };
  delete clone.passwordHash;
  return clone;
}

function ensureDemoUser() {
  if (!db.isConfigured() && !inMemoryState.demoUserCreated) {
    const demoUser = {
      id: inMemoryState.sequence++,
      email: 'demo@listener.fm',
      displayName: 'Demo Listener',
      tier: 'premium',
      avatarUrl: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=400&q=80',
      bio: 'Loves curated electronica and deep focus playlists.',
      provider: 'local',
      passwordHash: '$2b$10$ORWBLnpxiDVwhXjaUIzJLerP036xBIH8lf7aXLfctaRXWbSHwy3bO' // bcrypt hash for "password123"
    };
    inMemoryState.users.set(demoUser.email.toLowerCase(), demoUser);
    inMemoryState.demoUserCreated = true;
  }
}

ensureDemoUser();

async function createUser({ email, passwordHash, displayName, provider = 'local', providerId, avatarUrl }) {
  if (db.isConfigured()) {
    const { rows } = await db.query(
      `INSERT INTO users (email, display_name, password_hash, provider, provider_id, avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [email, displayName, passwordHash, provider, providerId, avatarUrl]
    );
    return sanitizeUser(normalizeUser(rows[0]));
  }

  const user = {
    id: inMemoryState.sequence++,
    email,
    displayName,
    passwordHash,
    provider,
    providerId,
    avatarUrl,
    tier: 'free',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  inMemoryState.users.set(email.toLowerCase(), user);
  return sanitizeUser(user);
}

async function findByEmail(email) {
  if (!email) return null;
  if (db.isConfigured()) {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return normalizeUser(rows[0]);
  }
  return inMemoryState.users.get(email.toLowerCase()) || null;
}

async function findById(id) {
  if (!id) return null;
  if (db.isConfigured()) {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return sanitizeUser(normalizeUser(rows[0]));
  }

  for (const user of inMemoryState.users.values()) {
    if (String(user.id) === String(id)) {
      return sanitizeUser(user);
    }
  }
  return null;
}

async function updateProfile(id, updates = {}) {
  if (db.isConfigured()) {
    const fields = [];
    const params = [];

    if (typeof updates.displayName === 'string') {
      params.push(updates.displayName);
      fields.push(`display_name = $${params.length}`);
    }
    if (typeof updates.bio === 'string') {
      params.push(updates.bio);
      fields.push(`bio = $${params.length}`);
    }
    if (typeof updates.avatarUrl === 'string') {
      params.push(updates.avatarUrl);
      fields.push(`avatar_url = $${params.length}`);
    }

    params.push(id);
    fields.push(`updated_at = NOW()`);

    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    return sanitizeUser(normalizeUser(rows[0]));
  }

  for (const [key, user] of inMemoryState.users.entries()) {
    if (String(user.id) === String(id)) {
      const nextUser = {
        ...user,
        displayName: updates.displayName ?? user.displayName,
        bio: updates.bio ?? user.bio,
        avatarUrl: updates.avatarUrl ?? user.avatarUrl,
        updatedAt: new Date().toISOString()
      };
      inMemoryState.users.set(key, nextUser);
      return sanitizeUser(nextUser);
    }
  }
  return null;
}

async function updatePassword(id, passwordHash) {
  if (db.isConfigured()) {
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, id]
    );
    return;
  }

  for (const [key, user] of inMemoryState.users.entries()) {
    if (String(user.id) === String(id)) {
      inMemoryState.users.set(key, { ...user, passwordHash });
      return;
    }
  }
}

async function upsertOAuthUser({ provider, providerId, email, displayName, avatarUrl }) {
  if (!provider || !providerId) {
    throw new Error('Provider and providerId are required');
  }

  if (db.isConfigured()) {
    const existing = await db.query(
      `SELECT * FROM users WHERE provider = $1 AND provider_id = $2 LIMIT 1`,
      [provider, providerId]
    );

    if (existing.rows.length) {
      return sanitizeUser(normalizeUser(existing.rows[0]));
    }

    const { rows } = await db.query(
      `INSERT INTO users (email, display_name, provider, provider_id, avatar_url, tier)
       VALUES ($1,$2,$3,$4,$5,'free')
       RETURNING *`,
      [email, displayName, provider, providerId, avatarUrl]
    );
    return sanitizeUser(normalizeUser(rows[0]));
  }

  for (const user of inMemoryState.users.values()) {
    if (user.provider === provider && user.providerId === providerId) {
      return sanitizeUser(user);
    }
  }

  const user = {
    id: inMemoryState.sequence++,
    email,
    displayName,
    provider,
    providerId,
    avatarUrl,
    tier: 'free',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  inMemoryState.users.set(email.toLowerCase(), user);
  return sanitizeUser(user);
}

async function storeResetToken({ userId, tokenHash, expiresAt }) {
  if (db.isConfigured()) {
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userId, tokenHash, expiresAt]
    );
    return;
  }

  const id = inMemoryState.resetTokens.size + 1;
  inMemoryState.resetTokens.set(tokenHash, {
    id,
    userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used_at: null
  });
}

async function findResetToken(tokenHash) {
  if (db.isConfigured()) {
    const { rows } = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  const entry = inMemoryState.resetTokens.get(tokenHash);
  if (!entry) return null;
  if (entry.used_at) return null;
  if (new Date(entry.expires_at) < new Date()) return null;
  return entry;
}

async function markResetTokenUsed(id) {
  if (db.isConfigured()) {
    await db.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [id]
    );
    return;
  }

  for (const [hash, token] of inMemoryState.resetTokens.entries()) {
    if (token.id === id) {
      inMemoryState.resetTokens.set(hash, { ...token, used_at: new Date().toISOString() });
      return;
    }
  }
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  updateProfile,
  updatePassword,
  upsertOAuthUser,
  storeResetToken,
  findResetToken,
  markResetTokenUsed,
  sanitizeUser
};
