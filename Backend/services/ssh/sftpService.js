const { Client } = require('ssh2');
const fs = require('fs');
const connectionPool = require('./connectionPool');
const { executeCommand } = require('./connectionManager');
const { SSH_POOL_CONFIG } = require('../../config');

/**
 * Get SFTP session from connection pool
 * @param {Object} serverConfig - Server configuration
 * @returns {Promise<{sftp: any, release: Function}>}
 */
async function getSftpSession(serverConfig) {
  const { host, username, privateKeyPath } = serverConfig;
  
  // Try to get connection, with retry on channel failure
  let retries = 2;
  let lastError = null;
  
  while (retries > 0) {
    try {
      const conn = await connectionPool.getConnection({ host, username, privateKeyPath });

      return await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) {
            connectionPool.releaseConnection(host, username);
            
            // If we get a channel error, force close and retry
            if (err.message && err.message.includes('Channel open failure') && retries > 1) {
              console.log(`Channel failure for ${host}, forcing reconnection...`);
              connectionPool.closeConnection(host, username);
              return reject(err);
            }
            
            return reject(err);
          }
          
          // Add error handler to SFTP session to catch any protocol errors
          sftp.on('error', (sftpErr) => {
            console.error(`SFTP protocol error for ${host}:`, sftpErr.message);
          });
          
          resolve({
            sftp,
            release: () => {
              // Remove error handler
              sftp.removeAllListeners('error');
              
              // Close the SFTP channel to prevent channel exhaustion
              // Use setImmediate to ensure the operation callback completes first
              setImmediate(() => {
                if (sftp && typeof sftp.end === 'function') {
                  sftp.end();
                }
              });
              connectionPool.releaseConnection(host, username);
            }
          });
        });
      });
    } catch (err) {
      lastError = err;
      retries--;
      
      if (retries === 0) {
        throw lastError;
      }
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  throw lastError;
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
        // Provide more context for SFTP errors
        const errorMsg = err.message === 'Failure' 
          ? `Cannot access directory: ${dirPath} (Permission denied or directory does not exist)`
          : err.message;
        return reject(new Error(errorMsg));
      }

      const items = list
        .filter(item => item.filename !== '.' && item.filename !== '..') // Filter out . and ..
        .map(item => ({
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
        const errorMsg = err.message === 'Failure' 
          ? `Cannot read file: ${filePath} (Permission denied or file does not exist)`
          : err.message;
        return reject(new Error(errorMsg));
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
        const errorMsg = err.message === 'Failure' 
          ? `Cannot write to file: ${filePath} (Permission denied or invalid path)`
          : err.message;
        return reject(new Error(errorMsg));
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
        const errorMsg = err.message === 'Failure' 
          ? `Cannot delete file: ${filePath} (Permission denied or file does not exist)`
          : err.message;
        return reject(new Error(errorMsg));
      }

      resolve();
    });
  });
}

/**
 * Delete directory via SSH command (much faster than SFTP recursive delete)
 * @param {Object} serverConfig - Server configuration
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function deleteDirectory(serverConfig, dirPath) {
  console.log(`Attempting to delete directory: ${dirPath}`);
  
  // Use rm -rf for fast, recursive deletion
  // This is MUCH faster than SFTP recursive deletion for large directories
  try {
    const command = `rm -rf "${dirPath.replace(/"/g, '\\"')}"`;
    console.log(`Executing: ${command}`);
    
    const result = await executeCommand(serverConfig, command);
    
    if (result.stderr && !result.stderr.includes('No such file')) {
      console.error(`Delete directory stderr: ${result.stderr}`);
      // Only throw if there's a real error (not just "file not found")
      if (result.code !== 0) {
        throw new Error(result.stderr || 'Failed to delete directory');
      }
    }
    
    console.log(`Successfully deleted directory: ${dirPath}`);
  } catch (err) {
    console.error(`Failed to delete directory ${dirPath}:`, err.message);
    throw new Error(`Cannot delete directory: ${dirPath} (${err.message})`);
  }
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

/**
 * Search for files and folders using find command
 * @param {Object} serverConfig - Server configuration
 * @param {string} query - Search query
 * @param {string} searchPath - Path to search in
 * @returns {Promise<Array>}
 */
