const { executeCommand } = require('../ssh/connectionManager');
const { parseMetrics } = require('./parser');

/**
 * Commands to collect server metrics
 */
const METRICS_COMMANDS = [
  'uname -srm',
  'uptime',
  'free -m',
  'df -h /',
  'nproc',
  'cat /proc/cpuinfo | grep "model name" | head -1',
  'cat /proc/meminfo | grep MemTotal',
  'hostname',
  // Get two CPU readings 1 second apart for accurate usage calculation
  'cat /proc/stat | grep "^cpu " | head -1 && sleep 1 && cat /proc/stat | grep "^cpu " | head -1'
];

/**
 * Collect metrics from a server
 * @param {Object} serverConfig - { host, username, privateKeyPath }
 * @returns {Promise<Object>} - Parsed metrics
 */
async function collectMetrics(serverConfig) {
  const results = [];

  for (const command of METRICS_COMMANDS) {
    try {
      const { stdout, stderr, code } = await executeCommand(serverConfig, command);
      results.push(stdout.trim());
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  return parseMetrics(results);
}

/**
 * Get OS information from a server
 * @param {Object} serverConfig - Server configuration
 * @returns {Promise<Object>}
 */
async function getOsInfo(serverConfig) {
  const command = 'cat /etc/os-release 2>/dev/null || lsb_release -a 2>/dev/null || echo "Unknown"';
  
  const { stdout } = await executeCommand(serverConfig, command);
  const { parseOsRelease } = require('./parser');
  
  return parseOsRelease(stdout);
}

/**
 * Check if a service is installed and running
 * @param {Object} serverConfig - Server configuration
 * @param {string} serviceName - Service name
 * @returns {Promise<Object>}
 */
async function getServiceStatus(serverConfig, serviceName) {
  // Different detection strategies for different services
  let checkCommand;
  
  switch (serviceName.toLowerCase()) {
    case 'docker':
      // Check both systemctl and docker command existence
      checkCommand = `
        DOCKER_BIN=$(command -v docker 2>/dev/null)
        DOCKER_RUNNING=$(systemctl is-active docker 2>/dev/null || echo "inactive")
        DOCKER_VERSION=$(docker --version 2>/dev/null || echo "")
        echo "BIN:$DOCKER_BIN"
        echo "STATUS:$DOCKER_RUNNING"
        echo "VERSION:$DOCKER_VERSION"
      `;
      break;
    case 'nginx':
      // Check both systemctl and nginx command existence
      checkCommand = `
        NGINX_BIN=$(command -v nginx 2>/dev/null)
        NGINX_RUNNING=$(systemctl is-active nginx 2>/dev/null || echo "inactive")
        NGINX_VERSION=$(nginx -v 2>&1 || echo "")
        echo "BIN:$NGINX_BIN"
        echo "STATUS:$NGINX_RUNNING"
        echo "VERSION:$NGINX_VERSION"
      `;
      break;
    case 'nodejs':
      // Node.js is not a service, just check binary
      checkCommand = `
        NODE_BIN=$(command -v node 2>/dev/null)
        NODE_VERSION=$(node --version 2>/dev/null || echo "")
        echo "BIN:$NODE_BIN"
        echo "STATUS:installed"
        echo "VERSION:$NODE_VERSION"
      `;
      break;
    case 'npm':
      // npm is not a service, just check binary
      checkCommand = `
        NPM_BIN=$(command -v npm 2>/dev/null)
        NPM_VERSION=$(npm --version 2>/dev/null || echo "")
        echo "BIN:$NPM_BIN"
        echo "STATUS:installed"
        echo "VERSION:$NPM_VERSION"
      `;
      break;
    case 'git':
      // git is not a service, just check binary
      checkCommand = `
        GIT_BIN=$(command -v git 2>/dev/null)
        GIT_VERSION=$(git --version 2>/dev/null | sed 's/git version //' || echo "")
        echo "BIN:$GIT_BIN"
        echo "STATUS:installed"
        echo "VERSION:$GIT_VERSION"
      `;
      break;
    default:
      // Generic systemctl check for other services
      checkCommand = `
        SERVICE_RUNNING=$(systemctl is-active ${serviceName} 2>/dev/null || echo "not_found")
        SERVICE_ENABLED=$(systemctl is-enabled ${serviceName} 2>/dev/null || echo "not_found")
        echo "BIN:"
        echo "STATUS:$SERVICE_RUNNING"
        echo "VERSION:"
      `;
  }
  
  const { stdout } = await executeCommand(serverConfig, checkCommand);
  
  const lines = stdout.split('\n');
  let bin = '', status = '', version = '';
  
  for (const line of lines) {
    if (line.startsWith('BIN:')) bin = line.substring(4).trim();
    if (line.startsWith('STATUS:')) status = line.substring(7).trim();
    if (line.startsWith('VERSION:')) version = line.substring(8).trim();
  }
  
  // Determine installation and running status
  const isInstalled = bin !== '' || (status !== 'not_found' && status !== '' && status !== 'inactive');
  const isRunning = status === 'active' || status === 'running' || status === 'installed';
  
  // Special case for nodejs/npm/git - they're "running" if installed (not a daemon)
  if (serviceName.toLowerCase() === 'nodejs' || serviceName.toLowerCase() === 'npm' || serviceName.toLowerCase() === 'git') {
    return {
      installed: bin !== '' || version !== '',
      running: bin !== '' || version !== '',
      status: (bin !== '' || version !== '') ? 'installed' : 'not_installed',
      version: version
    };
  }
  
  return {
    installed: isInstalled || bin !== '',
    running: isRunning,
    status: !isInstalled && bin === '' ? 'not_installed' : (isRunning ? 'running' : 'stopped'),
    version: version
  };
}

/**
 * Check if ports are in use on a server
 * @param {Object} serverConfig - Server configuration
 * @param {Array<number>} ports - Ports to check
 * @returns {Promise<Object>}
 */
async function checkPortsAvailable(serverConfig, ports) {
  if (!ports || ports.length === 0) {
    return { available: true, conflicts: [] };
  }

  const command = `sudo lsof -i :${ports.join(',')} 2>/dev/null || true`;
  const { stdout } = await executeCommand(serverConfig, command);

  const lines = stdout.split('\n').filter(line => line.trim());
  const conflicts = [];

  ports.forEach(port => {
    const portInUse = lines.some(line => line.includes(`:${port} `));
    if (portInUse) {
      conflicts.push({
        port,
        inUse: true,
        details: lines.find(line => line.includes(`:${port} `)) || ''
      });
    }
  });

  return {
    available: conflicts.length === 0,
    conflicts
  };
}

module.exports = {
  collectMetrics,
  getOsInfo,
  getServiceStatus,
  checkPortsAvailable,
  METRICS_COMMANDS
};
