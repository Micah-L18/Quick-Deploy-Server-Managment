const express = require('express');
const router = express.Router();
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { connectionManager } = require('../services/ssh');
const { getServiceStatus } = require('../services/metrics/collector');

/**
 * Service installation commands
 */
const INSTALL_COMMANDS = {
  nginx: 'sudo apt-get update && sudo apt-get install -y nginx',
  docker: 'curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh && sudo usermod -aG docker $USER',
  nodejs: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
  npm: 'sudo apt-get update && sudo apt-get install -y npm',
  git: 'sudo apt-get update && sudo apt-get install -y git',
  mysql: 'sudo apt-get update && sudo apt-get install -y mysql-server'
};

/**
 * GET /api/servers/:id/services/:serviceName/status
 * Get service status
 */
router.get('/:id/services/:serviceName/status', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const { serviceName } = req.params;

  const status = await getServiceStatus(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    serviceName
  );

  res.json(status);
}));

/**
 * POST /api/servers/:id/services/:serviceName/install
 * Install a service
 */
router.post('/:id/services/:serviceName/install', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const { serviceName } = req.params;

  const installCmd = INSTALL_COMMANDS[serviceName.toLowerCase()];
  if (!installCmd) {
    return res.status(400).json({ error: 'Unsupported service' });
  }

  const { stdout, stderr, code } = await connectionManager.executeCommand(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    installCmd
  );

  if (code !== 0) {
    return res.status(500).json({
      error: 'Installation failed',
      output: stdout,
      errorOutput: stderr,
      exitCode: code
    });
  }

  res.json({
    success: true,
    message: `${serviceName} installed successfully`,
    output: stdout
  });
}));

/**
 * POST /api/servers/:id/services/:serviceName/:action
 * Manage service (start/stop/restart/enable/disable)
 */
router.post('/:id/services/:serviceName/:action', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const { serviceName, action } = req.params;

  // Validate action
  const validActions = ['start', 'stop', 'restart', 'enable', 'disable'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const actionCmd = `sudo systemctl ${action} ${serviceName}`;

  const { stdout, stderr, code } = await connectionManager.executeCommand(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    actionCmd
  );

  if (code !== 0) {
    return res.status(500).json({
      error: `Failed to ${action} ${serviceName}`,
      output: stdout,
      errorOutput: stderr,
      exitCode: code
    });
  }

  res.json({
    success: true,
    message: `${serviceName} ${action} completed successfully`,
    output: stdout
  });
}));

/**
 * GET /api/servers/:id/services
 * Get status of common services
 */
router.get('/:id/services', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const services = ['nginx', 'docker', 'nodejs', 'npm', 'git'];
  
  const serverConfig = {
    host: server.ip,
    username: server.username,
    privateKeyPath: server.privateKeyPath
  };

  const statuses = await Promise.all(
    services.map(async (serviceName) => {
      try {
        const status = await getServiceStatus(serverConfig, serviceName);
        return { name: serviceName, ...status };
      } catch (err) {
        return { name: serviceName, installed: false, running: false, status: 'unknown' };
      }
    })
  );

  res.json(statuses);
}));

module.exports = router;
