const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../database/connection');

/**
 * Log an activity
 * @param {string} userId - User ID
 * @param {string} type - Activity type (success, error, info, warning)
 * @param {string} message - Activity message
 * @returns {Promise<Object>}
 */
async function create(userId, type, message) {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  await run(
    'INSERT INTO activities (id, user_id, type, message, timestamp) VALUES (?, ?, ?, ?, ?)',
    [id, userId, type, message, timestamp]
  );

  return { id, type, message, timestamp };
}

/**
 * Get recent activities for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of activities to return
 * @returns {Promise<Array>}
 */
async function findRecent(userId, limit = 10) {
  return all(
    'SELECT * FROM activities WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
    [userId, limit]
  );
}

/**
 * Get activity by ID
 * @param {string} activityId - Activity ID
 * @returns {Promise<Object|null>}
 */
async function findById(activityId) {
  return get('SELECT * FROM activities WHERE id = ?', [activityId]);
}

/**
 * Delete activities older than a certain date
 * @param {Date} beforeDate - Delete activities before this date
 * @returns {Promise<number>} - Number of deleted rows
 */
async function deleteOlderThan(beforeDate) {
  const result = await run(
    'DELETE FROM activities WHERE timestamp < ?',
    [beforeDate.toISOString()]
  );
  return result.changes;
}

/**
 * Delete all activities for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
async function deleteAllForUser(userId) {
  const result = await run('DELETE FROM activities WHERE user_id = ?', [userId]);
  return result.changes;
}

module.exports = {
  create,
  findRecent,
  findById,
  deleteOlderThan,
  deleteAllForUser
};
