const { UserModel } = require('../models');

/**
 * Authentication middleware
 * Checks if user is logged in via session
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
}

/**
 * Optional auth middleware
 * Attaches user to request if logged in, but doesn't block
 */
async function optionalAuth(req, res, next) {
  if (req.session && req.session.userId) {
    try {
      req.user = await UserModel.findById(req.session.userId);
    } catch (err) {
      // Ignore errors, user just won't be attached
    }
  }
  next();
}

/**
 * Attach user to request middleware
 * Use after requireAuth to get full user object
 */
async function attachUser(req, res, next) {
  try {
    req.user = await UserModel.findById(req.session.userId);
    if (!req.user) {
      return res.status(404).json({ error: 'User not found' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
  attachUser
};
