const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../database/connection');

/**
 * Store server metrics
 * @param {string} serverId - Server ID
 * @param {Object} metrics - Metrics data
 * @returns {Promise<void>}
 */
async function store(serverId, metrics) {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  // Prepare GPU data - serialize multi-GPU details to JSON if present
  const gpuData = metrics.gpu?.gpus ? JSON.stringify(metrics.gpu.gpus) : null;

  await run(`
    INSERT INTO server_metrics (
      id, server_id, cpu_usage, cpu_cores, cpu_model, cpu_load_1min, cpu_load_5min, cpu_load_15min,
      memory_used, memory_total, memory_free, memory_percentage, 
      disk_total, disk_used, disk_available, disk_percentage,
      os, hostname, uptime, timestamp,
      gpu_vendor, gpu_count, gpu_name, gpu_memory_total, gpu_memory_used, gpu_memory_free,
      gpu_memory_percentage, gpu_utilization, gpu_temperature, gpu_data,
      cpu_temperature,
      network_interface, network_rx_rate, network_tx_rate, network_rx_total, network_tx_total,
      ping_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    serverId,
    metrics.cpu?.usage || null,
    metrics.cpu?.cores || null,
    metrics.cpu?.model || null,
    metrics.load?.['1min'] || null,
    metrics.load?.['5min'] || null,
    metrics.load?.['15min'] || null,
    metrics.memory?.used || null,
    metrics.memory?.total || null,
    metrics.memory?.free || null,
    metrics.memory?.percentage || null,
    metrics.disk?.total || null,
    metrics.disk?.used || null,
    metrics.disk?.available || null,
    metrics.disk?.percentage || null,
    metrics.os || null,
    metrics.hostname || null,
    metrics.uptime || null,
    timestamp,
    // GPU fields - use ?? instead of || to preserve 0 values
    metrics.gpu?.vendor ?? null,
    metrics.gpu?.count ?? null,
    metrics.gpu?.name ?? null,
    metrics.gpu?.memory_total ?? null,
    metrics.gpu?.memory_used ?? null,
    metrics.gpu?.memory_free ?? null,
    metrics.gpu?.memory_percentage ?? null,
    metrics.gpu?.utilization ?? null,
    metrics.gpu?.temperature ?? null,
    gpuData,
    // CPU temperature - use ?? to preserve 0 values
    metrics.cpu?.temperature ?? null,
    // Network metrics
    metrics.network?.interface ?? null,
    metrics.network?.rx_rate ?? null,
    metrics.network?.tx_rate ?? null,
    metrics.network?.rx_total ?? null,
    metrics.network?.tx_total ?? null,
    // Ping latency
    metrics.ping ?? null
  ]);
}

/**
 * Get latest metrics for a server
 * @param {string} serverId - Server ID
 * @returns {Promise<Object|null>}
 */
async function getLatest(serverId) {
  return get(`
    SELECT * FROM server_metrics 
    WHERE server_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 1
  `, [serverId]);
}

/**
 * Get metrics history for a server with intelligent downsampling
 * @param {string} serverId - Server ID
 * @param {number} hours - Number of hours to look back
 * @returns {Promise<Array>}
 */
async function getHistory(serverId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  // Determine aggregation interval based on time range
  // Goal: ~100-200 data points max for good chart performance
  let intervalMinutes;
  if (hours <= 1) {
    // 1 hour: no aggregation, return all points (~120 max)
    intervalMinutes = 0;
  } else if (hours <= 6) {
    // 6 hours: 5-minute intervals (~72 points)
    intervalMinutes = 5;
  } else if (hours <= 12) {
    // 12 hours: 10-minute intervals (~72 points)
    intervalMinutes = 10;
  } else if (hours <= 24) {
    // 24 hours: 15-minute intervals (~96 points)
    intervalMinutes = 15;
  } else if (hours <= 72) {
    // 3 days: 30-minute intervals (~144 points)
    intervalMinutes = 30;
  } else {
    // 7+ days: 1-hour intervals (~168 points for 7 days)
    intervalMinutes = 60;
  }

  // If no aggregation needed, return raw data
  if (intervalMinutes === 0) {
    return all(`
      SELECT * FROM server_metrics 
      WHERE server_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `, [serverId, since]);
  }

  // Use SQLite's strftime to group by time intervals
  // Group timestamp into intervals by dividing minutes
  const intervalSeconds = intervalMinutes * 60;
  
  const aggregated = await all(`
    SELECT 
      datetime(
        (strftime('%s', timestamp) / ?) * ?, 
        'unixepoch'
      ) as timestamp,
      AVG(cpu_usage) as cpu_usage,
      AVG(cpu_cores) as cpu_cores,
      MAX(cpu_model) as cpu_model,
      AVG(cpu_load_1min) as cpu_load_1min,
      AVG(cpu_load_5min) as cpu_load_5min,
      AVG(cpu_load_15min) as cpu_load_15min,
      AVG(memory_used) as memory_used,
      AVG(memory_total) as memory_total,
      AVG(memory_free) as memory_free,
      AVG(memory_percentage) as memory_percentage,
      AVG(disk_total) as disk_total,
      AVG(disk_used) as disk_used,
      AVG(disk_available) as disk_available,
      AVG(disk_percentage) as disk_percentage,
      MAX(os) as os,
      MAX(hostname) as hostname,
      AVG(uptime) as uptime,
      MAX(gpu_vendor) as gpu_vendor,
      AVG(gpu_count) as gpu_count,
      MAX(gpu_name) as gpu_name,
      AVG(gpu_memory_total) as gpu_memory_total,
      AVG(gpu_memory_used) as gpu_memory_used,
      AVG(gpu_memory_free) as gpu_memory_free,
      AVG(gpu_memory_percentage) as gpu_memory_percentage,
      AVG(gpu_utilization) as gpu_utilization,
      AVG(gpu_temperature) as gpu_temperature,
      AVG(cpu_temperature) as cpu_temperature,
      MAX(network_interface) as network_interface,
      AVG(network_rx_rate) as network_rx_rate,
      AVG(network_tx_rate) as network_tx_rate,
      AVG(network_rx_total) as network_rx_total,
      AVG(network_tx_total) as network_tx_total,
      AVG(ping_ms) as ping_ms,
      COUNT(*) as sample_count
    FROM server_metrics 
    WHERE server_id = ? AND timestamp > ?
    GROUP BY (strftime('%s', timestamp) / ?)
    ORDER BY timestamp ASC
  `, [intervalSeconds, intervalSeconds, serverId, since, intervalSeconds]);

  return aggregated;
}

/**
 * Delete old metrics (cleanup)
 * @param {number} daysOld - Delete metrics older than this many days
 * @returns {Promise<number>} - Number of deleted rows
 */
async function deleteOlderThan(daysOld) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  const result = await run('DELETE FROM server_metrics WHERE timestamp < ?', [cutoff]);
  return result.changes;
}

/**
 * Delete all metrics for a server
 * @param {string} serverId - Server ID
 * @returns {Promise<number>}
 */
async function deleteForServer(serverId) {
  const result = await run('DELETE FROM server_metrics WHERE server_id = ?', [serverId]);
  return result.changes;
}

/**
 * Convert database row to frontend format
 * @param {Object} row - Database row
 * @returns {Object}
 */
function toApiFormat(row) {
  if (!row) return null;
  
  const result = {
    cpu: {
      usage: row.cpu_usage,
      cores: row.cpu_cores,
      model: row.cpu_model,
      temperature: row.cpu_temperature
    },
    memory: {
      used: row.memory_used,
      total: row.memory_total,
      free: row.memory_free,
      percentage: row.memory_percentage
    },
    disk: {
      total: row.disk_total,
      used: row.disk_used,
      available: row.disk_available,
      percentage: row.disk_percentage
    },
    load: {
      '1min': row.cpu_load_1min,
      '5min': row.cpu_load_5min,
      '15min': row.cpu_load_15min
    },
    os: row.os,
    hostname: row.hostname,
    uptime: row.uptime
  };

  // Include GPU data if present
  if (row.gpu_vendor || row.gpu_name) {
    result.gpu = {
      vendor: row.gpu_vendor,
      count: row.gpu_count,
      name: row.gpu_name,
      memory_total: row.gpu_memory_total,
      memory_used: row.gpu_memory_used,
      memory_free: row.gpu_memory_free,
      memory_percentage: row.gpu_memory_percentage,
      utilization: row.gpu_utilization,
      temperature: row.gpu_temperature
    };

    // Parse multi-GPU details if present
    if (row.gpu_data) {
      try {
        result.gpu.gpus = JSON.parse(row.gpu_data);
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  // Include network data if present
  if (row.network_interface || row.network_rx_rate != null) {
    result.network = {
      interface: row.network_interface,
      rx_rate: row.network_rx_rate,
      tx_rate: row.network_tx_rate,
      rx_total: row.network_rx_total,
      tx_total: row.network_tx_total
    };
  }

  // Include ping if present
  if (row.ping_ms != null) {
    result.ping = row.ping_ms;
  }

  return result;
}

/**
 * Get metric averages for various time periods
 * @param {string} serverId - Server ID
 * @returns {Promise<Object>} - Averages for 6h, 12h, 24h, 7d periods
 */
async function getAverages(serverId) {
  const now = Date.now();
  const periods = {
    '6h': new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    '12h': new Date(now - 12 * 60 * 60 * 1000).toISOString(),
    '24h': new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    '7d': new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  };

  const results = {};

  for (const [period, since] of Object.entries(periods)) {
    const row = await get(`
      SELECT 
        AVG(cpu_usage) as cpu_usage,
        AVG(cpu_temperature) as cpu_temperature,
        AVG(memory_percentage) as memory_percentage,
        AVG(disk_percentage) as disk_percentage,
        AVG(gpu_utilization) as gpu_utilization,
        AVG(gpu_memory_percentage) as gpu_memory_percentage,
        AVG(gpu_temperature) as gpu_temperature,
        AVG(network_rx_rate) as network_rx_rate,
        AVG(network_tx_rate) as network_tx_rate,
        AVG(ping_ms) as ping_ms,
        COUNT(*) as data_points
      FROM server_metrics 
      WHERE server_id = ? AND timestamp > ?
    `, [serverId, since]);

    results[period] = {
      cpu_usage: row?.cpu_usage != null ? Math.round(row.cpu_usage * 10) / 10 : null,
      cpu_temperature: row?.cpu_temperature != null ? Math.round(row.cpu_temperature * 10) / 10 : null,
      memory_percentage: row?.memory_percentage != null ? Math.round(row.memory_percentage * 10) / 10 : null,
      disk_percentage: row?.disk_percentage != null ? Math.round(row.disk_percentage * 10) / 10 : null,
      gpu_utilization: row?.gpu_utilization != null ? Math.round(row.gpu_utilization * 10) / 10 : null,
      gpu_memory_percentage: row?.gpu_memory_percentage != null ? Math.round(row.gpu_memory_percentage * 10) / 10 : null,
      gpu_temperature: row?.gpu_temperature != null ? Math.round(row.gpu_temperature * 10) / 10 : null,
      network_rx_rate: row?.network_rx_rate != null ? Math.round(row.network_rx_rate) : null,
      network_tx_rate: row?.network_tx_rate != null ? Math.round(row.network_tx_rate) : null,
      ping_ms: row?.ping_ms != null ? Math.round(row.ping_ms * 10) / 10 : null,
      data_points: row?.data_points || 0
    };
  }

  return results;
}

module.exports = {
  store,
  getLatest,
  getHistory,
  getAverages,
  deleteOlderThan,
  deleteForServer,
  toApiFormat
};
