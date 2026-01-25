const path = require('path');
const { BACKUP_CONFIG } = require('../../config');
const { AppModel, ServerModel, ActivityModel, SnapshotModel } = require('../../models');
const { executeCommand } = require('../ssh/connectionManager');
const sftpService = require('../ssh/sftpService');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;

/**
 * Simple logger for migration operations
 */
class MigrationLogger {
  constructor(deploymentId) {
    this.deploymentId = deploymentId;
    this.logs = [];
    this.startTime = Date.now();
  }

  log(level, stage, message, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      level,
      stage,
      message,
      ...details
    };
    this.logs.push(entry);
    
    const prefix = `[Migration ${this.deploymentId}]`;
    if (level === 'error') {
      console.error(`${prefix} [${stage}] ${message}`, details.error || '');
    } else if (level === 'warn') {
      console.warn(`${prefix} [${stage}] ${message}`);
    } else {
      console.log(`${prefix} [${stage}] ${message}`);
    }
  }

  info(stage, message, details) {
    this.log('info', stage, message, details);
  }

  warn(stage, message, details) {
    this.log('warn', stage, message, details);
  }

  error(stage, message, error) {
    this.log('error', stage, message, { error: error?.message || error });
  }

  getSummary() {
    return {
      deploymentId: this.deploymentId,
      totalTime: Date.now() - this.startTime,
      logs: this.logs
    };
  }
}

/**
 * Resolve volume path - handles both bind mounts (absolute paths) and named volumes
 * @param {Object} serverConfig - SSH server config
 * @param {string} volumePath - Volume path (could be named volume or absolute path)
 * @returns {Promise<string>} - Resolved absolute path
 */
async function resolveVolumePath(serverConfig, volumePath) {
  if (volumePath.startsWith('/')) {
    return volumePath;
  }
  
  const result = await executeCommand(
    serverConfig,
    `docker volume inspect ${volumePath} --format '{{.Mountpoint}}' 2>/dev/null || echo "/var/lib/docker/volumes/${volumePath}/_data"`
  );
  
  const mountpoint = result.stdout.trim();
  return mountpoint || `/var/lib/docker/volumes/${volumePath}/_data`;
}

/**
 * Get volume paths from deployment configuration
 * @param {Object} deployment - Deployment object with volumes
 * @returns {Array<Object>} - Array of { host, container } objects
 */
function getVolumes(deployment) {
  if (!deployment.volumes) return [];
  const volumes = typeof deployment.volumes === 'string' 
    ? JSON.parse(deployment.volumes) 
    : deployment.volumes;
  return volumes.filter(v => v.host && v.container);
}

/**
 * Parse JSON field safely
 */
function parseJson(val) {
  if (!val) return [];
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return val;
}

/**
 * Migrate a deployment from one server to another
 * This handles both "move" (delete original) and "copy" (keep original) operations
 * 
 * @param {Object} params
 * @param {Object} params.deployment - Source deployment object
 * @param {Object} params.sourceServer - Source server object
 * @param {Object} params.targetServer - Target server object  
 * @param {string} params.userId - User ID
 * @param {string} params.newContainerName - Container name on target (required)
 * @param {Array} params.newPortMappings - Port mappings for target (optional, uses source if not provided)
 * @param {boolean} params.deleteOriginal - If true, delete source after successful migration
 * @param {Function} params.onProgress - Progress callback (stage, percent, message)
 * @param {Function} params.checkCancelled - Function to check if migration was cancelled
 * @returns {Promise<Object>} - { success, newDeploymentId, message }
 */
