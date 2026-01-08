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
    custom_args,
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
    custom_args,
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
  const stopCmd = `docker stop ${deployment.container_name} && docker rm ${deployment.container_name}`;
  
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
 * POST /api/apps/:appId/deployments/:deploymentId/start
 * Start a stopped container
 */
router.post('/:appId/deployments/:deploymentId/start', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const containerRef = deployment.container_name || deployment.container_id;
  if (!containerRef) {
    return res.status(400).json({ error: 'No container reference found' });
  }

  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      `docker start ${containerRef}`
    );

    if (code === 0) {
      // Update deployment status in database
      await AppModel.updateDeploymentStatus(deploymentId, 'running');
      res.json({ success: true, message: 'Container started', output: stdout });
    } else {
      res.status(500).json({ error: stderr || 'Failed to start container' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

/**
 * POST /api/apps/:appId/deployments/:deploymentId/stop
 * Stop a running container
 */
router.post('/:appId/deployments/:deploymentId/stop', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const containerRef = deployment.container_name || deployment.container_id;
  if (!containerRef) {
    return res.status(400).json({ error: 'No container reference found' });
  }

  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      `docker stop ${containerRef}`
    );

    if (code === 0) {
      // Update deployment status in database
      await AppModel.updateDeploymentStatus(deploymentId, 'stopped');
      res.json({ success: true, message: 'Container stopped', output: stdout });
    } else {
      res.status(500).json({ error: stderr || 'Failed to stop container' });
    }
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

  // Debug log
  console.log('Stats for deployment:', {
    id: deployment.id,
    container_name: deployment.container_name,
    container_id: deployment.container_id,
    server_ip: deployment.ip
  });

  // Use container_id if container_name isn't available
  const containerRef = deployment.container_name || deployment.container_id;
  
  if (!containerRef) {
    return res.json({ error: 'No container reference found', status: 'unknown' });
  }

  const statsCmd = `docker stats ${containerRef} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}"`;

  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path  // Note: DB column is snake_case
      },
      statsCmd
    );

    console.log('Stats command result:', { stdout, stderr, code });

    if (code !== 0 || !stdout.trim()) {
      return res.json({
        error: stderr || 'Container not running',
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
      res.json({ error: 'Invalid stats format', status: 'unknown' });
    }
  } catch (err) {
    console.error('Stats error:', err);
    res.json({ error: err.message, status: 'error' });
  }
}));

/**
 * GET /api/apps/:appId/deployments/:deploymentId/logs
 * Get deployment container logs
 */
router.get('/:appId/deployments/:deploymentId/logs', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;
  const { lines = 100 } = req.query;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const containerRef = deployment.container_name || deployment.container_id;
  
  if (!containerRef) {
    return res.json({ error: 'No container reference found', logs: '' });
  }

  const logsCmd = `docker logs ${containerRef} --tail ${lines} 2>&1`;

  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      logsCmd
    );

    // Docker logs outputs to stderr for error logs, combine both
    const logs = stdout || stderr || 'No logs available';
    res.json({ logs, error: null });
  } catch (err) {
    console.error('Logs error:', err);
    res.json({ error: err.message, logs: '' });
  }
}));

module.exports = router;
