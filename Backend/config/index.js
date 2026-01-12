const path = require('path');
const crypto = require('crypto');

// Server configuration
const PORT = process.env.PORT || 3044;

// Database configuration
const DB_FILE = path.join(__dirname, '..', 'servers.db');

// SSH keys directory
const SSH_KEYS_DIR = path.join(__dirname, '..', 'ssh_keys');

// CORS configuration
// Can be set via environment variable as comma-separated list: CORS_ORIGINS=http://localhost:3000,http://example.com
const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:3044'];
const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : DEFAULT_CORS_ORIGINS;

// Session configuration
const SESSION_CONFIG = {
  secret: process.env.SESSION_SECRET || 'neobase-secret-key-' + crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
};

// SSH connection pooling configuration
const SSH_POOL_CONFIG = {
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  maxConnections: 10, // max connections per server
  connectionTimeout: 10000 // 10 seconds
};

// Metrics collection configuration
const METRICS_CONFIG = {
  collectionInterval: 30000, // 30 seconds
  cacheTimeout: 120000 // 2 minutes
};

module.exports = {
  PORT,
  DB_FILE,
  SSH_KEYS_DIR,
  CORS_ORIGINS,
  SESSION_CONFIG,
  SSH_POOL_CONFIG,
  METRICS_CONFIG
};
