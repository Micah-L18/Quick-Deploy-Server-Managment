const bcrypt = require('bcryptjs');
const { run, get } = require('../database/connection');

/**
 * Create a new user
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @param {string} name - User name
 * @returns {Promise<{id: string, email: string, name: string}>}
 */
async function createUser(email, password, name) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = Date.now().toString();
  const createdAt = new Date().toISOString();

  await run(
    'INSERT INTO users (id, email, password, name, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, email, hashedPassword, name, createdAt]
  );

  return { id: userId, email, name };
}

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>}
 */
async function findByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email]);
}

/**
 * Get user by ID (excludes password)
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
async function findById(userId) {
  return get('SELECT id, email, name, created_at FROM users WHERE id = ?', [userId]);
}

/**
 * Verify user password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Check if any users exist in the database
 * @returns {Promise<boolean>}
 */
async function hasUsers() {
  const result = await get('SELECT COUNT(*) as count FROM users');
  return result && result.count > 0;
}

/**
 * Update user
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function updateUser(userId, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  if (updates.password !== undefined) {
    const hashedPassword = await bcrypt.hash(updates.password, 10);
    fields.push('password = ?');
    values.push(hashedPassword);
  }

  if (fields.length === 0) return;

  values.push(userId);
  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  verifyPassword,
  hasUsers,
  updateUser
};