async function migrateDeployment({
  deployment,
  sourceServer,
  targetServer,
  userId,
  newContainerName,
  newPortMappings = null,
  deleteOriginal = false,
  onProgress = () => {},
  checkCancelled = () => false
}) {
  const logger = new MigrationLogger(deployment.id);
  logger.info('init', `Starting migration of ${deployment.container_name}`, {
    source: sourceServer.ip,
    target: targetServer.ip,
    deleteOriginal
  });

  const sourceConfig = {
    host: sourceServer.ip,
    username: sourceServer.username,
    privateKeyPath: sourceServer.private_key_path
  };
  
  const targetConfig = {
    host: targetServer.ip,
    username: targetServer.username,
    privateKeyPath: targetServer.private_key_path
  };

  const volumes = getVolumes(deployment);
  const hasVolumes = volumes.length > 0;
  const tempDir = BACKUP_CONFIG.tempPath;
  const timestamp = Date.now();
  const archiveName = `migration_${deployment.id}_${timestamp}.tar.gz`;
  const localArchivePath = path.join(tempDir, archiveName);
  const remoteArchivePath = `/tmp/${archiveName}`;

  // Helper to check for cancellation
  const throwIfCancelled = (stage) => {
    if (checkCancelled()) {
      logger.warn(stage, 'Migration cancelled by user');
      throw new Error('Migration cancelled by user');
    }
  };
  
  try {
    // Ensure temp directory exists
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }

    throwIfCancelled('init');

    // Step 1: Stop source container
    logger.info('stopping', `Stopping source container ${deployment.container_name}`);
    onProgress('stopping', 5, `Stopping source container ${deployment.container_name}...`);
    await executeCommand(sourceConfig, `docker stop ${deployment.container_id} 2>/dev/null || true`);
    
    // Update status to migrating
    await AppModel.updateDeploymentStatus(deployment.id, 'migrating');

    throwIfCancelled('stopping');

    let volumeData = null;
    
    if (hasVolumes) {
      // Step 2: Archive volumes on source
      logger.info('archiving', `Archiving ${volumes.length} volume(s)`);
      onProgress('archiving', 15, 'Creating archive of volume data...');
      
      throwIfCancelled('archiving');
      
      const resolvedPaths = await Promise.all(
        volumes.map(v => resolveVolumePath(sourceConfig, v.host))
      );
      logger.info('archiving', `Resolved volume paths: ${resolvedPaths.join(', ')}`);
      
      // Verify paths exist
      for (const rPath of resolvedPaths) {
        const checkResult = await executeCommand(sourceConfig, `sudo test -e "${rPath}" && echo "exists" || echo "missing"`);
        if (checkResult.stdout.trim() === 'missing') {
          logger.warn('archiving', `Volume path ${rPath} does not exist, skipping`);
        }
      }
      
      // Create tarball with all volumes (each in subdirectory by index)
      const tarCommands = resolvedPaths.map((p, i) => `sudo tar -C "${p}" -cf - . | (mkdir -p /tmp/migration_vols/${i} && cd /tmp/migration_vols/${i} && tar -xf -)`).join(' && ');
      await executeCommand(sourceConfig, `rm -rf /tmp/migration_vols && mkdir -p /tmp/migration_vols && ${tarCommands}`);
      
      // Create final archive
      await executeCommand(sourceConfig, `cd /tmp && sudo tar -czf ${remoteArchivePath} migration_vols`);
      
      throwIfCancelled('archiving');
      
      // Step 3: Download archive to local
      logger.info('downloading', 'Downloading archive from source server');
      onProgress('downloading', 30, 'Downloading volume data from source server (this may take a while for larger apps)...');
      await sftpService.downloadFile(sourceConfig, remoteArchivePath, localArchivePath);
      
      // Get file size
      const stats = await fs.stat(localArchivePath);
      volumeData = { path: localArchivePath, size: stats.size };
      logger.info('downloading', `Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
      // Cleanup source temp files
      await executeCommand(sourceConfig, `sudo rm -rf /tmp/migration_vols ${remoteArchivePath}`);
      
      throwIfCancelled('downloading');
    }
    
    // Step 4: Prepare target server
    logger.info('preparing', 'Preparing target server');
    onProgress('preparing', 50, 'Preparing target server...');
    
    // Create volume directories on target
    const targetVolumes = volumes.map((v, i) => {
      // For named volumes, we'll create new ones with a unique name
      if (!v.host.startsWith('/')) {
        return { ...v, host: `${newContainerName}_vol_${i}` };
      }
      // For bind mounts, use same path (create if needed)
      return v;
    });
    
    // Create bind mount directories
    for (const vol of targetVolumes) {
      if (vol.host.startsWith('/')) {
        await executeCommand(targetConfig, `sudo mkdir -p "${vol.host}"`);
      }
    }
    
    if (hasVolumes && volumeData) {
      // Step 5: Upload and extract archive on target
      logger.info('uploading', 'Uploading archive to target server');
      onProgress('uploading', 60, 'Uploading volume data to target server (this may take a while for larger apps)...');
      
      throwIfCancelled('uploading');
      
      await sftpService.uploadFile(targetConfig, localArchivePath, remoteArchivePath);
      
      logger.info('extracting', 'Extracting archive on target server');
      onProgress('extracting', 75, 'Extracting volume data on target server...');
      
      // Extract archive
      await executeCommand(targetConfig, `cd /tmp && sudo tar -xzf ${remoteArchivePath}`);
      
      // Copy each volume to its target location
      for (let i = 0; i < targetVolumes.length; i++) {
        const vol = targetVolumes[i];
        const targetPath = await resolveVolumePath(targetConfig, vol.host);
        logger.info('extracting', `Copying data to ${targetPath}`);
        
        // Ensure target exists
        await executeCommand(targetConfig, `sudo mkdir -p "${targetPath}"`);
        
        // Copy data
        await executeCommand(targetConfig, `sudo cp -a /tmp/migration_vols/${i}/. "${targetPath}/"`);
      }
      
      // Cleanup
      await executeCommand(targetConfig, `sudo rm -rf /tmp/migration_vols ${remoteArchivePath}`);
    }
    
    // Step 6: Create new container on target (past point of safe cancellation)
    logger.info('creating', `Creating container ${newContainerName} on target`);
    onProgress('creating', 85, 'Creating container on target server...');
    
    // Get app details for image info
    const app = await AppModel.findById(deployment.app_id, userId);
    if (!app) {
      logger.error('creating', 'App not found');
      throw new Error('App not found');
    }
    
    // Build docker create command (creates container without starting it)
    const envVars = parseJson(deployment.env_vars);
    const restartPolicy = deployment.restart_policy || 'unless-stopped';
    const networkMode = deployment.network_mode || '';
    const command = deployment.command || '';
    const customArgs = deployment.custom_args || '';
    const portMappings = newPortMappings || parseJson(deployment.port_mappings);
    
    let cmd = 'docker create';
    cmd += ` --name ${newContainerName}`;
    
    // Port mappings
    if (portMappings.length > 0) {
      portMappings.forEach(port => {
        if (port.host && port.container) {
          cmd += ` -p ${port.host}:${port.container}`;
        }
      });
    }
    
    // Environment variables
    if (envVars.length > 0) {
      envVars.forEach(envVar => {
        if (envVar.key && envVar.value) {
          cmd += ` -e "${envVar.key}=${envVar.value}"`;
        }
      });
    }
    
    // Volumes
    if (targetVolumes.length > 0) {
      targetVolumes.forEach(vol => {
        if (vol.host && vol.container) {
          cmd += ` -v ${vol.host}:${vol.container}`;
        }
      });
    }
    
    // Restart policy
    if (restartPolicy) {
      cmd += ` --restart ${restartPolicy}`;
    }
    
    // Network mode
    if (networkMode) {
      cmd += ` --network ${networkMode}`;
    }
    
    // Custom arguments
    if (customArgs && customArgs.trim()) {
      cmd += ` ${customArgs.trim()}`;
    }
    
    // Image
    const fullImage = app.registry_url 
      ? `${app.registry_url}/${app.image}:${app.tag || 'latest'}` 
      : `${app.image}:${app.tag || 'latest'}`;
    cmd += ` ${fullImage}`;
    
    // Command override
    if (command) {
      cmd += ` ${command}`;
    }
    
    logger.info('creating', `Pulling image ${fullImage}`);
    // Pull image first
    await executeCommand(targetConfig, `docker pull ${fullImage}`);
    
    logger.info('creating', 'Creating container (stopped state)');
    // Create container without starting
    const { stdout, code } = await executeCommand(targetConfig, cmd);
    
    if (code !== 0) {
      logger.error('creating', 'Failed to create container on target server');
      throw new Error('Failed to create container on target server');
    }
    
    const newContainerId = stdout.trim().substring(0, 12);
    logger.info('creating', `Container created with ID ${newContainerId}`);
    
    // Step 7: Create deployment record
    logger.info('finalizing', 'Creating deployment record');
    onProgress('finalizing', 95, 'Creating deployment record...');
    
    const newDeployment = await AppModel.createDeployment({
      appId: deployment.app_id,
      serverId: targetServer.id,
      containerId: newContainerId,
      containerName: newContainerName,
      status: 'stopped',
      portMappings: portMappings,
      icon: deployment.icon,
      iconUrl: deployment.icon_url
    });
    
    // Update deployment with full config
    await AppModel.updateDeploymentConfig(newDeployment.id, {
      port_mappings: portMappings,
      env_vars: envVars,
      volumes: targetVolumes,
      restart_policy: restartPolicy,
      network_mode: networkMode,
      command: command,
      custom_args: customArgs,
      web_ui_port: deployment.web_ui_port
    });
    
    // Step 8: Handle source deployment
    if (deleteOriginal) {
      logger.info('cleanup', 'Removing source deployment');
      onProgress('cleanup', 98, 'Removing source deployment...');
      
      // Remove source container
      await executeCommand(sourceConfig, `docker rm ${deployment.container_id} 2>/dev/null || true`);
      
      // Remove deployment record
      await AppModel.removeDeployment(deployment.id);
    } else {
      logger.info('cleanup', 'Restarting source container');
      // Just restart the source container
      await executeCommand(sourceConfig, `docker start ${deployment.container_id} 2>/dev/null || true`);
      await AppModel.updateDeploymentStatus(deployment.id, 'running');
    }
    
    // Cleanup local temp file
    if (volumeData) {
      try {
        await fs.unlink(volumeData.path);
      } catch (e) {
        logger.warn('cleanup', `Failed to cleanup temp file: ${e.message}`);
      }
    }
    
    logger.info('complete', `Migration completed successfully in ${Date.now() - logger.startTime}ms`);
    onProgress('complete', 100, `Successfully ${deleteOriginal ? 'moved' : 'copied'} deployment`);
    
    return {
      success: true,
      newDeploymentId: newDeployment.id,
      message: `Deployment ${deleteOriginal ? 'moved' : 'copied'} successfully`,
      logs: logger.getSummary()
    };
    
  } catch (error) {
    logger.error('failed', error.message, error);
    console.error('Migration failed:', error);
    console.error('Migration log summary:', JSON.stringify(logger.getSummary(), null, 2));
    
    // Try to restart source container if stopped
    try {
      logger.info('recovery', 'Attempting to restart source container');
      await executeCommand(sourceConfig, `docker start ${deployment.container_id} 2>/dev/null || true`);
      await AppModel.updateDeploymentStatus(deployment.id, 'running');
      logger.info('recovery', 'Source container restarted successfully');
    } catch (e) {
      logger.error('recovery', 'Failed to restart source container', e);
    }
    
    // Cleanup temp file
    if (localArchivePath) {
      try {
        await fs.unlink(localArchivePath);
      } catch (e) {
        // Ignore
      }
    }
    
    // Attach logs to error for debugging
    error.migrationLogs = logger.getSummary();
    throw error;
  }
}

module.exports = {
  migrateDeployment
};