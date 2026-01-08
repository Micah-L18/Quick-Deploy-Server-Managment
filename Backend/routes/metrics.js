const express = require('express');
const router = express.Router();
const { MetricsModel } = require('../models');
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { collectMetrics } = require('../services/metrics/collector');
const { METRICS_CONFIG } = require('../config');

/**
 * GET /api/servers/:id/metrics
 * Get latest metrics for a server
 */
router.get('/:id/metrics', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;

  if (server.status !== 'online') {
    return res.status(400).json({ error: 'Server is not online' });
  }

  // Get latest metrics from database
  const latestMetric = await MetricsModel.getLatest(req.params.id);

  // If no metrics exist or they're stale, fetch fresh ones
  if (!latestMetric || (Date.now() - new Date(latestMetric.timestamp).getTime()) > METRICS_CONFIG.cacheTimeout) {
    try {
      const metrics = await collectMetrics({
        host: server.ip,
        username: server.username,
        privateKeyPath: server.privateKeyPath
      });
      
      // Store the new metrics
      await MetricsModel.store(server.id, metrics);
      
      return res.json(metrics);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Return cached metrics in API format
  const metrics = MetricsModel.toApiFormat(latestMetric);
  res.json(metrics);
}));

/**
 * GET /api/servers/:id/metrics/history
 * Get metrics history for a server
 */
router.get('/:id/metrics/history', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const hours = parseInt(req.query.hours) || 24;
  const history = await MetricsModel.getHistory(req.params.id, hours);
  
  res.json(history);
}));

/**
 * POST /api/servers/:id/metrics/refresh
 * Force refresh metrics for a server
 */
router.post('/:id/metrics/refresh', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;

  if (server.status !== 'online') {
    return res.status(400).json({ error: 'Server is not online' });
  }

  const metrics = await collectMetrics({
    host: server.ip,
    username: server.username,
    privateKeyPath: server.privateKeyPath
  });

  // Store the new metrics
  await MetricsModel.store(server.id, metrics);

  res.json(metrics);
}));

module.exports = router;
