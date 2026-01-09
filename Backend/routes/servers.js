const express = require('express');
const router = express.Router();
const { ServerModel, ActivityModel } = require('../models');
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { keyManager, connectionManager, sftpService } = require('../services/ssh');

/**
 * GET /api/servers
 * Get all servers for user
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const servers = await ServerModel.findAll(req.session.userId);
  res.json(servers);
}));

/**
 * GET /api/servers/status/all
 * Check status of all servers
 */
router.get('/status/all', requireAuth, asyncHandler(async (req, res) => {
  const servers = await ServerModel.findAll(req.session.userId);
  
  const statusPromises = servers.map(async (server) => {
    const result = await connectionManager.testConnection(
      server.ip,
      server.username,
      server.privateKeyPath
    );
    return {
      id: server.id,
      status: result.status,
      error: result.error
    };
  });

  const statuses = await Promise.all(statusPromises);

  // Update all servers in storage
  for (let i = 0; i < servers.length; i++) {
    await ServerModel.updateStatus(
      servers[i].id,
      statuses[i].status,
      statuses[i].error || null
    );
  }

  res.json(statuses);
}));

/**
 * GET /api/servers/:id
 * Get a single server
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  res.json(check.server);
}));

/**
 * PUT /api/servers/:id
 * Update server details
 */
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const { name, region } = req.body;
  const updates = {};
  
  if (name !== undefined) updates.name = name || null;
  if (region !== undefined) updates.region = region || null;

  await ServerModel.update(req.params.id, updates);
  
  const updatedServer = await ServerModel.findById(req.params.id);
  res.json(updatedServer);
}));

/**
 * POST /api/servers
 * Add a new server
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, region, ip, username } = req.body;

  if (!ip || !username) {
    return res.status(400).json({ error: 'IP address and username are required' });
  }

  const serverId = Date.now().toString();

  // Generate SSH key for this server
  const keyInfo = await keyManager.generateKeyPair(serverId);

  const newServer = await ServerModel.create({
    id: serverId,
    userId: req.session.userId,
    name: name || null,
    region: region || null,
    ip,
    username,
    privateKeyPath: keyInfo.privateKeyPath,
    publicKey: keyInfo.publicKey,
    setupCommand: keyInfo.setupCommand,
    status: 'pending'
  });

  // Log activity
  try {
    await ActivityModel.create(
      req.session.userId,
      'success',
      `Server ${name || ip} added successfully`
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }

  res.json(newServer);
}));

/**
 * GET /api/servers/:id/status
 * Check connection status for a specific server
 */
router.get('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const result = await connectionManager.testConnection(
    server.ip,
    server.username,
    server.privateKeyPath
  );

  // Update server status
  await ServerModel.updateStatus(server.id, result.status, result.error || null);

  res.json(result);
}));

/**
 * DELETE /api/servers/:id
 * Delete a server
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;

  // Remove SSH keys
  await keyManager.deleteKeyPair(server.privateKeyPath);

  // Close any pooled connections
  connectionManager.pool.closeConnection(server.ip, server.username);

  await ServerModel.remove(req.params.id);

  // Log activity
  try {
    await ActivityModel.create(
      req.session.userId,
      'error',
      `Server ${server.name || server.ip} removed`
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }

  res.json({ success: true });
}));

/**
 * GET /api/servers/:id/os-info
 * Get OS information for a server
 */
router.get('/:id/os-info', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const { getOsInfo } = require('../services/metrics/collector');
  
  const osInfo = await getOsInfo({
    host: server.ip,
    username: server.username,
    privateKeyPath: server.privateKeyPath
  });

  res.json(osInfo);
}));

/**
 * GET /api/servers/:id/docker-status
 * Check if Docker is installed and running on a server
 */
router.get('/:id/docker-status', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;

  try {
    // Check if docker command exists and get version
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: server.ip,
        username: server.username,
        privateKeyPath: server.privateKeyPath
      },
      'docker --version && docker info --format "{{.ServerVersion}}" 2>/dev/null'
    );

    if (code === 0 && stdout.includes('Docker')) {
      // Extract version from output
      const versionMatch = stdout.match(/Docker version ([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      
      res.json({
        installed: true,
        running: true,
        version: version,
        message: `Docker ${version} is installed and running`
      });
    } else {
      res.json({
        installed: false,
        running: false,
        version: null,
        message: 'Docker is not installed or not running'
      });
    }
  } catch (err) {
    res.json({
      installed: false,
      running: false,
      version: null,
      message: err.message || 'Failed to check Docker status'
    });
  }
}));

module.exports = router;
