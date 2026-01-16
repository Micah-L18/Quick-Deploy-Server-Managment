const express = require('express');
const router = express.Router();
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { connectionManager } = require('../services/ssh');
const { getServiceStatus } = require('../services/metrics/collector');

/**
 * Linux service installation commands (Debian/Ubuntu)
 */
const LINUX_INSTALL_COMMANDS = {
  nginx: 'sudo apt-get update && sudo apt-get install -y nginx',
  docker: 'curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh && sudo usermod -aG docker $USER',
  nodejs: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
  npm: 'sudo apt-get update && sudo apt-get install -y npm',
  git: 'sudo apt-get update && sudo apt-get install -y git',
  mysql: 'sudo apt-get update && sudo apt-get install -y mysql-server'
};

/**
 * Windows service installation commands (PowerShell)
 * Note: These get wrapped in powershell.exe -Command when executed
 */
const WINDOWS_INSTALL_COMMANDS = {
  git: 'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements',
  nodejs: 'winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements',
  docker: 'Write-Host \\"Docker Desktop must be installed manually from https://www.docker.com/products/docker-desktop/\\"',
  nginx: `$nginxUrl = 'http://nginx.org/download/nginx-1.24.0.zip'; $nginxPath = 'C:\\nginx'; Invoke-WebRequest -Uri $nginxUrl -OutFile \\"$env:TEMP\\nginx.zip\\"; Expand-Archive -Path \\"$env:TEMP\\nginx.zip\\" -DestinationPath 'C:\\' -Force; if (Test-Path 'C:\\nginx-1.24.0') { Rename-Item 'C:\\nginx-1.24.0' $nginxPath -ErrorAction SilentlyContinue }; Write-Host \\"Nginx installed to $nginxPath\\"`,
  mysql: 'winget install --id Oracle.MySQL -e --source winget --accept-package-agreements --accept-source-agreements'
};

/**
 * Get install command based on OS type
 */
function getInstallCommand(serviceName, osType) {
  if (osType === 'windows') {
    const cmd = WINDOWS_INSTALL_COMMANDS[serviceName.toLowerCase()];
    if (cmd) {
      // Wrap in powershell.exe since OpenSSH defaults to cmd.exe
      return `powershell.exe -NoProfile -Command "${cmd}"`;
    }
    return null;
  }
  return LINUX_INSTALL_COMMANDS[serviceName.toLowerCase()];
}

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
      privateKeyPath: server.privateKeyPath,
      osType: server.osType || 'ubuntu-debian'
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
  const osType = server.osType || 'ubuntu-debian';

  const installCmd = getInstallCommand(serviceName, osType);
  if (!installCmd) {
    return res.status(400).json({ error: `Unsupported service for ${osType}` });
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
  const osType = server.osType || 'ubuntu-debian';

  // Validate action
  const validActions = ['start', 'stop', 'restart', 'enable', 'disable'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  let actionCmd;
  
  if (osType === 'windows') {
    // Windows service management via PowerShell
    // Map service names to Windows service names
    const windowsServiceNames = {
      'docker': 'docker',
      'nginx': 'nginx',
      'mysql': 'MySQL',
      'iis': 'W3SVC'
    };
    
    const winServiceName = windowsServiceNames[serviceName.toLowerCase()] || serviceName;
    let psCmd;
    
    switch (action) {
      case 'start':
        psCmd = `Start-Service -Name '${winServiceName}'`;
        break;
      case 'stop':
        psCmd = `Stop-Service -Name '${winServiceName}'`;
        break;
      case 'restart':
        psCmd = `Restart-Service -Name '${winServiceName}'`;
        break;
      case 'enable':
        psCmd = `Set-Service -Name '${winServiceName}' -StartupType Automatic`;
        break;
      case 'disable':
        psCmd = `Set-Service -Name '${winServiceName}' -StartupType Disabled`;
        break;
    }
    
    // Wrap in powershell.exe since OpenSSH defaults to cmd.exe
    actionCmd = `powershell.exe -NoProfile -Command "${psCmd}"`;
  } else {
    // Linux systemctl
    actionCmd = `sudo systemctl ${action} ${serviceName}`;
  }

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
  const osType = server.osType || 'ubuntu-debian';
  
  // Different default services for Windows vs Linux
  const services = osType === 'windows' 
    ? ['nginx', 'docker', 'nodejs', 'npm', 'git', 'iis', 'mysql']
    : ['nginx', 'docker', 'nodejs', 'npm', 'git'];
  
  const serverConfig = {
    host: server.ip,
    username: server.username,
    privateKeyPath: server.privateKeyPath,
    osType: osType
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
