const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { SnapshotModel, AppModel, ServerModel, ActivityModel, SystemSettingsModel } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware');
const { snapshotService } = require('../services/snapshots');
const { BACKUP_CONFIG } = require('../config');

/**
 * GET /api/snapshots
 * Get all snapshots for user with storage stats
 */
router.get('/snapshots', requireAuth, asyncHandler(async (req, res) => {
  const snapshots = await SnapshotModel.findAll(req.session.userId);
  const storageStats = await snapshotService.getStorageStats();
  
  res.json({
    snapshots,
    storage: storageStats
  });
}));

/**
 * GET /api/snapshots/storage
 * Get storage statistics
 */
router.get('/snapshots/storage', requireAuth, asyncHandler(async (req, res) => {
  const stats = await snapshotService.getStorageStats();
  res.json(stats);
}));

/**
 * GET /api/snapshots/:id
 * Get single snapshot
 */
router.get('/snapshots/:id', requireAuth, asyncHandler(async (req, res) => {
  const snapshot = await SnapshotModel.findById(req.params.id, req.session.userId);
  
  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }
  
  res.json(snapshot);
}));

/**
 * GET /api/snapshots/:id/download
 * Download snapshot archive
 */
router.get('/snapshots/:id/download', requireAuth, asyncHandler(async (req, res) => {
  const snapshot = await SnapshotModel.findById(req.params.id, req.session.userId);
  
  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }
  
  if (snapshot.status !== 'complete') {
    return res.status(400).json({ error: 'Snapshot is not complete' });
  }
  
  const archivePath = path.join(BACKUP_CONFIG.storagePath, snapshot.archive_filename);
  
  if (!fs.existsSync(archivePath)) {
    return res.status(404).json({ error: 'Archive file not found' });
  }
  
  res.download(archivePath, snapshot.archive_filename);
}));

/**
 * DELETE /api/snapshots/:id
 * Delete a snapshot
 */
router.delete('/snapshots/:id', requireAuth, asyncHandler(async (req, res) => {
  const snapshot = await SnapshotModel.findById(req.params.id, req.session.userId);
  
  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }
  
  await snapshotService.deleteSnapshot(snapshot);
  
  await ActivityModel.create(
    req.session.userId,
    'snapshot_deleted',
    `Deleted snapshot for ${snapshot.app_name || 'unknown app'}`
  );
  
  res.json({ success: true });
}));

/**
 * POST /api/deployments/:id/snapshots
 * Create a snapshot for a deployment
 */
