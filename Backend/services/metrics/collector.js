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
  const command = `systemctl status ${serviceName} 2>/dev/null || echo "NOT_INSTALLED"`;
  
  const { stdout, code } = await executeCommand(serverConfig, command);

  if (stdout.includes('NOT_INSTALLED') || stdout.includes('could not be found')) {
    return {
      installed: false,
      running: false,
      status: 'not_installed'
    };
  }

  const isActive = stdout.includes('Active: active');
  const isRunning = stdout.includes('running');
  const isStopped = stdout.includes('inactive') || stdout.includes('dead');

  return {
    installed: true,
    running: isActive && isRunning,
    status: isActive && isRunning ? 'running' : (isStopped ? 'stopped' : 'unknown'),
    output: stdout
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
