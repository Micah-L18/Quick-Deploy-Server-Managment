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

  // Parse GPU metrics from nvidia-smi or rocm-smi output
  if (results[10] && !results[10].error && results[10].trim()) {
    const gpuData = parseGpuMetrics(results[10]);
    if (gpuData) {
      metrics.gpu = gpuData;
    }
  }

  // Parse CPU temperature
  if (results[11] && !results[11].error && results[11].trim()) {
    const cpuTemp = parseCpuTemperature(results[11]);
    if (cpuTemp !== null) {
      if (metrics.cpu) {
        metrics.cpu.temperature = cpuTemp;
      } else {
        metrics.cpu = { temperature: cpuTemp };
      }
    }
  }

  // Parse network bandwidth from /proc/net/dev (two readings)
  if (results[12] && !results[12].error && results[12].trim()) {
    const networkData = parseNetworkBandwidth(results[12]);
    if (networkData) {
      metrics.network = networkData;
    }
  }

  // Parse ping latency
  if (results[13] && !results[13].error && results[13].trim()) {
    const pingMs = parseFloat(results[13].trim());
    if (!isNaN(pingMs)) {
      metrics.ping = Math.round(pingMs * 10) / 10; // Round to 1 decimal
    }
  }

  return metrics;
}

/**
 * Parse CPU temperature from various sources
 * @param {string} output - Temperature reading (may be in millidegrees or degrees)
 * @returns {number|null} - Temperature in Celsius
 */
function parseCpuTemperature(output) {
  if (!output || !output.trim()) {
    return null;
  }

  const temp = output.trim();
  
  // If it's from /sys/class/thermal (millidegrees), convert to degrees
  const numValue = parseFloat(temp.replace(/[^0-9.-]/g, ''));
  
  if (isNaN(numValue)) {
    return null;
  }

  // /sys/class/thermal reports in millidegrees (e.g., 45000 = 45°C)
  if (numValue > 1000) {
    return Math.round(numValue / 1000);
  }
  
  // Already in degrees (from lm-sensors)
  return Math.round(numValue);
}

/**
 * Parse network bandwidth from /proc/net/dev output (two readings 1 second apart)
 * @param {string} output - Two readings of interface rx_bytes tx_bytes
 * @returns {Object|null} - Network stats with rx/tx rates in bytes/sec
 */
