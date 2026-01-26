const fs = require('fs').promises;
const path = require('path');
const { BACKUP_CONFIG } = require('../../config');
const { SnapshotModel, SystemSettingsModel, AppModel } = require('../../models');
const { executeCommand } = require('../ssh/connectionManager');
const sftpService = require('../ssh/sftpService');

/**
 * Ensure backup directories exist
 */
async function ensureBackupDirs() {
  try {
    await fs.access(BACKUP_CONFIG.storagePath);
  } catch {
    await fs.mkdir(BACKUP_CONFIG.storagePath, { recursive: true });
  }
  
  try {
    await fs.access(BACKUP_CONFIG.tempPath);
  } catch {
    await fs.mkdir(BACKUP_CONFIG.tempPath, { recursive: true });
  }
}

/**
 * Get storage statistics
 * @returns {Promise<Object>} - { usedBytes, maxBytes, availableBytes, usedPercentage }
 */
async function getStorageStats() {
  const settings = await SystemSettingsModel.getBackupSettings();
  const usedBytes = await SnapshotModel.getTotalStorageUsed();
  const maxBytes = settings.maxStorageGB * 1024 * 1024 * 1024;
  const availableBytes = Math.max(0, maxBytes - usedBytes);
  const usedPercentage = maxBytes > 0 ? Math.round((usedBytes / maxBytes) * 100) : 0;
  
  return {
    usedBytes,
    maxBytes,
    availableBytes,
    usedPercentage,
    usedGB: (usedBytes / 1024 / 1024 / 1024).toFixed(2),
    maxGB: settings.maxStorageGB
  };
}

/**
 * Check if there's enough storage for a new snapshot
 * @param {number} estimatedSize - Estimated size in bytes
 * @returns {Promise<boolean>}
 */
async function hasAvailableStorage(estimatedSize) {
  const stats = await getStorageStats();
  return stats.availableBytes >= estimatedSize;
}

/**
 * Get volume paths from deployment configuration
 * @param {Object} deployment - Deployment object with volumes
 * @returns {Array<string>} - Array of host paths
 */
function getVolumePaths(deployment) {
  const volumes = deployment.volumes ? JSON.parse(deployment.volumes) : [];
  return volumes
    .filter(v => v.host && v.container)
    .map(v => v.host);
}

/**
 * Resolve volume path - handles both bind mounts (absolute paths) and named volumes
 * @param {Object} serverConfig - SSH server config
 * @param {string} volumePath - Volume path (could be named volume or absolute path)
 * @returns {Promise<string>} - Resolved absolute path
 */
async function resolveVolumePath(serverConfig, volumePath) {
  // If it's already an absolute path, return it
  if (volumePath.startsWith('/')) {
    return volumePath;
  }
  
  // It's a named volume, get the actual path from Docker
  const result = await executeCommand(
    serverConfig,
    `docker volume inspect ${volumePath} --format '{{.Mountpoint}}' 2>/dev/null || echo "/var/lib/docker/volumes/${volumePath}/_data"`
  );
  
  const mountpoint = result.stdout.trim();
  if (!mountpoint) {
    return `/var/lib/docker/volumes/${volumePath}/_data`;
  }
  
  return mountpoint;
}

/**
 * Create a snapshot of a deployment's volumes
 * @param {Object} params - Parameters
 * @param {Object} params.deployment - Deployment object
 * @param {Object} params.server - Server object with connection details
 * @param {string} params.userId - User ID
 * @param {string} params.notes - Optional notes
 * @param {Function} params.onProgress - Progress callback (stage, message)
 * @returns {Promise<Object>} - Created snapshot
 */
