const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../database/connection');

/**
 * Get all snapshots for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function findAll(userId) {
  return all(
    `SELECT ds.*, ad.container_name, a.name as app_name, s.ip as server_ip, s.name as server_name
     FROM deployment_snapshots ds
     LEFT JOIN app_deployments ad ON ds.deployment_id = ad.id
     LEFT JOIN apps a ON ad.app_id = a.id
     LEFT JOIN servers s ON ds.server_id = s.id
     WHERE ds.user_id = ?
     ORDER BY ds.created_at DESC`,
    [userId]
  );
}

/**
 * Get snapshots for a specific deployment
 * @param {string} deploymentId - Deployment ID
 * @returns {Promise<Array>}
 */
async function findByDeployment(deploymentId) {
  return all(
    `SELECT ds.*, s.ip as server_ip, s.name as server_name
     FROM deployment_snapshots ds
     LEFT JOIN servers s ON ds.server_id = s.id
     WHERE ds.deployment_id = ?
     ORDER BY ds.created_at DESC`,
    [deploymentId]
  );
}

/**
 * Get snapshot by ID
 * @param {string} snapshotId - Snapshot ID
 * @param {string} userId - User ID (for ownership verification)
 * @returns {Promise<Object|null>}
 */
async function findById(snapshotId, userId = null) {
  if (userId) {
    return get(
      `SELECT ds.*, ad.container_name, a.name as app_name, s.ip as server_ip, s.name as server_name
       FROM deployment_snapshots ds
       LEFT JOIN app_deployments ad ON ds.deployment_id = ad.id
       LEFT JOIN apps a ON ad.app_id = a.id
       LEFT JOIN servers s ON ds.server_id = s.id
       WHERE ds.id = ? AND ds.user_id = ?`,
      [snapshotId, userId]
    );
  }
  return get(
    `SELECT ds.*, ad.container_name, a.name as app_name, s.ip as server_ip, s.name as server_name
     FROM deployment_snapshots ds
     LEFT JOIN app_deployments ad ON ds.deployment_id = ad.id
     LEFT JOIN apps a ON ad.app_id = a.id
     LEFT JOIN servers s ON ds.server_id = s.id
     WHERE ds.id = ?`,
    [snapshotId]
  );
}

/**
 * Create a new snapshot record
 * @param {Object} params - Snapshot parameters
 * @param {string} params.deploymentId - Deployment ID
 * @param {string} params.serverId - Server ID
 * @param {string} params.userId - User ID
 * @param {Array<string>} params.volumePaths - Array of volume paths to backup
 * @param {string} params.notes - Optional notes
 * @returns {Promise<Object>}
 */
async function create({ deploymentId, serverId, userId, volumePaths = [], notes = null }) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const archiveFilename = `snapshot_${id}.tar.gz`;

  await run(
    `INSERT INTO deployment_snapshots 
     (id, deployment_id, server_id, user_id, created_at, volume_paths, archive_filename, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [id, deploymentId, serverId, userId, createdAt, JSON.stringify(volumePaths), archiveFilename, notes]
  );

  return {
    id,
    deployment_id: deploymentId,
    server_id: serverId,
    user_id: userId,
    created_at: createdAt,
    size_bytes: 0,
    volume_paths: volumePaths,
    archive_filename: archiveFilename,
    status: 'pending',
    notes
  };
}

/**
 * Update snapshot status
 * @param {string} snapshotId - Snapshot ID
 * @param {string} status - New status ('pending', 'creating', 'complete', 'failed')
 * @param {number} sizeBytes - Size in bytes (optional)
 * @returns {Promise<void>}
 */
async function updateStatus(snapshotId, status, sizeBytes = null) {
  if (sizeBytes !== null) {
    await run(
      'UPDATE deployment_snapshots SET status = ?, size_bytes = ? WHERE id = ?',
      [status, sizeBytes, snapshotId]
    );
  } else {
    await run(
      'UPDATE deployment_snapshots SET status = ? WHERE id = ?',
      [status, snapshotId]
    );
  }
}

/**
 * Delete a snapshot record
 * @param {string} snapshotId - Snapshot ID
 * @returns {Promise<void>}
 */
async function remove(snapshotId) {
  await run('DELETE FROM deployment_snapshots WHERE id = ?', [snapshotId]);
}

/**
 * Get total storage used by snapshots
 * @param {string} userId - User ID (optional, if null returns global total)
 * @returns {Promise<number>} - Total bytes used
 */
async function getTotalStorageUsed(userId = null) {
  let result;
  if (userId) {
    result = await get(
      'SELECT COALESCE(SUM(size_bytes), 0) as total FROM deployment_snapshots WHERE user_id = ? AND status = ?',
      [userId, 'complete']
    );
  } else {
    result = await get(
      'SELECT COALESCE(SUM(size_bytes), 0) as total FROM deployment_snapshots WHERE status = ?',
      ['complete']
    );
  }
  return result?.total || 0;
}

/**
 * Get snapshot count for a deployment
 * @param {string} deploymentId - Deployment ID
 * @returns {Promise<number>}
 */
async function getCountForDeployment(deploymentId) {
  const result = await get(
    'SELECT COUNT(*) as count FROM deployment_snapshots WHERE deployment_id = ? AND status = ?',
    [deploymentId, 'complete']
  );
  return result?.count || 0;
}

/**
 * Get expired snapshots (older than retention days)
 * @param {number} retentionDays - Number of days to retain snapshots
 * @returns {Promise<Array>}
 */
async function findExpired(retentionDays) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  return all(
    `SELECT * FROM deployment_snapshots 
     WHERE status = 'complete' AND created_at < ?
     ORDER BY created_at ASC`,
    [cutoffDate.toISOString()]
  );
}

module.exports = {
  findAll,
  findByDeployment,
  findById,
  create,
  updateStatus,
  remove,
  getTotalStorageUsed,
  getCountForDeployment,
  findExpired
};
