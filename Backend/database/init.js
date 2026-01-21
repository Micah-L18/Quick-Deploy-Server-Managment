const fs = require('fs').promises;
const { run, all } = require('./connection');
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
    { name: 'user_id', type: 'TEXT' },
    { name: 'display_name', type: 'TEXT' },
    { name: 'color', type: 'TEXT' },
    { name: 'icon', type: 'TEXT' },
    { name: 'tags', type: 'TEXT' },  // JSON array of tags
    { name: 'first_connected_at', type: 'TEXT' },  // Timestamp of first successful connection
    { name: 'os_type', type: 'TEXT DEFAULT \'ubuntu-debian\'' }  // Operating system type for setup commands
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
    { name: 'port_mappings', type: 'TEXT' },  // JSON string of port mappings
    // Deployment-specific config overrides (nullable - uses app defaults if null)
    { name: 'env_vars', type: 'TEXT' },  // JSON string of env vars
    { name: 'volumes', type: 'TEXT' },  // JSON string of volumes
    { name: 'restart_policy', type: 'TEXT' },
    { name: 'network_mode', type: 'TEXT' },
    { name: 'command', type: 'TEXT' },
    { name: 'custom_args', type: 'TEXT' }
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
    { name: 'registry_password', type: 'TEXT' },
    { name: 'web_ui_port', type: 'TEXT' }      // Host port that has web UI (null = no web UI)
  ];

  for (const column of appsColumns) {
    try {
      await run(`ALTER TABLE apps ADD COLUMN ${column.name} ${column.type}`);
      console.log(`Added column ${column.name} to apps`);
    } catch (err) {
      // Ignore duplicate column errors
    }
  }

  // Create unique index on (user_id, ip) to prevent duplicate servers
  // First, check if there are duplicates and handle them
  try {
    const duplicates = await all(`
      SELECT user_id, ip, COUNT(*) as count 
      FROM servers 
      GROUP BY user_id, ip 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate server IP(s). Keeping only the most recent for each.`);
      
      // For each duplicate, keep only the most recent one
      for (const dup of duplicates) {
        const servers = await all(
          'SELECT id, added_at FROM servers WHERE user_id = ? AND ip = ? ORDER BY added_at DESC',
          [dup.user_id, dup.ip]
        );
        
        // Delete all but the first (most recent)
        for (let i = 1; i < servers.length; i++) {
          await run('DELETE FROM servers WHERE id = ?', [servers[i].id]);
          console.log(`Removed duplicate server: ${dup.ip} (ID: ${servers[i].id})`);
        }
      }
    }
    
    // Now create the unique index
    await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_user_ip ON servers(user_id, ip)');
    console.log('Created unique index on servers(user_id, ip)');
  } catch (err) {
    // Ignore if index already exists
    if (!err.message.includes('already exists')) {
      console.error('Error creating unique index:', err.message);
    }
  }
}

module.exports = {
  initDatabase,
  runMigrations
};
