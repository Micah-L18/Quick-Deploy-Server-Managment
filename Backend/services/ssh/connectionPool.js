const { Client } = require('ssh2');
const fs = require('fs');
const { SSH_POOL_CONFIG } = require('../../config');

/**
 * SSH Connection Pool
 * Manages reusable SSH connections with idle timeout
 */
class SSHConnectionPool {
  constructor() {
    // Map of serverId -> { connection, lastUsed, shell, refCount, channelCount }
    this.connections = new Map();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Check every minute
  }

  /**
   * Get connection key for a server
   */
  _getKey(host, username) {
    return `${username}@${host}`;
  }

  /**
   * Get or create a connection to a server
   * @param {Object} serverConfig - Server configuration
   * @returns {Promise<Client>}
   */
  async getConnection(serverConfig) {
    const { host, username, privateKeyPath } = serverConfig;
    const key = this._getKey(host, username);
    
    const existing = this.connections.get(key);
    
    // Check if existing connection is valid and not overloaded
    if (existing && existing.connection && existing.connection._sock && !existing.connection._sock.destroyed) {
      // If channel count is getting high (close to SSH's typical limit of 10), close and reconnect
      if (existing.channelCount >= 8) {
        console.log(`Connection to ${key} has ${existing.channelCount} channels, forcing reconnection...`);
        existing.connection.end();
        this.connections.delete(key);
      } else {
        existing.lastUsed = Date.now();
        existing.refCount++;
        existing.channelCount++;
        return existing.connection;
      }
    }

    // Create new connection
    const connection = await this._createConnection(serverConfig);
    
    this.connections.set(key, {
      connection,
      lastUsed: Date.now(),
      refCount: 1,
      channelCount: 1,
      host,
      username,
      privateKeyPath
    });

    return connection;
  }

  /**
   * Create a new SSH connection
   * @private
   */
  _createConnection(serverConfig) {
    return new Promise((resolve, reject) => {
      const { host, username, privateKeyPath, port = 22 } = serverConfig;
      
      const conn = new Client();
      
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Connection timeout'));
      }, SSH_POOL_CONFIG.connectionTimeout);

      conn.on('ready', () => {
        clearTimeout(timeout);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        const key = this._getKey(host, username);
        this.connections.delete(key);
        reject(err);
      });

      conn.on('close', () => {
        const key = this._getKey(host, username);
        this.connections.delete(key);
      });

      try {
        conn.connect({
          host,
          port,
          username,
          privateKey: fs.readFileSync(privateKeyPath),
          readyTimeout: SSH_POOL_CONFIG.connectionTimeout
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Release a connection (decrement ref count)
   * @param {string} host - Server host
   * @param {string} username - SSH username
   */
  releaseConnection(host, username) {
    const key = this._getKey(host, username);
    const entry = this.connections.get(key);
    
    if (entry) {
      entry.refCount = Math.max(0, entry.refCount - 1);
      entry.channelCount = Math.max(0, entry.channelCount - 1);
      entry.lastUsed = Date.now();
    }
  }

  /**
   * Force close a connection
   * @param {string} host - Server host
   * @param {string} username - SSH username
   */
  closeConnection(host, username) {
    const key = this._getKey(host, username);
    const entry = this.connections.get(key);
    
    if (entry && entry.connection) {
      entry.connection.end();
      this.connections.delete(key);
    }
  }

  /**
   * Clean up idle connections
   * @private
   */
  cleanup() {
    const now = Date.now();
    
    for (const [key, entry] of this.connections.entries()) {
      // Close connections idle for longer than timeout and with no references
      if (entry.refCount === 0 && (now - entry.lastUsed) > SSH_POOL_CONFIG.idleTimeout) {
        console.log(`Closing idle SSH connection: ${key}`);
        if (entry.connection) {
          entry.connection.end();
        }
        this.connections.delete(key);
      }
    }
  }

  /**
   * Get pool statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      connections: []
    };

    for (const [key, entry] of this.connections.entries()) {
      stats.connections.push({
        key,
        refCount: entry.refCount,
        channelCount: entry.channelCount,
        idleTime: Date.now() - entry.lastUsed,
        active: entry.connection && entry.connection._sock && !entry.connection._sock.destroyed
      });
    }

    return stats;
  }

  /**
   * Close all connections (for shutdown)
   */
  closeAll() {
    clearInterval(this.cleanupInterval);
    
    for (const [key, entry] of this.connections.entries()) {
      if (entry.connection) {
        entry.connection.end();
      }
    }
    
    this.connections.clear();
  }
}

// Singleton instance
const pool = new SSHConnectionPool();

module.exports = pool;