function parseNetworkBandwidth(output) {
  if (!output || !output.trim()) {
    return null;
  }

  const lines = output.trim().split('\n');
  if (lines.length < 2) {
    return null;
  }

  // Parse first and second readings
  // Format: "interface: rx_bytes tx_bytes" or "interface rx_bytes tx_bytes"
  const parseLine = (line) => {
    const parts = line.trim().replace(':', ' ').split(/\s+/);
    if (parts.length >= 3) {
      return {
        interface: parts[0],
        rx: parseInt(parts[1]) || 0,
        tx: parseInt(parts[2]) || 0
      };
    }
    return null;
  };

  const reading1 = parseLine(lines[0]);
  const reading2 = parseLine(lines[1]);

  if (!reading1 || !reading2) {
    return null;
  }

  // Calculate bytes per second (readings are 1 second apart)
  const rxRate = reading2.rx - reading1.rx;
  const txRate = reading2.tx - reading1.tx;

  return {
    interface: reading1.interface.replace(':', ''),
    rx_rate: Math.max(0, rxRate), // bytes/sec download
    tx_rate: Math.max(0, txRate), // bytes/sec upload
    rx_total: reading2.rx,
    tx_total: reading2.tx
  };
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

/**
 * Parse Windows metrics from PowerShell JSON output
 * @param {string} output - JSON string from PowerShell command
 * @returns {Object} - Parsed metrics in standard format
 */
function parseWindowsMetrics(output) {
  try {
    console.log('[Windows Parser] Raw output:', output);
    
    // Try to find JSON in the output (might have extra text before/after)
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Windows Parser] No JSON found in output');
      return { error: 'No JSON found in Windows metrics output', raw: output };
    }
    
    const jsonStr = jsonMatch[0];
    console.log('[Windows Parser] Extracted JSON:', jsonStr);
    
    const data = JSON.parse(jsonStr);
    console.log('[Windows Parser] Parsed data:', JSON.stringify(data, null, 2));
    
    const result = {
      os: data.os || 'Windows',
      hostname: data.hostname || 'Unknown',
      uptime: data.uptime || 'Unknown',
      cpu: {
        model: data.cpu?.model || 'Unknown',
        cores: data.cpu?.cores || 0,
        usage: data.cpu?.usage || 0,
        temperature: data.cpu?.temperature || null
      },
      memory: {
        total: data.memory?.total || 0,
        used: data.memory?.used || 0,
        free: data.memory?.free || 0,
        percentage: data.memory?.percentage || 0
      },
      disk: {
        total: data.disk?.total || '0G',
        used: data.disk?.used || '0G',
        available: data.disk?.available || '0G',
        percentage: data.disk?.percentage || 0
      },
      load: {
        '1min': data.cpu?.usage || 0,
        '5min': data.cpu?.usage || 0,
        '15min': data.cpu?.usage || 0
      }
    };

    // Parse GPU data if present
    if (data.gpu && data.gpu.gpus && data.gpu.gpus.length > 0) {
      const gpus = data.gpu.gpus;
      if (gpus.length === 1) {
        result.gpu = {
          vendor: data.gpu.vendor || 'nvidia',
          count: 1,
          name: gpus[0].name,
          memory_total: gpus[0].memory_total,
          memory_used: gpus[0].memory_used,
          memory_free: gpus[0].memory_free,
          memory_percentage: gpus[0].memory_total > 0 
            ? Math.round((gpus[0].memory_used / gpus[0].memory_total) * 100) 
            : 0,
          utilization: gpus[0].utilization,
          temperature: gpus[0].temperature
        };
      } else {
        // Multi-GPU
        const totalMemory = gpus.reduce((sum, g) => sum + (g.memory_total || 0), 0);
        const usedMemory = gpus.reduce((sum, g) => sum + (g.memory_used || 0), 0);
        const avgUtil = Math.round(gpus.reduce((sum, g) => sum + (g.utilization || 0), 0) / gpus.length);
        const temps = gpus.filter(g => g.temperature != null).map(g => g.temperature);
        const avgTemp = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null;

        result.gpu = {
          vendor: data.gpu.vendor || 'nvidia',
          count: gpus.length,
          name: gpus.map(g => g.name).join(', '),
          memory_total: totalMemory,
          memory_used: usedMemory,
          memory_free: totalMemory - usedMemory,
          memory_percentage: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0,
          utilization: avgUtil,
          temperature: avgTemp,
          gpus: gpus.map(g => ({
            ...g,
            memory_percentage: g.memory_total > 0 
              ? Math.round((g.memory_used / g.memory_total) * 100) 
              : 0
          }))
        };
      }
    }

    // Parse network data if present
    if (data.network) {
      result.network = {
        interface: data.network.interface || 'Unknown',
        rx_rate: data.network.rx_rate || 0,
        tx_rate: data.network.tx_rate || 0,
        rx_total: data.network.rx_total || 0,
        tx_total: data.network.tx_total || 0
      };
    }

    // Parse ping if present
    if (data.ping != null) {
      result.ping = data.ping;
    }

    return result;
  } catch (err) {
    console.error('Failed to parse Windows metrics:', err.message, 'Output:', output);
    return {
      error: 'Failed to parse Windows metrics',
      raw: output
    };
  }
}

/**
 * Parse GPU metrics from nvidia-smi or rocm-smi output
 * nvidia-smi format: gpu_name, memory.total, memory.used, memory.free, utilization.gpu, temperature.gpu
 * @param {string} output - Raw output from GPU query command
 * @returns {Object|null} - Parsed GPU data or null if no GPU detected
 */
