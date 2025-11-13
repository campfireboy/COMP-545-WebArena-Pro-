const db = require('../db/pool');

async function getStatusSnapshot() {
  const snapshot = {
    uptimeSeconds: Math.round(process.uptime()),
    databaseConfigured: db.isConfigured(),
    databaseReachable: false,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  };

  if (snapshot.databaseConfigured) {
    try {
      await db.query('SELECT 1');
      snapshot.databaseReachable = true;
    } catch (error) {
      snapshot.dbError = error.message;
    }
  }

  return snapshot;
}

module.exports = {
  getStatusSnapshot
};
