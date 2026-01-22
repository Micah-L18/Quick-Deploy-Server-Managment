const express = require('express');
const router = express.Router();
const { requireAuth, asyncHandler } = require('../middleware');
const { AppModel, ServerModel, ActivityModel } = require('../models');
const { migrationService } = require('../services/migration');

// Store for Socket.IO instance
let io = null;

// Track active migrations for cancellation
const activeMigrations = new Map();

/**
 * Set the Socket.IO instance for real-time progress updates
 * @param {Object} socketIo - Socket.IO server instance
 */
function setSocketIO(socketIo) {
  io = socketIo;
}

/**
 * Get active migrations map (for the service to check cancellation)
 */
function getActiveMigrations() {
  return activeMigrations;
}

/**
 * POST /api/migrations/preview
 * Preview a migration - check what will be migrated
 */
router.post('/preview', requireAuth, asyncHandler(async (req, res) => {
  const { deploymentId, appId, targetServerId } = req.body;

  if (!deploymentId || !appId || !targetServerId) {
    return res.status(400).json({ error: 'Missing required fields: deploymentId, appId, targetServerId' });
  }

  // Get deployment
  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Get source server
  const sourceServer = await ServerModel.findById(deployment.server_id);
  if (!sourceServer) {
    return res.status(404).json({ error: 'Source server not found' });
  }

  // Get target server
  const targetServer = await ServerModel.findById(targetServerId);
  if (!targetServer) {
    return res.status(404).json({ error: 'Target server not found' });
  }

  // Parse volumes
  let volumes = [];
  if (deployment.volumes) {
    try {
      volumes = typeof deployment.volumes === 'string' 
        ? JSON.parse(deployment.volumes) 
        : deployment.volumes;
    } catch {
      volumes = [];
    }
  }

  // Parse port mappings
  let portMappings = [];
  if (deployment.port_mappings) {
    try {
      portMappings = typeof deployment.port_mappings === 'string' 
        ? JSON.parse(deployment.port_mappings) 
        : deployment.port_mappings;
    } catch {
      portMappings = [];
    }
  }

  // Get app details
  const app = await AppModel.findById(appId, req.session.userId);

  res.json({
    deployment: {
      id: deployment.id,
      containerName: deployment.container_name,
      containerId: deployment.container_id,
      status: deployment.status
    },
    sourceServer: {
      id: sourceServer.id,
      name: sourceServer.name || sourceServer.ip,
      ip: sourceServer.ip
    },
    targetServer: {
      id: targetServer.id,
      name: targetServer.name || targetServer.ip,
      ip: targetServer.ip
    },
    app: app ? {
      id: app.id,
      name: app.name,
      image: app.image,
      tag: app.tag
    } : null,
    volumes: volumes,
    portMappings: portMappings,
    hasVolumes: volumes.length > 0,
    suggestedContainerName: `${deployment.container_name}_${targetServer.name || 'copy'}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  });
}));

/**
 * POST /api/migrations/check-conflicts
 * Check for port and container name conflicts on target server
 */
router.post('/check-conflicts', requireAuth, asyncHandler(async (req, res) => {
  const { targetServerId, containerName, portMappings } = req.body;

  if (!targetServerId) {
    return res.status(400).json({ error: 'Target server ID required' });
  }

  const conflicts = {
    containerName: false,
    ports: []
  };

  // Get all deployments on target server
  const serverDeployments = await AppModel.findDeploymentsByServer(targetServerId, req.session.userId);

  // Check container name conflict
  if (containerName) {
    const nameConflict = serverDeployments.some(d => 
      d.container_name && d.container_name.toLowerCase() === containerName.toLowerCase()
    );
    conflicts.containerName = nameConflict;
  }

  // Check port conflicts
  if (portMappings && Array.isArray(portMappings)) {
    const hostPorts = portMappings.map(p => String(p.host)).filter(Boolean);
    
    for (const deployment of serverDeployments) {
      let deploymentPorts = deployment.port_mappings;
      if (typeof deploymentPorts === 'string') {
        try {
          deploymentPorts = JSON.parse(deploymentPorts);
        } catch {
          deploymentPorts = [];
        }
      }
      deploymentPorts = deploymentPorts || [];

      for (const hostPort of hostPorts) {
        const hasConflict = deploymentPorts.some(p => String(p.host) === hostPort);
        if (hasConflict && !conflicts.ports.includes(hostPort)) {
          conflicts.ports.push(hostPort);
        }
      }
    }
  }

  res.json(conflicts);
}));

/**
 * POST /api/migrations/execute
 * Execute a migration (move or copy)
 */
router.post('/execute', requireAuth, asyncHandler(async (req, res) => {
  const { 
    deploymentId, 
    appId, 
    targetServerId, 
    containerName, 
    portMappings,
    deleteOriginal = false,
    socketId 
  } = req.body;

  if (!deploymentId || !appId || !targetServerId || !containerName) {
    return res.status(400).json({ 
      error: 'Missing required fields: deploymentId, appId, targetServerId, containerName' 
    });
  }

  // Get deployment
  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Check status - can't migrate while snapshotting/restoring/migrating
  if (['snapshotting', 'restoring', 'migrating'].includes(deployment.status)) {
    return res.status(400).json({ error: `Cannot migrate while deployment is ${deployment.status}` });
  }

  // Get source server
  const sourceServer = await ServerModel.findById(deployment.server_id);
  if (!sourceServer) {
    return res.status(404).json({ error: 'Source server not found' });
  }

  // Get target server
  const targetServer = await ServerModel.findById(targetServerId);
  if (!targetServer) {
    return res.status(404).json({ error: 'Target server not found' });
  }

  // Same server check
  if (sourceServer.id === targetServer.id) {
    return res.status(400).json({ error: 'Source and target servers must be different' });
  }

  // Progress callback (broadcast to all clients)
  const onProgress = (stage, percent, message) => {
    // Update tracking
    if (activeMigrations.has(deploymentId)) {
      activeMigrations.get(deploymentId).stage = stage;
      activeMigrations.get(deploymentId).percent = percent;
    }
    
    if (io) {
      io.emit('migration-progress', {
        deploymentId,
        stage,
        percent,
        message,
        type: deleteOriginal ? 'move' : 'copy'
      });
    }
  };

  // Track this migration
  activeMigrations.set(deploymentId, {
    deploymentId,
    userId: req.session.userId,
    cancelled: false,
    stage: 'starting',
    percent: 0,
    startTime: Date.now()
  });

  try {
    const result = await migrationService.migrateDeployment({
      deployment,
      sourceServer,
      targetServer,
      userId: req.session.userId,
      newContainerName: containerName,
      newPortMappings: portMappings || null,
      deleteOriginal,
      onProgress,
      checkCancelled: () => activeMigrations.get(deploymentId)?.cancelled === true
    });

    // Remove from active migrations
    activeMigrations.delete(deploymentId);

    // Log activity
    await ActivityModel.create(
      req.session.userId,
      deleteOriginal ? 'deployment_moved' : 'deployment_copied',
      `${deleteOriginal ? 'Moved' : 'Copied'} ${deployment.container_name} from ${sourceServer.name || sourceServer.ip} to ${targetServer.name || targetServer.ip}`
    );

    res.json(result);
  } catch (error) {
    // Remove from active migrations
    activeMigrations.delete(deploymentId);
    
    console.error('Migration failed:', error);

    // Log the failure
    await ActivityModel.create(
      req.session.userId,
      'migration_failed',
      `Migration of ${deployment.container_name} failed: ${error.message}`
    );
    
    if (io) {
      io.emit('migration-progress', {
        deploymentId,
        stage: 'error',
        percent: 0,
        message: error.message,
        type: deleteOriginal ? 'move' : 'copy'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
}));

/**
 * POST /api/migrations/:deploymentId/cancel
 * Cancel an active migration
 */
router.post('/:deploymentId/cancel', requireAuth, asyncHandler(async (req, res) => {
  const { deploymentId } = req.params;

  const migration = activeMigrations.get(deploymentId);
  if (!migration) {
    return res.status(404).json({ error: 'No active migration found for this deployment' });
  }

  // Check ownership
  if (migration.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Not authorized to cancel this migration' });
  }

  // Check if we can safely cancel at this stage
  const safeToCancel = ['starting', 'stopping', 'archiving', 'downloading', 'uploading'].includes(migration.stage);
  if (!safeToCancel) {
    return res.status(400).json({ 
      error: `Cannot cancel migration at stage: ${migration.stage}. The operation is too far along to safely cancel.` 
    });
  }

  // Mark as cancelled
  migration.cancelled = true;

  // Log the cancellation
  await ActivityModel.create(
    req.session.userId,
    'migration_cancelled',
    `Migration cancelled at stage: ${migration.stage}`
  );

  if (io) {
    io.emit('migration-progress', {
      deploymentId,
      stage: 'cancelled',
      percent: migration.percent,
      message: 'Migration cancelled by user',
      type: 'cancel'
    });
  }

  res.json({ success: true, message: 'Migration cancellation requested' });
}));

/**
 * GET /api/migrations/active
 * Get list of active migrations for current user
 */
router.get('/active', requireAuth, asyncHandler(async (req, res) => {
  const userMigrations = [];
  for (const [deploymentId, migration] of activeMigrations) {
    if (migration.userId === req.session.userId) {
      userMigrations.push({
        deploymentId,
        stage: migration.stage,
        percent: migration.percent,
        startTime: migration.startTime,
        cancelled: migration.cancelled
      });
    }
  }
  res.json(userMigrations);
}));

module.exports = router;
module.exports.setSocketIO = setSocketIO;
module.exports.getActiveMigrations = getActiveMigrations;
