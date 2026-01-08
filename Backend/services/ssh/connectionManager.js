const { Client } = require('ssh2');
const fs = require('fs');
const connectionPool = require('./connectionPool');
const { SSH_POOL_CONFIG } = require('../../config');

/**
 * Test SSH connection to a server
 * @param {string} host - Server IP/hostname
 * @param {string} username - SSH username
 * @param {string} privateKeyPath - Path to private key
 * @returns {Promise<{status: string, error?: string}>}
 */
async function testConnection(host, username, privateKeyPath) {
  return new Promise((resolve) => {
    const conn = new Client();
    let connected = false;

    const timeout = setTimeout(() => {
      if (!connected) {
        conn.end();
        resolve({ status: 'offline', error: 'Connection timeout' });
      }
    }, SSH_POOL_CONFIG.connectionTimeout);

    conn.on('ready', () => {
      connected = true;
      clearTimeout(timeout);
      conn.end();
      resolve({ status: 'online' });
    });

    conn.on('error', (err) => {
      connected = true;
      clearTimeout(timeout);
      resolve({ status: 'offline', error: err.message });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username,
        privateKey: fs.readFileSync(privateKeyPath),
        readyTimeout: SSH_POOL_CONFIG.connectionTimeout
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({ status: 'offline', error: err.message });
    }
  });
}

/**
 * Execute a command on a server via SSH
 * Uses connection pool for efficiency
 * @param {Object} serverConfig - { host, username, privateKeyPath }
 * @param {string} command - Command to execute
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function executeCommand(serverConfig, command) {
  const { host, username, privateKeyPath } = serverConfig;
  
  return new Promise(async (resolve, reject) => {
    let conn;
    
    try {
      conn = await connectionPool.getConnection({ host, username, privateKeyPath });
      
      conn.exec(command, (err, stream) => {
        if (err) {
          connectionPool.releaseConnection(host, username);
          return reject(err);
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        stream.on('close', (code) => {
          connectionPool.releaseConnection(host, username);
          resolve({ stdout, stderr, code });
        });
      });
    } catch (err) {
      if (conn) connectionPool.releaseConnection(host, username);
      reject(err);
    }
  });
}

/**
 * Execute multiple commands sequentially
 * @param {Object} serverConfig - Server configuration
 * @param {Array<string>} commands - Commands to execute
 * @returns {Promise<Array<{stdout: string, stderr: string, code: number}>>}
 */
async function executeCommands(serverConfig, commands) {
  const results = [];
  
  for (const command of commands) {
    try {
      const result = await executeCommand(serverConfig, command);
      results.push(result);
    } catch (err) {
      results.push({ stdout: '', stderr: err.message, code: -1 });
    }
  }
  
  return results;
}

/**
 * Create an interactive shell session
 * @param {Object} serverConfig - Server configuration
 * @param {Object} options - Shell options
 * @returns {Promise<{conn: Client, stream: any}>}
 */
async function createShell(serverConfig, options = { term: 'xterm-color' }) {
  const { host, username, privateKeyPath } = serverConfig;
  
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.shell(options, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        resolve({ conn, stream });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    try {
      conn.connect({
        host,
        port: 22,
        username,
        privateKey: fs.readFileSync(privateKeyPath),
        readyTimeout: SSH_POOL_CONFIG.connectionTimeout
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  testConnection,
  executeCommand,
  executeCommands,
  createShell,
  pool: connectionPool
};
