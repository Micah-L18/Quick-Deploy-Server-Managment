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
      cpu_temperature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    metrics.cpu?.temperature ?? null
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
 * Get metrics history for a server
 * @param {string} serverId - Server ID
 * @param {number} hours - Number of hours to look back
 * @returns {Promise<Array>}
 */
async function getHistory(serverId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  return all(`
    SELECT * FROM server_metrics 
    WHERE server_id = ? AND timestamp > ?
    ORDER BY timestamp ASC
  `, [serverId, since]);
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

  return result;
}

module.exports = {
  store,
  getLatest,
  getHistory,
  deleteOlderThan,
  deleteForServer,
  toApiFormat
};
