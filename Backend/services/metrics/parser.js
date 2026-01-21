/**
 * Parse metrics from SSH command outputs
 */

/**
 * Parse all metrics from command results
 * @param {Array} results - Array of command outputs
 * @returns {Object} - Parsed metrics object
 */
function parseMetrics(results) {
  const metrics = {};

  // Parse uname (OS info)
  if (results[0] && !results[0].error) {
    metrics.os = results[0];
  }

  // Parse uptime and load average
  if (results[1] && !results[1].error) {
    const uptimeMatch = results[1].match(/up\s+(.+?),\s+\d+\s+user/);
    const loadMatch = results[1].match(/load average:\s+([\d.]+),\s+([\d.]+),\s+([\d.]+)/);

    if (uptimeMatch) {
      metrics.uptime = uptimeMatch[1];
    }
    if (loadMatch) {
      metrics.load = {
        '1min': parseFloat(loadMatch[1]),
        '5min': parseFloat(loadMatch[2]),
        '15min': parseFloat(loadMatch[3])
      };
    }
  }

  // Parse memory (free -m)
  if (results[2] && !results[2].error) {
    const lines = results[2].split('\n');
    const memLine = lines.find(line => line.startsWith('Mem:'));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      metrics.memory = {
        total: parseInt(parts[1]),
        used: parseInt(parts[2]),
        free: parseInt(parts[3]),
        percentage: Math.round((parseInt(parts[2]) / parseInt(parts[1])) * 100)
      };
    }
  }

  // Parse disk usage (df -h /)
  if (results[3] && !results[3].error) {
    const lines = results[3].split('\n');
    const diskLine = lines[1];
    if (diskLine) {
      const parts = diskLine.split(/\s+/);
      metrics.disk = {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        percentage: parseInt(parts[4])
      };
    }
  }

  // Parse CPU cores
  if (results[4] && !results[4].error) {
    metrics.cpu = {
      cores: parseInt(results[4])
    };
  }

  // Parse CPU model
  if (results[5] && !results[5].error) {
    const modelMatch = results[5].match(/model name\s*:\s*(.+)/);
    if (modelMatch && metrics.cpu) {
      metrics.cpu.model = modelMatch[1].trim();
    }
  }

  // Parse total RAM
  if (results[6] && !results[6].error) {
    const ramMatch = results[6].match(/MemTotal:\s+(\d+)/);
    if (ramMatch) {
      metrics.totalRam = Math.round(parseInt(ramMatch[1]) / 1024) + ' MB';
    }
  }

  // Parse hostname
  if (results[7] && !results[7].error) {
    metrics.hostname = results[7];
  }

  // Parse CPU usage percentage from /proc/stat
  if (results[8] && !results[8].error) {
    const cpuUsage = parseCpuUsage(results[8]);
    if (cpuUsage !== null) {
      if (metrics.cpu) {
        metrics.cpu.usage = cpuUsage;
      } else {
        metrics.cpu = { usage: cpuUsage };
      }
    }
  }

  // Parse detailed OS info from /etc/os-release
  if (results[9] && !results[9].error && results[9].trim()) {
    const osRelease = results[9];
    // Try to get PRETTY_NAME first (e.g., "Ubuntu 24.04.1 LTS")
    const prettyNameMatch = osRelease.match(/PRETTY_NAME="?([^"\n]+)"?/);
    if (prettyNameMatch) {
      metrics.os = prettyNameMatch[1];
    } else {
      // Fallback to NAME + VERSION
      const nameMatch = osRelease.match(/^NAME="?([^"\n]+)"?/m);
      const versionMatch = osRelease.match(/^VERSION="?([^"\n]+)"?/m);
      if (nameMatch && versionMatch) {
        metrics.os = `${nameMatch[1]} ${versionMatch[1]}`;
      } else if (nameMatch) {
        metrics.os = nameMatch[1];
      }
      // If no match, keep the uname output from results[0]
    }
  }

  return metrics;
}

/**
 * Parse CPU usage from /proc/stat output (two readings)
 * @param {string} output - Two /proc/stat readings separated by newline
 * @returns {number|null} - CPU usage percentage
 */
function parseCpuUsage(output) {
  const lines = output.trim().split('\n');

  if (lines.length < 2) {
    return null;
  }

  const parts1 = lines[0].trim().split(/\s+/);
  const parts2 = lines[1].trim().split(/\s+/);

  if (parts1.length < 5 || parts1[0] !== 'cpu' || parts2.length < 5 || parts2[0] !== 'cpu') {
    return null;
  }

  // First reading
  const user1 = parseInt(parts1[1]) || 0;
  const nice1 = parseInt(parts1[2]) || 0;
  const system1 = parseInt(parts1[3]) || 0;
  const idle1 = parseInt(parts1[4]) || 0;
  const iowait1 = parseInt(parts1[5]) || 0;
  const irq1 = parseInt(parts1[6]) || 0;
  const softirq1 = parseInt(parts1[7]) || 0;

  // Second reading
  const user2 = parseInt(parts2[1]) || 0;
  const nice2 = parseInt(parts2[2]) || 0;
  const system2 = parseInt(parts2[3]) || 0;
  const idle2 = parseInt(parts2[4]) || 0;
  const iowait2 = parseInt(parts2[5]) || 0;
  const irq2 = parseInt(parts2[6]) || 0;
  const softirq2 = parseInt(parts2[7]) || 0;

  // Calculate differences
  const userDiff = user2 - user1;
  const niceDiff = nice2 - nice1;
  const systemDiff = system2 - system1;
  const idleDiff = idle2 - idle1;
  const iowaitDiff = iowait2 - iowait1;
  const irqDiff = irq2 - irq1;
  const softirqDiff = softirq2 - softirq1;

  const totalIdleDiff = idleDiff + iowaitDiff;
  const totalActiveDiff = userDiff + niceDiff + systemDiff + irqDiff + softirqDiff;
  const totalDiff = totalIdleDiff + totalActiveDiff;

  // Calculate percentage
  const usage = totalDiff > 0 ? (totalActiveDiff / totalDiff) * 100 : 0;

  return Math.round(usage * 10) / 10; // Round to 1 decimal
}

/**
 * Parse OS release information
 * @param {string} output - Contents of /etc/os-release
 * @returns {Object}
 */
function parseOsRelease(output) {
  const osInfo = {};
  const lines = output.split('\n');

  lines.forEach(line => {
    const match = line.match(/^([A-Z_]+)=["']?([^"'\n]+)["']?$/);
    if (match) {
      osInfo[match[1]] = match[2];
    }
  });

  return {
    name: osInfo.NAME || osInfo.PRETTY_NAME || 'Unknown',
    version: osInfo.VERSION || osInfo.VERSION_ID || 'Unknown',
    id: osInfo.ID || 'unknown',
    prettyName: osInfo.PRETTY_NAME || 'Unknown OS',
    raw: output
  };
}

module.exports = {
  parseMetrics,
  parseCpuUsage,
  parseOsRelease
};
