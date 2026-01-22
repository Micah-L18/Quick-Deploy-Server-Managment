const path = require('path');
const envPath = path.resolve(__dirname, '../../url.env');
require('dotenv').config({ path: envPath });

const crypto = require('crypto');

// Log loaded config (helpful for debugging)
console.log(`[Config] Loaded .env from: ${envPath}`);
console.log(`[Config] FRONTEND_URL: ${process.env.FRONTEND_URL || '(not set, using default)'}`);
console.log(`[Config] BACKEND_URL: ${process.env.BACKEND_URL || '(not set, using default)'}`);

// Server configuration
const PORT = process.env.PORT || 3044;

// Database configuration
const DB_FILE = path.join(__dirname, '..', 'servers.db');

// SSH keys directory
const SSH_KEYS_DIR = path.join(__dirname, '..', 'ssh_keys');

// Default SSH username for new servers (non-root with passwordless sudo)
const DEFAULT_SSH_USERNAME = process.env.DEFAULT_SSH_USERNAME || 'nobase';

// CORS configuration
// Uses FRONTEND_URL from .env, defaults to localhost:3000
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3044';
const CORS_ORIGINS = [FRONTEND_URL, BACKEND_URL];

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

// Backup and snapshot configuration
const BACKUP_CONFIG = {
  storagePath: path.join(__dirname, '..', 'backups'),
  tempPath: path.join(__dirname, '..', 'tmp', 'backups'),
  maxStorageGB: parseInt(process.env.BACKUP_MAX_STORAGE_GB) || 50, // Default 50GB
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
  compressionLevel: 6 // gzip level 1-9
};

module.exports = {
  PORT,
  DB_FILE,
  SSH_KEYS_DIR,
  DEFAULT_SSH_USERNAME,
  CORS_ORIGINS,
  SESSION_CONFIG,
  SSH_POOL_CONFIG,
  METRICS_CONFIG,
  BACKUP_CONFIG
};
