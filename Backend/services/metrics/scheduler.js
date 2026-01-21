const { ServerModel, MetricsModel } = require('../../models');
const { collectMetrics } = require('./collector');
const { METRICS_CONFIG } = require('../../config');

let collectionInterval = null;

/**
 * Start background metrics collection
 */
function startMetricsCollection() {
  console.log('Starting background metrics collection...');

  // Collect metrics immediately on startup
  collectAllServerMetrics();

  // Then collect at configured interval
  collectionInterval = setInterval(() => {
    collectAllServerMetrics();
  }, METRICS_CONFIG.collectionInterval);
}

/**
 * Stop background metrics collection
 */
function stopMetricsCollection() {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
    console.log('Stopped background metrics collection');
  }
}

/**
 * Collect metrics from all online servers
 */
async function collectAllServerMetrics() {
  try {
    // Get all online servers
    const servers = await ServerModel.findByStatus('online');

    if (!servers || servers.length === 0) {
      return;
    }

    // Collect metrics for all servers in parallel
    const promises = servers.map(async (server) => {
      try {
        const metrics = await collectMetrics({
          host: server.ip,
          username: server.username,
          privateKeyPath: server.privateKeyPath,
          osType: server.osType || 'ubuntu-debian'
        });

        // Store metrics in database
        await MetricsModel.store(server.id, metrics);
      } catch (error) {
        // Silently handle metrics collection errors
        // Server might have gone offline
        console.warn(`Failed to collect metrics for server ${server.name || server.ip}:`, error.message);
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error in metrics collection:', error.message);
  }
}

/**
 * Check if metrics collection is running
 * @returns {boolean}
 */
function isRunning() {
  return collectionInterval !== null;
}

/**
 * Clean up old metrics (run periodically)
 * @param {number} daysOld - Delete metrics older than this many days
 */
async function cleanupOldMetrics(daysOld = 7) {
  try {
    const deleted = await MetricsModel.deleteOlderThan(daysOld);
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} old metric records`);
    }
  } catch (error) {
    console.error('Error cleaning up old metrics:', error.message);
  }
}

module.exports = {
  startMetricsCollection,
  stopMetricsCollection,
  collectAllServerMetrics,
  isRunning,
  cleanupOldMetrics
};
