const sqlite3 = require('sqlite3').verbose();
const { DB_FILE } = require('../config');

// Single database connection instance
let db = null;

/**
 * Get database connection (singleton pattern)
 * @returns {sqlite3.Database}
 */
function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_FILE);
  }
  return db;
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
async function closeDb() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) reject(err);
        else {
          db = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

/**
 * Run a SQL query (INSERT, UPDATE, DELETE)
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Get a single row
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>}
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

/**
 * Get all rows
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>}
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Execute multiple statements in a transaction
 * @param {Function} callback - Function receiving db operations
 * @returns {Promise<void>}
 */
async function transaction(callback) {
  await run('BEGIN TRANSACTION');
  try {
    await callback({ run, get, all });
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

module.exports = {
  getDb,
  closeDb,
  run,
  get,
  all,
  transaction
};
