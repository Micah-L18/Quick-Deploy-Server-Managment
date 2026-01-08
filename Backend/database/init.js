const fs = require('fs').promises;
const { run } = require('./connection');
const { SSH_KEYS_DIR } = require('../config');

/**
 * Initialize database schema
 * Creates all tables and runs migrations
 */
async function initDatabase() {
  // Create users table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Create servers table
  await run(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      region TEXT,
      ip TEXT NOT NULL,
      username TEXT NOT NULL,
      private_key_path TEXT NOT NULL,
      public_key TEXT NOT NULL,
      setup_command TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      error TEXT,
      added_at TEXT NOT NULL,
      last_checked TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create activities table
  await run(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create apps table
  await run(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create server_metrics table
  await run(`
    CREATE TABLE IF NOT EXISTS server_metrics (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      cpu_usage REAL,
      cpu_load_1min REAL,
      cpu_load_5min REAL,
      cpu_load_15min REAL,
      memory_used INTEGER,
      memory_total INTEGER,
      memory_percentage INTEGER,
      disk_percentage INTEGER,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // Create app_deployments table
  await run(`
    CREATE TABLE IF NOT EXISTS app_deployments (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      container_id TEXT,
      container_name TEXT,
      status TEXT NOT NULL,
      deployed_at TEXT NOT NULL,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // Run migrations for additional columns
  await runMigrations();

  // Ensure SSH keys directory exists
  try {
    await fs.access(SSH_KEYS_DIR);
  } catch {
    await fs.mkdir(SSH_KEYS_DIR, { recursive: true });
  }

  console.log('Database initialized successfully');
}

/**
 * Run database migrations
 * Adds new columns to existing tables
 */
async function runMigrations() {
  // Server metrics additional columns
  const metricsColumns = [
    { name: 'cpu_cores', type: 'INTEGER' },
    { name: 'cpu_model', type: 'TEXT' },
    { name: 'memory_free', type: 'INTEGER' },
    { name: 'disk_total', type: 'TEXT' },
    { name: 'disk_used', type: 'TEXT' },
    { name: 'disk_available', type: 'TEXT' },
    { name: 'os', type: 'TEXT' },
    { name: 'hostname', type: 'TEXT' },
    { name: 'uptime', type: 'TEXT' }
  ];

  for (const column of metricsColumns) {
    try {
      await run(`ALTER TABLE server_metrics ADD COLUMN ${column.name} ${column.type}`);
      console.log(`Added column ${column.name} to server_metrics`);
    } catch (err) {
      // Ignore duplicate column errors
      if (!err.message.includes('duplicate column')) {
        console.error(`Error adding column ${column.name}:`, err.message);
      }
    }
  }

  // Server table migrations
  const serverColumns = [
    { name: 'name', type: 'TEXT' },
    { name: 'region', type: 'TEXT' },
    { name: 'user_id', type: 'TEXT' }
  ];

  for (const column of serverColumns) {
    try {
      await run(`ALTER TABLE servers ADD COLUMN ${column.name} ${column.type}`);
      console.log(`Added column ${column.name} to servers`);
    } catch (err) {
      // Ignore duplicate column errors
    }
  }

  // App deployments table migrations
  const deploymentColumns = [
    { name: 'port_mappings', type: 'TEXT' }  // JSON string of port mappings
  ];

  for (const column of deploymentColumns) {
    try {
      await run(`ALTER TABLE app_deployments ADD COLUMN ${column.name} ${column.type}`);
      console.log(`Added column ${column.name} to app_deployments`);
    } catch (err) {
      // Ignore duplicate column errors
    }
  }

  // Apps table migrations for Docker configuration
  const appsColumns = [
    { name: 'image', type: 'TEXT' },
    { name: 'tag', type: 'TEXT DEFAULT \'latest\'' },
    { name: 'ports', type: 'TEXT' },           // JSON array of port mappings
    { name: 'env_vars', type: 'TEXT' },        // JSON array of env vars
    { name: 'volumes', type: 'TEXT' },         // JSON array of volumes
    { name: 'restart_policy', type: 'TEXT' },
    { name: 'network_mode', type: 'TEXT' },
    { name: 'command', type: 'TEXT' },
    { name: 'custom_args', type: 'TEXT' },     // Custom docker run arguments
    { name: 'registry_url', type: 'TEXT' },
    { name: 'registry_username', type: 'TEXT' },
    { name: 'registry_password', type: 'TEXT' }
  ];

  for (const column of appsColumns) {
    try {
      await run(`ALTER TABLE apps ADD COLUMN ${column.name} ${column.type}`);
      console.log(`Added column ${column.name} to apps`);
    } catch (err) {
      // Ignore duplicate column errors
    }
  }
}

module.exports = {
  initDatabase,
  runMigrations
};
