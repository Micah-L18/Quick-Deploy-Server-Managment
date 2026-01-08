const { Client } = require('ssh2');
const fs = require('fs');
const connectionPool = require('./connectionPool');
const { SSH_POOL_CONFIG } = require('../../config');

/**
 * Get SFTP session from connection pool
 * @param {Object} serverConfig - Server configuration
 * @returns {Promise<{sftp: any, release: Function}>}
 */
async function getSftpSession(serverConfig) {
  const { host, username, privateKeyPath } = serverConfig;
  const conn = await connectionPool.getConnection({ host, username, privateKeyPath });

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        connectionPool.releaseConnection(host, username);
        return reject(err);
      }
      
      resolve({
        sftp,
        release: () => connectionPool.releaseConnection(host, username)
      });
    });
  });
}

/**
 * List directory contents via SFTP
 * @param {Object} serverConfig - { host, username, privateKeyPath }
 * @param {string} dirPath - Directory path
 * @returns {Promise<Array>}
 */
async function listDirectory(serverConfig, dirPath = '/') {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.readdir(dirPath, (err, list) => {
      release();

      if (err) {
        return reject(err);
      }

      const items = list.map(item => ({
        name: item.filename,
        type: item.longname.startsWith('d') ? 'directory' : 'file',
        size: item.attrs.size,
        permissions: item.attrs.mode,
        modified: item.attrs.mtime * 1000, // Convert to milliseconds
        isDirectory: item.longname.startsWith('d'),
        isFile: !item.longname.startsWith('d')
      }));

      // Sort: directories first, then alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      resolve(items);
    });
  });
}

/**
 * Read file contents via SFTP
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @returns {Promise<string>}
 */
async function readFile(serverConfig, filePath) {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.readFile(filePath, 'utf8', (err, data) => {
      release();

      if (err) {
        return reject(err);
      }

      resolve(data);
    });
  });
}

/**
 * Write file contents via SFTP
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @param {string} content - File content
 * @returns {Promise<void>}
 */
async function writeFile(serverConfig, filePath, content) {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.writeFile(filePath, content, (err) => {
      release();

      if (err) {
        return reject(err);
      }

      resolve();
    });
  });
}

/**
 * Get file stats via SFTP
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @returns {Promise<Object>}
 */
async function getFileStats(serverConfig, filePath) {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.stat(filePath, (err, stats) => {
      release();

      if (err) {
        return reject(err);
      }

      resolve({
        size: stats.size,
        modified: stats.mtime * 1000,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile()
      });
    });
  });
}

/**
 * Create directory via SFTP
 * @param {Object} serverConfig - Server configuration
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function createDirectory(serverConfig, dirPath) {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.mkdir(dirPath, (err) => {
      release();

      if (err) {
        return reject(err);
      }

      resolve();
    });
  });
}

/**
 * Delete file via SFTP
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @returns {Promise<void>}
 */
async function deleteFile(serverConfig, filePath) {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.unlink(filePath, (err) => {
      release();

      if (err) {
        return reject(err);
      }

      resolve();
    });
  });
}

/**
 * Delete directory via SFTP
 * @param {Object} serverConfig - Server configuration
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function deleteDirectory(serverConfig, dirPath) {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.rmdir(dirPath, (err) => {
      release();

      if (err) {
        return reject(err);
      }

      resolve();
    });
  });
}

/**
 * Rename/move file or directory via SFTP
 * @param {Object} serverConfig - Server configuration
 * @param {string} oldPath - Old path
 * @param {string} newPath - New path
 * @returns {Promise<void>}
 */
async function rename(serverConfig, oldPath, newPath) {
  const { sftp, release } = await getSftpSession(serverConfig);

  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => {
      release();

      if (err) {
        return reject(err);
      }

      resolve();
    });
  });
}

/**
 * List files using ls -la command (fallback for compatibility)
 * @param {Object} serverConfig - Server configuration
 * @param {string} dirPath - Directory path
 * @returns {Promise<Array>}
 */
async function listFilesViaCommand(serverConfig, dirPath) {
  const { executeCommand } = require('./connectionManager');
  
  const command = `ls -la "${dirPath}" 2>&1`;
  const { stdout, stderr, code } = await executeCommand(serverConfig, command);

  if (stdout.includes('cannot access') || stdout.includes('No such file')) {
    throw new Error('Directory not found or permission denied');
  }

  const lines = stdout.trim().split('\n');
  const files = [];

  // Skip first line (total) and parse ls -la output
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse ls -la format: permissions links owner group size month day time/year name
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;

    const permissions = parts[0];
    const size = parseInt(parts[4]) || 0;
    // Name is everything from index 8 onwards (handles spaces in filenames)
    const name = parts.slice(8).join(' ');

    // Skip . and ..
    if (name === '.' || name === '..') continue;

    const isDirectory = permissions.startsWith('d');
    const fullPath = dirPath.endsWith('/')
      ? dirPath + name
      : dirPath + '/' + name;

    files.push({
      name,
      path: fullPath,
      isDirectory,
      permissions,
      size: isDirectory ? 0 : size,
      modified: Date.now()
    });
  }

  // Sort: directories first, then alphabetically
  files.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return files;
}

module.exports = {
  listDirectory,
  readFile,
  writeFile,
  getFileStats,
  createDirectory,
  deleteFile,
  deleteDirectory,
  rename,
  listFilesViaCommand
};
