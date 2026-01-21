const path = require('path');
const { run, get, all } = require('../database/connection');
const { SSH_KEYS_DIR } = require('../config');

/**
 * Resolve a key path - converts relative key filename to absolute path
 * @param {string} keyPath - Key path (could be absolute or just filename)
 * @returns {string} - Resolved absolute path
 */
function resolveKeyPath(keyPath) {
  if (!keyPath) return null;
  // If it's already an absolute path, extract just the filename
  const filename = path.basename(keyPath);
  // Return the path relative to SSH_KEYS_DIR
  return path.join(SSH_KEYS_DIR, filename);
}

/**
 * Convert database row to camelCase object
 * @param {Object} row - Database row
 * @returns {Object}
 */
function toCamelCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    region: row.region,
    ip: row.ip,
    username: row.username,
    osType: row.os_type || 'ubuntu-debian',
    // Resolve key path at runtime so it works across machines
    privateKeyPath: resolveKeyPath(row.private_key_path),
    publicKey: row.public_key,
    setupCommand: row.setup_command,
    status: row.status,
    error: row.error,
    addedAt: row.added_at,
    lastChecked: row.last_checked,
    firstConnectedAt: row.first_connected_at,
    // Customization fields
    displayName: row.display_name,
    color: row.color,
    icon: row.icon,
    tags: row.tags ? JSON.parse(row.tags) : []
  };
}

/**
 * Get all servers for a user
 * @param {string} userId - User ID (optional)
 * @returns {Promise<Array>}
 */
async function findAll(userId = null) {
  const query = userId
    ? 'SELECT * FROM servers WHERE user_id = ? ORDER BY added_at DESC'
    : 'SELECT * FROM servers ORDER BY added_at DESC';
  const params = userId ? [userId] : [];

  const rows = await all(query, params);
  return rows.map(toCamelCase);
}

/**
 * Get server by ID
 * @param {string} serverId - Server ID
 * @returns {Promise<Object|null>}
 */
async function findById(serverId) {
  const row = await get('SELECT * FROM servers WHERE id = ?', [serverId]);
  return toCamelCase(row);
}

/**
 * Get servers by status
 * @param {string} status - Server status
 * @returns {Promise<Array>}
 */
async function findByStatus(status) {
  const rows = await all('SELECT * FROM servers WHERE status = ?', [status]);
  return rows.map(toCamelCase);
}

/**
 * Find server by user ID and IP address
 * @param {string} userId - User ID
 * @param {string} ip - Server IP address
 * @returns {Promise<Object|null>}
 */
async function findByUserAndIp(userId, ip) {
  const row = await get('SELECT * FROM servers WHERE user_id = ? AND ip = ?', [userId, ip]);
  return toCamelCase(row);
}

/**
 * Create a new server
 * @param {Object} server - Server data
 * @returns {Promise<Object>}
 */
async function create(server) {
  const id = server.id || Date.now().toString();
  const addedAt = server.addedAt || new Date().toISOString();

  await run(`
    INSERT INTO servers 
    (id, user_id, name, region, ip, username, os_type, private_key_path, public_key, setup_command, status, error, added_at, last_checked, display_name, color, icon, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    server.userId || null,
    server.name || null,
    server.region || null,
    server.ip,
    server.username,
    server.osType || 'ubuntu-debian',
    server.privateKeyPath,
    server.publicKey,
    server.setupCommand,
    server.status || 'pending',
    server.error || null,
    addedAt,
    server.lastChecked || null,
    server.displayName || null,
    server.color || null,
    server.icon || null,
    server.tags ? JSON.stringify(server.tags) : null
  ]);

  return { ...server, id, addedAt };
}

/**
 * Update a server
 * @param {string} serverId - Server ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function update(serverId, updates) {
  const server = await findById(serverId);
  if (!server) throw new Error('Server not found');

  const updatedServer = { ...server, ...updates };

  // Handle tags serialization
  const tagsValue = updatedServer.tags 
    ? JSON.stringify(updatedServer.tags) 
    : null;

  await run(`
    INSERT OR REPLACE INTO servers 
    (id, user_id, name, region, ip, username, private_key_path, public_key, setup_command, status, error, added_at, last_checked, display_name, color, icon, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    updatedServer.id,
    updatedServer.userId || null,
    updatedServer.name || null,
    updatedServer.region || null,
    updatedServer.ip,
    updatedServer.username,
    updatedServer.privateKeyPath,
    updatedServer.publicKey,
    updatedServer.setupCommand,
    updatedServer.status,
    updatedServer.error || null,
    updatedServer.addedAt,
    updatedServer.lastChecked || null,
    updatedServer.displayName || null,
    updatedServer.color || null,
    updatedServer.icon || null,
    tagsValue
  ]);
}

/**
 * Delete a server
 * @param {string} serverId - Server ID
 * @returns {Promise<number>} - Number of deleted rows
 */
async function remove(serverId) {
  const result = await run('DELETE FROM servers WHERE id = ?', [serverId]);
  return result.changes;
}

/**
 * Update server status
 * If server has never connected (first_connected_at is null) and status is offline, keep it as pending
 * @param {string} serverId - Server ID
 * @param {string} status - New status (online/offline)
 * @param {string|null} error - Error message
 * @returns {Promise<void>}
 */
async function updateStatus(serverId, status, error = null) {
  const server = await get('SELECT first_connected_at, status FROM servers WHERE id = ?', [serverId]);
  
  if (!server) return;
  
  const now = new Date().toISOString();
  
  // If this is the first successful connection, record it
  if (status === 'online' && !server.first_connected_at) {
    await run(
      'UPDATE servers SET status = ?, error = ?, last_checked = ?, first_connected_at = ? WHERE id = ?',
      [status, error, now, now, serverId]
    );
  } 
  // If server has never connected and connection failed, keep it as pending
  else if (!server.first_connected_at && status === 'offline') {
    await run(
      'UPDATE servers SET status = ?, error = ?, last_checked = ? WHERE id = ?',
      ['pending', error, now, serverId]
    );
  }
  // Normal status update for servers that have connected before
  else {
    await run(
      'UPDATE servers SET status = ?, error = ?, last_checked = ? WHERE id = ?',
      [status, error, now, serverId]
    );
  }
}

module.exports = {
  findAll,
  findById,
  findByStatus,
  findByUserAndIp,
  create,
  update,
  remove,
  updateStatus
};
