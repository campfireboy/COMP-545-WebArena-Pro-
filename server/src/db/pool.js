const { Pool } = require('pg');
const { URL } = require('url');

const shouldUseSSL = process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false };

function normalizeConnectionString(value) {
  if (!value) {
    return null;
  }

  // Ignore placeholders copied from .env.example so the app can run in demo mode.
  if (value.includes('<') || value.includes('>')) {
    console.warn('DATABASE_URL looks like a placeholder. Falling back to sample data until a real connection string is provided.');
    return null;
  }

  try {
    // Basic validation to avoid crashing pg-connection-string with malformed URLs.
    new URL(value);
    return value;
  } catch (error) {
    console.warn(`DATABASE_URL is invalid (${error.message}). Falling back to sample data.`);
    return null;
  }
}

const connectionString = normalizeConnectionString(process.env.DATABASE_URL);
let pool = null;

function createPool() {
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    try {
      pool = new Pool({
        connectionString,
        ssl: shouldUseSSL
      });

      pool.on('error', (error) => {
        console.error('Unexpected PG error', error);
      });
    } catch (error) {
      console.error('Failed to initialize Postgres pool. Sample data will be used instead.', error.message);
      pool = null;
      return null;
    }
  }

  return pool;
}

function getPool() {
  return pool || createPool();
}

async function query(text, params) {
  const activePool = getPool();

  if (!activePool) {
    throw new Error('Database is not configured. Set DATABASE_URL to enable cloud Postgres.');
  }

  return activePool.query(text, params);
}

function isConfigured() {
  return Boolean(connectionString);
}

module.exports = {
  query,
  isConfigured
};