async function searchFiles(serverConfig, query, searchPath = '/') {
  const { executeCommand } = require('./connectionManager');
  
  // Use find command with case-insensitive name matching
  // Search for both files and directories, limit results to 100 and timeout after 30 seconds
  const escapedQuery = query.replace(/"/g, '\\"');
  // Search both files and directories, use -printf to include type info
  const command = `timeout 30 find "${searchPath}" -iname "*${escapedQuery}*" \\( -type f -o -type d \\) 2>/dev/null | head -100`;
  
  const { stdout } = await executeCommand(serverConfig, command);
  
  const results = [];
  const lines = stdout.trim().split('\n').filter(line => line.trim());
  
  // Get file stats to determine if each result is a file or directory
  for (const line of lines) {
    const fullPath = line.trim();
    if (!fullPath) continue;
    
    const parts = fullPath.split('/');
    const name = parts[parts.length - 1];
    const dir = parts.slice(0, -1).join('/') || '/';
    
    // Skip the search path itself if it matches
    if (fullPath === searchPath) continue;
    
    results.push({
      name,
      path: fullPath,
      directory: dir,
      // We'll determine type via a second command
      isDirectory: false,
      isFile: true
    });
  }
  
  // If we have results, check which ones are directories
  if (results.length > 0) {
    const paths = results.map(r => `"${r.path}"`).join(' ');
    const typeCheckCmd = `for f in ${paths}; do [ -d "$f" ] && echo "D:$f" || echo "F:$f"; done 2>/dev/null`;
    
    try {
      const { stdout: typeOutput } = await executeCommand(serverConfig, typeCheckCmd);
      const typeLines = typeOutput.trim().split('\n');
      
      for (const typeLine of typeLines) {
        if (typeLine.startsWith('D:')) {
          const dirPath = typeLine.substring(2);
          const item = results.find(r => r.path === dirPath);
          if (item) {
            item.isDirectory = true;
            item.isFile = false;
          }
        }
      }
    } catch (e) {
      // If type check fails, assume all are files
      console.error('Type check failed:', e.message);
    }
  }
  
  // Sort: directories first, then alphabetically by name
  results.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return results;
}

/**
 * Read a protected file using sudo cat
 * For files that require elevated permissions
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @returns {Promise<string>}
 */
async function readProtectedFile(serverConfig, filePath) {
  const { executeCommand, isProtectedPath } = require('./connectionManager');
  
  // Escape the path for shell
  const escapedPath = filePath.replace(/"/g, '\\"');
  const command = `sudo cat "${escapedPath}"`;
  
  const { stdout, stderr, code } = await executeCommand(serverConfig, command);
  
  if (code !== 0) {
    throw new Error(stderr || `Failed to read file: ${filePath}`);
  }
  
  return stdout;
}

/**
 * Write to a protected file using sudo tee
 * For files that require elevated permissions
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @param {string} content - File content
 * @returns {Promise<void>}
 */
async function writeProtectedFile(serverConfig, filePath, content) {
  const { executeCommand } = require('./connectionManager');
  
  // Escape the path for shell
  const escapedPath = filePath.replace(/"/g, '\\"');
  // Use printf to handle special characters properly, pipe to sudo tee
  // This avoids issues with newlines and special chars in echo
  const escapedContent = content
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  
  const command = `printf '%s' "${escapedContent}" | sudo tee "${escapedPath}" > /dev/null`;
  
  const { stderr, code } = await executeCommand(serverConfig, command);
  
  if (code !== 0) {
    throw new Error(stderr || `Failed to write file: ${filePath}`);
  }
}

/**
 * Smart read file - uses sudo for protected paths, SFTP otherwise
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @returns {Promise<string>}
 */
async function readFileSmart(serverConfig, filePath) {
  const { isProtectedPath } = require('./connectionManager');
  
  // Try regular SFTP first
  try {
    return await readFile(serverConfig, filePath);
  } catch (err) {
    // If permission denied or protected path, try with sudo
    if (err.message.includes('Permission denied') || 
        err.message.includes('EACCES') || 
        isProtectedPath(filePath)) {
      return await readProtectedFile(serverConfig, filePath);
    }
    throw err;
  }
}

/**
 * Smart write file - uses sudo for protected paths, SFTP otherwise
 * @param {Object} serverConfig - Server configuration
 * @param {string} filePath - File path
 * @param {string} content - File content
 * @returns {Promise<void>}
 */
async function writeFileSmart(serverConfig, filePath, content) {
  const { isProtectedPath } = require('./connectionManager');
  
  // Try regular SFTP first
  try {
    return await writeFile(serverConfig, filePath, content);
  } catch (err) {
    // If permission denied or protected path, try with sudo
    if (err.message.includes('Permission denied') || 
        err.message.includes('EACCES') || 
        isProtectedPath(filePath)) {
      return await writeProtectedFile(serverConfig, filePath, content);
    }
    throw err;
  }
}

/**
 * List directory with fallback to sudo ls for protected directories
 * @param {Object} serverConfig - Server configuration
 * @param {string} dirPath - Directory path
 * @returns {Promise<Array>}
 */
async function listDirectorySmart(serverConfig, dirPath = '/') {
  const { executeCommand, isProtectedPath } = require('./connectionManager');
  
  // Try regular SFTP first
  try {
    return await listDirectory(serverConfig, dirPath);
  } catch (err) {
    // If permission denied, try with sudo ls
    if (err.message.includes('Permission denied') || 
        err.message.includes('EACCES') || 
        isProtectedPath(dirPath)) {
      const command = `sudo ls -la "${dirPath}" 2>&1`;
      const { stdout, code } = await executeCommand(serverConfig, command);
      
      if (code !== 0 || stdout.includes('cannot access')) {
        throw new Error('Directory not found or permission denied');
      }
      
      // Parse ls output (same as listFilesViaCommand)
      const lines = stdout.trim().split('\n');
      const files = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;
        
        const permissions = parts[0];
        const size = parseInt(parts[4]) || 0;
        const name = parts.slice(8).join(' ');
        
        if (name === '.' || name === '..') continue;
        
        const isDirectory = permissions.startsWith('d');
        const fullPath = dirPath.endsWith('/')
          ? dirPath + name
          : dirPath + '/' + name;
        
        files.push({
          name,
          path: fullPath,
          type: isDirectory ? 'directory' : 'file',
          isDirectory,
          isFile: !isDirectory,
          permissions,
          size: isDirectory ? 0 : size,
          modified: Date.now()
        });
      }
      
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      return files;
    }
    throw err;
  }
}

/**
 * Download a file from remote server to local filesystem
 * @param {Object} serverConfig - Server configuration
 * @param {string} remotePath - Remote file path
 * @param {string} localPath - Local file path to save to
 * @returns {Promise<void>}
 */
async function downloadFile(serverConfig, remotePath, localPath) {
  const { sftp, release } = await getSftpSession(serverConfig);
  const localFs = require('fs');
  const path = require('path');
  
  // Ensure local directory exists
  const localDir = path.dirname(localPath);
  await require('fs').promises.mkdir(localDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const writeStream = localFs.createWriteStream(localPath);
    const readStream = sftp.createReadStream(remotePath);
    
    readStream.on('error', (err) => {
      release();
      writeStream.close();
      reject(err);
    });
    
    writeStream.on('error', (err) => {
      release();
      reject(err);
    });
    
    writeStream.on('close', () => {
      release();
      resolve();
    });
    
    readStream.pipe(writeStream);
  });
}

/**
 * Upload a file from local filesystem to remote server
 * @param {Object} serverConfig - Server configuration
 * @param {string} localPath - Local file path
 * @param {string} remotePath - Remote file path to save to
 * @returns {Promise<void>}
 */
async function uploadFile(serverConfig, localPath, remotePath) {
  const { sftp, release } = await getSftpSession(serverConfig);
  const localFs = require('fs');

  return new Promise((resolve, reject) => {
    const readStream = localFs.createReadStream(localPath);
    const writeStream = sftp.createWriteStream(remotePath);
    
    readStream.on('error', (err) => {
      release();
      writeStream.close();
      reject(err);
    });
    
    writeStream.on('error', (err) => {
      release();
      reject(err);
    });
    
    writeStream.on('close', () => {
      release();
      resolve();
    });
    
    readStream.pipe(writeStream);
  });
}

/**
 * Download file from remote server to buffer (for HTTP responses)
 * @param {Object} serverConfig - Server configuration
 * @param {string} remotePath - Remote file path
 * @returns {Promise<Buffer>} - File contents as buffer
 */
async function downloadFileToBuffer(serverConfig, remotePath) {
  const { sftp, release } = await getSftpSession(serverConfig);
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const readStream = sftp.createReadStream(remotePath);
    
    readStream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    readStream.on('error', (err) => {
      release();
      reject(err);
    });
    
    readStream.on('end', () => {
      release();
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Upload file from buffer to remote server (for HTTP uploads)
 * @param {Object} serverConfig - Server configuration
 * @param {Buffer} fileBuffer - File contents as buffer
 * @param {string} remotePath - Remote file path
 * @returns {Promise<void>}
 */
async function uploadFileFromBuffer(serverConfig, fileBuffer, remotePath) {
  const { sftp, release } = await getSftpSession(serverConfig);
  
  return new Promise((resolve, reject) => {
    const writeStream = sftp.createWriteStream(remotePath);
    
    writeStream.on('error', (err) => {
      release();
      reject(err);
    });
    
    writeStream.on('close', () => {
      release();
      resolve();
    });
    
    writeStream.write(fileBuffer);
    writeStream.end();
  });
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
  listFilesViaCommand,
  searchFiles,
  // Protected file operations
  readProtectedFile,
  writeProtectedFile,
  // Smart operations (auto-elevate if needed)
  readFileSmart,
  writeFileSmart,
  listDirectorySmart,
  // File transfer operations
  downloadFile,
  uploadFile,
  downloadFileToBuffer,
  uploadFileFromBuffer
};