async function createSnapshot({ deployment, server, userId, notes = null, onProgress = () => {} }) {
  await ensureBackupDirs();
  
  // Fetch full app configuration for orphan revival
  let appConfig = null;
  let appId = null;
  let appName = null;
  
  if (deployment.app_id) {
    try {
      const app = await AppModel.findById(deployment.app_id, userId);
      if (app) {
        appConfig = {
          name: app.name,
          image: app.image,
          tag: app.tag,
          ports: app.ports ? JSON.parse(app.ports) : [],
          env_vars: app.env_vars ? JSON.parse(app.env_vars) : [],
          volumes: app.volumes ? JSON.parse(app.volumes) : [],
          restart_policy: app.restart_policy,
          command: app.command,
          network_mode: app.network_mode,
          privileged: app.privileged === 1,
          memory_limit: app.memory_limit,
          cpu_limit: app.cpu_limit,
          icon: app.icon,
          icon_url: app.icon_url
        };
        appId = app.id;
        appName = app.name;
      }
    } catch (err) {
      console.error('Failed to fetch app config for snapshot:', err);
    }
  }
  
  // Capture deployment-specific overrides
  const deploymentConfig = {
    container_name: deployment.container_name,
    port_mappings: deployment.port_mappings ? JSON.parse(deployment.port_mappings) : null,
    env_overrides: deployment.env_overrides ? JSON.parse(deployment.env_overrides) : null,
    volume_overrides: deployment.volume_overrides ? JSON.parse(deployment.volume_overrides) : null,
    command_override: deployment.command_override,
    memory_limit_override: deployment.memory_limit_override,
    cpu_limit_override: deployment.cpu_limit_override,
    icon: deployment.icon,
    icon_url: deployment.icon_url
  };
  
  const volumePaths = getVolumePaths(deployment);
  
  if (volumePaths.length === 0) {
    throw new Error('No volumes configured for this deployment');
  }
  
  // Check storage availability (estimate 0 for now, will update after)
  const stats = await getStorageStats();
  if (stats.usedPercentage >= 100) {
    throw new Error('Backup storage quota exceeded');
  }
  
  // Create snapshot record
  const snapshot = await SnapshotModel.create({
    deploymentId: deployment.id,
    serverId: server.id,
    userId,
    volumePaths,
    notes,
    appConfig,
    deploymentConfig,
    appId,
    appName
  });
  
  const serverConfig = {
    host: server.ip,
    username: server.username,
    privateKeyPath: server.private_key_path
  };
  
  try {
    await SnapshotModel.updateStatus(snapshot.id, 'creating');
    
    // Step 1: Stop container
    onProgress('stopping', `Stopping container ${deployment.container_name}...`);
    await executeCommand(serverConfig, `docker stop ${deployment.container_id}`);
    
    // Step 2: Resolve volume paths (handle named volumes vs bind mounts)
    onProgress('archiving', 'Resolving volume paths...');
    const resolvedPaths = await Promise.all(
      volumePaths.map(p => resolveVolumePath(serverConfig, p))
    );
    
    // Verify paths exist
    for (const rPath of resolvedPaths) {
      const checkResult = await executeCommand(serverConfig, `sudo test -e "${rPath}" && echo "exists" || echo "missing"`);
      if (checkResult.stdout.trim() === 'missing') {
        throw new Error(`Volume path does not exist: ${rPath}`);
      }
    }
    
    // Step 3: Create tar archive on remote server
    onProgress('archiving', 'Creating archive of volume data...');
    const remoteTempPath = `/tmp/${snapshot.archive_filename}`;
    
    // Create tar with absolute paths - strip leading slash for tar to work correctly
    const tarPaths = resolvedPaths.map(p => p.substring(1)).join(' ');
    
    // Create tar with gzip compression
    const tarResult = await executeCommand(
      serverConfig,
      `sudo tar -czvf ${remoteTempPath} -C / ${tarPaths} 2>&1`
    );
    
    if (tarResult.code !== 0 && !tarResult.stdout) {
      throw new Error(`Failed to create archive: ${tarResult.stderr || tarResult.stdout}`);
    }
    
    // Step 4: Get archive size
    const sizeResult = await executeCommand(serverConfig, `stat -c%s ${remoteTempPath} 2>/dev/null || stat -f%z ${remoteTempPath}`);
    const sizeBytes = parseInt(sizeResult.stdout.trim()) || 0;
    
    // Check if we have space
    if (!await hasAvailableStorage(sizeBytes)) {
      // Cleanup and fail
      await executeCommand(serverConfig, `rm -f ${remoteTempPath}`);
      throw new Error('Not enough backup storage available');
    }
    
    // Step 4: Download archive to backend
    onProgress('transferring', 'Transferring archive to backup storage...');
    const localPath = path.join(BACKUP_CONFIG.storagePath, snapshot.archive_filename);
    
    await sftpService.downloadFile(serverConfig, remoteTempPath, localPath);
    
    // Step 5: Cleanup remote temp file
    await executeCommand(serverConfig, `rm -f ${remoteTempPath}`);
    
    // Step 6: Restart container
    onProgress('restarting', `Restarting container ${deployment.container_name}...`);
    await executeCommand(serverConfig, `docker start ${deployment.container_id}`);
    
    // Step 7: Update snapshot record
    await SnapshotModel.updateStatus(snapshot.id, 'complete', sizeBytes);
    
    onProgress('complete', 'Snapshot created successfully');
    
    return {
      ...snapshot,
      size_bytes: sizeBytes,
      status: 'complete'
    };
    
  } catch (error) {
    // Try to restart container on failure
    try {
      await executeCommand(serverConfig, `docker start ${deployment.container_id}`);
    } catch (restartError) {
      console.error('Failed to restart container after snapshot error:', restartError);
    }
    
    // Update snapshot status to failed
    await SnapshotModel.updateStatus(snapshot.id, 'failed');
    
    throw error;
  }
}