router.post('/deployments/:id/snapshots', requireAuth, asyncHandler(async (req, res) => {
  const { notes, socketId } = req.body;
  const deploymentId = req.params.id;
  const { io } = req.app.get('io') || {};
  
  // Get deployment with app info
  const deployment = await AppModel.findDeploymentByIdSimple(deploymentId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }
  
  // Verify ownership via app
  if (deployment.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  // Get server
  const server = await ServerModel.findById(deployment.server_id);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Check if container is running
  if (deployment.status !== 'running' && deployment.status !== 'stopped') {
    return res.status(400).json({ error: 'Deployment must be running or stopped to create snapshot' });
  }
  
  // Check volumes exist
  const volumePaths = snapshotService.getVolumePaths(deployment);
  if (volumePaths.length === 0) {
    return res.status(400).json({ error: 'No volumes configured for this deployment' });
  }
  
  // Store original status and set to snapshotting
  const originalStatus = deployment.status;
  await AppModel.updateDeploymentStatus(deploymentId, 'snapshotting');
  
  // Progress stages with percentages
  const progressStages = {
    stopping: { percent: 10, label: 'Stopping container' },
    archiving: { percent: 40, label: 'Creating archive' },
    transferring: { percent: 70, label: 'Transferring data (this may take a while for larger apps)' },
    restarting: { percent: 90, label: 'Restarting container' },
    complete: { percent: 100, label: 'Complete' }
  };
  
  // Progress callback to emit Socket.IO events (broadcast to all clients)
  const onProgress = (stage, message) => {
    if (io) {
      const stageInfo = progressStages[stage] || { percent: 0, label: stage };
      io.emit('snapshot-progress', {
        deploymentId,
        stage,
        percent: stageInfo.percent,
        label: stageInfo.label,
        message,
        type: 'create'
      });
    }
  };
  
  try {
    const snapshot = await snapshotService.createSnapshot({
      deployment,
      server,
      userId: req.session.userId,
      notes,
      onProgress
    });
    
    // Restore to running status (container was restarted)
    await AppModel.updateDeploymentStatus(deploymentId, 'running');
    
    await ActivityModel.create(
      req.session.userId,
      'snapshot_created',
      `Created snapshot for ${deployment.app_name} on ${server.name || server.ip}`
    );
    
    res.json(snapshot);
  } catch (error) {
    console.error('Snapshot creation failed:', error);
    // Restore original status on error
    await AppModel.updateDeploymentStatus(deploymentId, originalStatus);
    if (io) {
      io.emit('snapshot-progress', {
        deploymentId,
        stage: 'error',
        percent: 0,
        label: 'Error',
        message: error.message,
        type: 'create'
      });
    }
    res.status(500).json({ error: error.message });
  }
}));

/**
 * GET /api/deployments/:id/snapshots
 * Get all snapshots for a deployment
 */
router.get('/deployments/:id/snapshots', requireAuth, asyncHandler(async (req, res) => {
  const deploymentId = req.params.id;
  
  // Verify ownership
  const deployment = await AppModel.findDeploymentByIdSimple(deploymentId);
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }
  
  if (deployment.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  const snapshots = await SnapshotModel.findByDeployment(deploymentId);
  res.json(snapshots);
}));

/**
 * POST /api/snapshots/:id/restore
 * Restore a snapshot to its deployment
 */
router.post('/snapshots/:id/restore', requireAuth, asyncHandler(async (req, res) => {
  const { socketId } = req.body;
  const { io } = req.app.get('io') || {};
  
  const snapshot = await SnapshotModel.findById(req.params.id, req.session.userId);
  
  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }
  
  if (snapshot.status !== 'complete') {
    return res.status(400).json({ error: 'Snapshot is not complete' });
  }
  
  // Get deployment
  const deployment = await AppModel.findDeploymentByIdSimple(snapshot.deployment_id);
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }
  
  // Get server
  const server = await ServerModel.findById(snapshot.server_id);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Store original status and set to restoring
  const originalStatus = deployment.status;
  await AppModel.updateDeploymentStatus(snapshot.deployment_id, 'restoring');
  
  // Progress stages with percentages
  const progressStages = {
    stopping: { percent: 10, label: 'Stopping container' },
    transferring: { percent: 30, label: 'Uploading archive (this may take a while for larger apps)' },
    extracting: { percent: 70, label: 'Extracting data' },
    restarting: { percent: 90, label: 'Restarting container' },
    complete: { percent: 100, label: 'Complete' }
  };
  
  // Progress callback to emit Socket.IO events (broadcast to all clients)
  const onProgress = (stage, message) => {
    if (io) {
      const stageInfo = progressStages[stage] || { percent: 0, label: stage };
      io.emit('snapshot-progress', {
        snapshotId: snapshot.id,
        deploymentId: snapshot.deployment_id,
        stage,
        percent: stageInfo.percent,
        label: stageInfo.label,
        message,
        type: 'restore'
      });
    }
  };
  
  try {
    await snapshotService.restoreSnapshot({
      snapshot,
      server,
      deployment,
      onProgress
    });
    
    // Status is already set to 'running' by snapshotService.restoreSnapshot
    
    await ActivityModel.create(
      req.session.userId,
      'snapshot_restored',
      `Restored snapshot for ${snapshot.app_name || 'unknown'} on ${server.name || server.ip}`
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Snapshot restore failed:', error);
    // Restore original status on error
    await AppModel.updateDeploymentStatus(snapshot.deployment_id, originalStatus);
    if (io) {
      io.emit('snapshot-progress', {
        snapshotId: snapshot.id,
        deploymentId: snapshot.deployment_id,
        stage: 'error',
        percent: 0,
        label: 'Error',
        message: error.message,
        type: 'restore'
      });
    }
    res.status(500).json({ error: error.message });
  }
}));

/**
 * GET /api/settings/backup
 * Get backup settings
 */
router.get('/settings/backup', requireAuth, asyncHandler(async (req, res) => {
  const settings = await SystemSettingsModel.getBackupSettings();
  const stats = await snapshotService.getStorageStats();
  
  res.json({
    ...settings,
    storage: stats
  });
}));

/**
 * PUT /api/settings/backup
 * Update backup settings
 */
router.put('/settings/backup', requireAuth, asyncHandler(async (req, res) => {
  const { storagePath, maxStorageGB, retentionDays } = req.body;
  
  await SystemSettingsModel.updateBackupSettings({
    storagePath,
    maxStorageGB,
    retentionDays
  });
  
  const settings = await SystemSettingsModel.getBackupSettings();
  res.json(settings);
}));

module.exports = router;
