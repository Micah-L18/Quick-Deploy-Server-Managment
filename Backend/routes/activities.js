const express = require('express');
const router = express.Router();
const { ActivityModel } = require('../models');
const { requireAuth, asyncHandler } = require('../middleware');

/**
 * GET /api/activities
 * Get recent activities for user
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const activities = await ActivityModel.findRecent(req.session.userId, limit);
  res.json(activities);
}));

/**
 * POST /api/activities
 * Add new activity
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { type, message } = req.body;

  if (!type || !message) {
    return res.status(400).json({ error: 'Type and message are required' });
  }

  const activity = await ActivityModel.create(req.session.userId, type, message);
  res.json(activity);
}));

module.exports = router;