function parseGpuMetrics(output) {
  if (!output || !output.trim()) {
    return null;
  }

  const lines = output.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return null;
  }

  // Detect NVIDIA format (CSV: name, memory.total, memory.used, memory.free, utilization.gpu, temperature.gpu)
  // Example: "NVIDIA GeForce RTX 4090, 24564, 1234, 23330, 45, 65"
  const gpus = [];
  let vendor = 'unknown';

  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    
    // NVIDIA nvidia-smi format has 6 comma-separated values
    if (parts.length >= 6) {
      vendor = 'nvidia';
      const name = parts[0];
      const memoryTotal = parseInt(parts[1]) || 0;  // MB
      const memoryUsed = parseInt(parts[2]) || 0;   // MB
      const memoryFree = parseInt(parts[3]) || 0;   // MB
      const utilization = parseInt(parts[4]) || 0;  // %
      const temperature = parseInt(parts[5]) || null;  // Celsius

      gpus.push({
        name,
        memory_total: memoryTotal,
        memory_used: memoryUsed,
        memory_free: memoryFree,
        utilization,
        temperature,
        memory_percentage: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0
      });
    }
  }

  // If no GPUs parsed (could be AMD rocm-smi or other format), try AMD parsing
  if (gpus.length === 0) {
    const amdGpu = parseAmdGpuMetrics(output);
    if (amdGpu) {
      return amdGpu;
    }
    return null;
  }

  // Return single GPU data or multi-GPU data
  if (gpus.length === 1) {
    return {
      vendor,
      count: 1,
      name: gpus[0].name,
      memory_total: gpus[0].memory_total,
      memory_used: gpus[0].memory_used,
      memory_free: gpus[0].memory_free,
      memory_percentage: gpus[0].memory_percentage,
      utilization: gpus[0].utilization,
      temperature: gpus[0].temperature
    };
  }

  // Multi-GPU: aggregate metrics
  const totalMemory = gpus.reduce((sum, g) => sum + g.memory_total, 0);
  const usedMemory = gpus.reduce((sum, g) => sum + g.memory_used, 0);
  const avgUtilization = Math.round(gpus.reduce((sum, g) => sum + g.utilization, 0) / gpus.length);
  const temps = gpus.filter(g => g.temperature !== null).map(g => g.temperature);
  const avgTemperature = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null;

  return {
    vendor,
    count: gpus.length,
    name: gpus.map(g => g.name).join(', '),
    memory_total: totalMemory,
    memory_used: usedMemory,
    memory_free: totalMemory - usedMemory,
    memory_percentage: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0,
    utilization: avgUtilization,
    temperature: avgTemperature,
    gpus  // Include individual GPU data for detailed view
  };
}

/**
 * Parse AMD GPU metrics from rocm-smi output
 * This is a fallback for AMD GPUs using rocm-smi
 * @param {string} output - Raw rocm-smi output
 * @returns {Object|null}
 */
function parseAmdGpuMetrics(output) {
  // rocm-smi output varies, try to extract basic info
  // Common format includes lines like:
  // GPU[0]: AMD Radeon RX 7900 XTX
  // GPU[0] use(%): 45
  // GPU[0] memory use(%): 23
  // GPU[0] temperature (c): 65
  
  const gpuNameMatch = output.match(/GPU\[\d+\]:\s*(.+)/);
  const useMatch = output.match(/use\s*\(%?\)\s*:\s*(\d+)/i);
  const memUseMatch = output.match(/memory\s*use\s*\(%?\)\s*:\s*(\d+)/i);
  const tempMatch = output.match(/temperature\s*\(?c?\)?\s*:\s*(\d+)/i);

  if (gpuNameMatch) {
    return {
      vendor: 'amd',
      count: 1,
      name: gpuNameMatch[1].trim(),
      utilization: useMatch ? parseInt(useMatch[1]) : null,
      memory_percentage: memUseMatch ? parseInt(memUseMatch[1]) : null,
      temperature: tempMatch ? parseInt(tempMatch[1]) : null,
      // AMD rocm-smi doesn't always provide absolute memory values
      memory_total: null,
      memory_used: null,
      memory_free: null
    };
  }

  return null;
}

module.exports = {
  parseMetrics,
  parseCpuUsage,
  parseCpuTemperature,
  parseNetworkBandwidth,
  parseOsRelease,
  parseWindowsMetrics,
  parseGpuMetrics,
  parseAmdGpuMetrics
};
