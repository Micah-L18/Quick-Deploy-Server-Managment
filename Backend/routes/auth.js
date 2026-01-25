const express = require('express');
const router = express.Router();
const { UserModel } = require('../models');
const { asyncHandler } = require('../middleware');

/**
 * GET /api/auth/has-users
 * Check if any users exist (for first-time setup redirect)
 */
router.get('/has-users', asyncHandler(async (req, res) => {
  const hasUsers = await UserModel.hasUsers();
  res.json({ hasUsers });
}));

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  // Check if user already exists
  const existingUser = await UserModel.findByEmail(email);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const user = await UserModel.createUser(email, password, name);
  req.session.userId = user.id;

  res.json({ user });
}));

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await UserModel.findByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await UserModel.verifyPassword(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  });
}));

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await UserModel.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
}));

module.exports = router;