/**
 * Delete a snapshot and its archive file
 * @param {Object} snapshot - Snapshot object
 * @returns {Promise<void>}
 */
async function deleteSnapshot(snapshot) {
  // Delete archive file
  const archivePath = path.join(BACKUP_CONFIG.storagePath, snapshot.archive_filename);
  try {
    await fs.unlink(archivePath);
  } catch (err) {
    // File may not exist
    if (err.code !== 'ENOENT') {
      console.error('Failed to delete archive file:', err);
    }
  }
  
  // Delete database record
  await SnapshotModel.remove(snapshot.id);
}

/**
 * Restore a snapshot to a server
 * @param {Object} params - Parameters
 * @param {Object} params.snapshot - Snapshot object
 * @param {Object} params.server - Target server object
 * @param {string} params.deploymentId - Target deployment ID (for stopping container)
 * @param {Object} params.deployment - Target deployment object
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<void>}
 */
async function restoreSnapshot({ snapshot, server, deployment, onProgress = () => {} }) {
  const serverConfig = {
    host: server.ip,
    username: server.username,
    privateKeyPath: server.private_key_path
  };
  
  const localPath = path.join(BACKUP_CONFIG.storagePath, snapshot.archive_filename);
  const remoteTempPath = `/tmp/${snapshot.archive_filename}`;
  
  try {
    // Step 1: Stop container
    onProgress('stopping', `Stopping container ${deployment.container_name}...`);
    await executeCommand(serverConfig, `docker stop ${deployment.container_id}`);
    
    // Step 2: Upload archive to server
    onProgress('transferring', 'Uploading archive to server...');
    await sftpService.uploadFile(serverConfig, localPath, remoteTempPath);
    
    // Step 3: Extract archive
    onProgress('extracting', 'Extracting volume data...');
    const extractResult = await executeCommand(
      serverConfig,
      `sudo tar -xzvf ${remoteTempPath} -C / 2>/dev/null || tar -xzvf ${remoteTempPath} -C /`
    );
    
    if (extractResult.code !== 0 && !extractResult.stdout) {
      throw new Error(`Failed to extract archive: ${extractResult.stderr}`);
    }
    
    // Step 4: Cleanup temp file
    await executeCommand(serverConfig, `rm -f ${remoteTempPath}`);
    
    // Step 5: Restart container
    onProgress('restarting', `Restarting container ${deployment.container_name}...`);
    await executeCommand(serverConfig, `docker start ${deployment.container_id}`);
    
    // Step 6: Update deployment status in database to 'running'
    await AppModel.updateDeploymentStatus(deployment.id, 'running');
    
    onProgress('complete', 'Snapshot restored successfully');
    
  } catch (error) {
    // Try to restart container on failure
    try {
      await executeCommand(serverConfig, `docker start ${deployment.container_id}`);
    } catch (restartError) {
      console.error('Failed to restart container after restore error:', restartError);
    }
    
    throw error;
  }
}

/**
 * Cleanup expired snapshots
 * @returns {Promise<number>} - Number of snapshots cleaned up
 */
async function cleanupExpiredSnapshots() {
  const settings = await SystemSettingsModel.getBackupSettings();
  const expired = await SnapshotModel.findExpired(settings.retentionDays);
  
  let cleaned = 0;
  for (const snapshot of expired) {
    try {
      await deleteSnapshot(snapshot);
      cleaned++;
    } catch (err) {
      console.error(`Failed to cleanup snapshot ${snapshot.id}:`, err);
    }
  }
  
  return cleaned;
}

module.exports = {
  ensureBackupDirs,
  getStorageStats,
  hasAvailableStorage,
  getVolumePaths,
  createSnapshot,
  deleteSnapshot,
  restoreSnapshot,
  cleanupExpiredSnapshots
};
