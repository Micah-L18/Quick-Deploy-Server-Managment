const express = require('express');
const router = express.Router();
const { AppModel, ActivityModel } = require('../models');
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { connectionManager } = require('../services/ssh');
const { checkPortsAvailable } = require('../services/metrics/collector');

/**
 * GET /api/apps
 * Get all apps for user
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const apps = await AppModel.findAll(req.session.userId);
  res.json(apps);
}));

/**
 * GET /api/apps/:id
 * Get single app
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await AppModel.findById(req.params.id, req.session.userId);
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  res.json(app);
}));

/**
 * POST /api/apps
 * Create new app
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'App name is required' });
  }

  const app = await AppModel.create(req.session.userId, name, description);

  // Log activity
  try {
    await ActivityModel.create(
      req.session.userId,
      'success',
      `App "${name}" created`
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }

  res.json(app);
}));

/**
 * PUT /api/apps/:id
 * Update app
 */
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await AppModel.findById(req.params.id, req.session.userId);
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  const { 
    name, 
    description, 
    image, 
    tag, 
    ports, 
    env_vars, 
    volumes, 
    restart_policy, 
    network_mode, 
    command,
    registry_url,
    registry_username,
    registry_password
  } = req.body;
  
  await AppModel.update(req.params.id, { 
    name, 
    description, 
    image, 
    tag, 
    ports, 
    env_vars, 
    volumes, 
    restart_policy, 
    network_mode, 
    command,
    registry_url,
    registry_username,
    registry_password
  });

  const updatedApp = await AppModel.findById(req.params.id, req.session.userId);
  res.json(updatedApp);
}));

/**
 * DELETE /api/apps/:id
 * Delete app
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await AppModel.findById(req.params.id, req.session.userId);
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  await AppModel.remove(req.params.id, req.session.userId);

  // Log activity
  try {
    await ActivityModel.create(
      req.session.userId,
      'error',
      `App "${app.name}" deleted`
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }

  res.json({ success: true });
}));

/**
 * POST /api/apps/:id/check-ports
 * Check if ports are available on a server
 */
router.post('/:id/check-ports', requireAuth, asyncHandler(async (req, res) => {
  const { serverId, ports } = req.body;

  if (!serverId || !ports || !Array.isArray(ports)) {
    return res.status(400).json({ error: 'Server ID and ports array required' });
  }

  // Check if user owns the app
  const app = await AppModel.findById(req.params.id, req.session.userId);
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  // Check if user owns the server
  const serverCheck = await checkServerOwnership(serverId, req.session.userId);
  if (serverCheck.error) {
    return res.status(serverCheck.status).json({ error: serverCheck.error });
  }

  const server = serverCheck.server;
  const portNumbers = ports.map(p => p.host).filter(Boolean);

  const result = await checkPortsAvailable(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    portNumbers
  );

  res.json(result);
}));

/**
 * GET /api/apps/:appId/deployments
 * Get all deployments for an app
 */
router.get('/:appId/deployments', requireAuth, asyncHandler(async (req, res) => {
  const deployments = await AppModel.findDeployments(req.params.appId, req.session.userId);
  res.json(deployments);
}));

/**
 * DELETE /api/apps/:appId/deployments/:deploymentId
 * Remove a deployment
 */
router.delete('/:appId/deployments/:deploymentId', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Stop and remove container via SSH
  const stopCmd = `sudo docker stop ${deployment.container_name} && sudo docker rm ${deployment.container_name}`;
  
  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      stopCmd
    );

    // Remove from database
    await AppModel.removeDeployment(deploymentId);

    res.json({
      success: true,
      message: 'Deployment removed',
      output: stdout
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

/**
 * GET /api/apps/:appId/deployments/:deploymentId/stats
 * Get deployment stats
 */
router.get('/:appId/deployments/:deploymentId/stats', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const statsCmd = `sudo docker stats ${deployment.container_name} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}"`;

  try {
    const { stdout, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      statsCmd
    );

    if (code !== 0 || !stdout.trim()) {
      return res.status(500).json({
        error: 'Failed to get container stats',
        status: 'stopped'
      });
    }

    // Parse stats
    const parts = stdout.trim().split('|');
    if (parts.length >= 4) {
      res.json({
        cpu: parts[0],
        memory: parts[1],
        network: parts[2],
        blockIO: parts[3],
        status: 'running'
      });
    } else {
      res.status(500).json({ error: 'Invalid stats format' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

module.exports = router;
