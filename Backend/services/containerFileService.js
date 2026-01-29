const { connectionManager } = require('./ssh');
const { downloadFileToBuffer } = require('./ssh/sftpService');
const path = require('path');

/**
 * Container File Service
 * Provides file browsing capabilities for Docker containers and their volumes
 */

// Size threshold for warning (50MB)
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

/**
 * Get volume mounts for a container
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @returns {Promise<Array>} Array of mount objects with source and destination
 */
async function getContainerMounts(serverConfig, containerId) {
  const command = `docker inspect --format '{{json .Mounts}}' ${containerId} 2>&1`;
  
  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(serverConfig, command);
    
    if (code !== 0 || !stdout.trim()) {
      return [];
    }
    
    const mounts = JSON.parse(stdout.trim());
    return mounts.map(mount => ({
      source: mount.Source,
      destination: mount.Destination,
      type: mount.Type,
      rw: mount.RW
    }));
  } catch (error) {
    console.error('Error getting container mounts:', error);
    return [];
  }
}

/**
 * Map container path to host volume path
 * @param {Array} mounts - Array of mount objects
 * @param {string} containerPath - Path inside the container
 * @returns {string|null} Host path or null if not mapped
 */
function mapContainerPathToHost(mounts, containerPath) {
  // Sort mounts by destination length (longest first) to match most specific mount
  const sortedMounts = [...mounts].sort((a, b) => b.destination.length - a.destination.length);
  
  for (const mount of sortedMounts) {
    if (containerPath.startsWith(mount.destination)) {
      // Replace the container path with the host path
      const relativePath = containerPath.substring(mount.destination.length);
      return mount.source + relativePath;
    }
  }
  
  return null;
}

/**
 * List files in a container directory
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @param {string} path - Directory path to list (default: /)
 * @returns {Promise<Object>} Object with files array and current path
 */
async function listContainerFiles(serverConfig, containerId, path = '/') {
  // Sanitize path
  const safePath = path.replace(/[;&|`$]/g, '');
  
  // Always try to access via volume first (works for both running and stopped containers)
  try {
    const mounts = await getContainerMounts(serverConfig, containerId);
    
    console.log(`[listContainerFiles] Container: ${containerId}, Path: ${safePath}, Mounts:`, mounts);
    
    // If requesting root, return available volumes as directories
    if (safePath === '/' && mounts.length > 0) {
      const volumeDirs = mounts.map(mount => {
        // Remove leading / from destination, but handle root mounts
        let displayName = mount.destination.substring(1);
        if (!displayName) displayName = mount.destination; // If destination is just "/", use it
        
        return {
          name: displayName,
          isDirectory: true,
          isSymlink: false,
          size: 0,
          modified: new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().split(' ')[0],
          permissions: 'drwxr-xr-x',
          owner: 'root',
          group: 'root',
          _volumeMount: true,
          _hostPath: mount.source
        };
      });
      
      console.log(`[listContainerFiles] Returning ${volumeDirs.length} volume directories`);
      
      return {
        path: safePath,
        files: volumeDirs,
        _volumeAccess: true,
        _message: 'Showing mounted volumes (direct host filesystem access).'
      };
    }
    
    const hostPath = mapContainerPathToHost(mounts, safePath);
    
    console.log(`[listContainerFiles] Mapped host path: ${hostPath}`);
    
    // If path is in a volume, access it directly from host
    if (hostPath) {
      const volumeCommand = `sudo ls -la --time-style=long-iso "${hostPath}" 2>&1`;
      const volumeResult = await connectionManager.executeCommand(serverConfig, volumeCommand);
      
      if (volumeResult.code === 0) {
        return parseListOutput(volumeResult.stdout, safePath);
      }
      
      console.log(`[listContainerFiles] Volume ls failed:`, volumeResult.stderr);
    }
    
    // Fall back to docker exec if volume access didn't work
    console.log('Volume access failed or path not in volume, trying docker exec...');
    const execCommand = `docker exec ${containerId} ls -la --time-style=long-iso "${safePath}" 2>&1`;
    const { stdout, stderr, code } = await connectionManager.executeCommand(serverConfig, execCommand);
    
    if (code === 0 && stdout && !stderr.includes('not running')) {
      return parseListOutput(stdout, safePath);
    }
    
    // If both methods failed, provide helpful error
    const volumePaths = mounts.map(m => m.destination).join(', ') || 'none';
    throw new Error(`Path not accessible. Available mounted volumes: ${volumePaths}`);
  } catch (error) {
    console.error('Error listing container files:', error);
    throw error;
  }
}

/**
 * Parse ls -la output into structured file array
 * @param {string} output - ls command output
 * @param {string} path - Current path
 * @returns {Object} Object with files array and path
 */
function parseListOutput(output, path) {
  // Check for errors
  if (output.includes('No such file or directory')) {
    throw new Error('Directory not found');
  }
  if (output.includes('cannot access')) {
    throw new Error('Permission denied');
  }
  if (output.includes('not a directory')) {
    throw new Error('Not a directory');
  }
  
  // Parse ls output
  const lines = output.trim().split('\n');
  const files = [];
  
  // Skip first line (total) and parse each line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse ls -la output format
    // Example: drwxr-xr-x 2 root root 4096 2024-01-26 12:30 dirname
    const parts = line.split(/\s+/);
    if (parts.length < 8) continue;
    
    const permissions = parts[0];
    const isDirectory = permissions.startsWith('d');
    const isSymlink = permissions.startsWith('l');
    const owner = parts[2];
    const group = parts[3];
    const size = parseInt(parts[4]) || 0;
    const date = parts[5];
    const time = parts[6];
    const name = parts.slice(7).join(' ');
    
    // Skip . and .. entries
    if (name === '.' || name === '..') continue;
    
    files.push({
      name,
      isDirectory,
      isSymlink,
      size,
      modified: `${date} ${time}`,
      permissions,
      owner,
      group
    });
  }
  
  // Sort: directories first, then by name
  files.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return {
    path,
    files
  };
}

/**
 * Read file content from container
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @param {string} filePath - File path to read
 * @returns {Promise<string>} File content
 */
async function readContainerFile(serverConfig, containerId, filePath) {
  // Sanitize path
  const safePath = filePath.replace(/[;&|`$]/g, '');
  
  // Always try to access via volume first (works for both running and stopped containers)
  try {
    const mounts = await getContainerMounts(serverConfig, containerId);
    const hostPath = mapContainerPathToHost(mounts, safePath);
    
    console.log(`[readContainerFile] Container: ${containerId}, File: ${safePath}, Host path: ${hostPath}`);
    
    // If path is in a volume, access it directly from host
    if (hostPath) {
      const volumeCommand = `sudo cat "${hostPath}" 2>&1`;
      const volumeResult = await connectionManager.executeCommand(serverConfig, volumeCommand);
      
      console.log(`[readContainerFile] Volume cat result - code: ${volumeResult.code}, stdout length: ${volumeResult.stdout?.length || 0}`);
      
      if (volumeResult.code === 0) {
        return volumeResult.stdout;
      }
      
      // Check for specific errors
      if (volumeResult.stderr.includes('No such file')) {
        throw new Error('File not found');
      }
      if (volumeResult.stderr.includes('Permission denied')) {
        throw new Error('Permission denied');
      }
      if (volumeResult.stderr.includes('Is a directory')) {
        throw new Error('Path is a directory, not a file');
      }
      
      console.log(`[readContainerFile] Volume cat failed:`, volumeResult.stderr);
    } else {
      console.log(`[readContainerFile] Path not in volume mounts`);
    }
    
    // Fall back to docker exec if volume access didn't work
    console.log('Volume access failed or path not in volume, trying docker exec...');
    const execCommand = `docker exec ${containerId} cat "${safePath}" 2>&1`;
    const { stdout, stderr, code } = await connectionManager.executeCommand(serverConfig, execCommand);
    
    if (code === 0 && !stderr.includes('not running')) {
      // Check for errors in stdout
      if (stdout.includes('No such file or directory')) {
        throw new Error('File not found');
      }
      if (stdout.includes('Permission denied')) {
        throw new Error('Permission denied');
      }
      if (stdout.includes('Is a directory')) {
        throw new Error('Path is a directory, not a file');
      }
      return stdout;
    }
    
    // If both methods failed
    throw new Error('File not accessible. It may not be in a mounted volume or the container may be stopped.');
  } catch (error) {
    console.error('Error reading container file:', error);
    throw error;
  }
}

/**
 * Write file content to container volume
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @param {string} filePath - File path to write
 * @param {string} content - Content to write
 * @returns {Promise<boolean>} Success status
 */
async function writeContainerFile(serverConfig, containerId, filePath, content) {
  // Sanitize path
  const safePath = filePath.replace(/[;&|`$]/g, '');
  
  try {
    // Only allow writing via volume (not docker exec for safety)
    const mounts = await getContainerMounts(serverConfig, containerId);
    const hostPath = mapContainerPathToHost(mounts, safePath);
    
    if (!hostPath) {
      throw new Error('File not in a mounted volume. Only files in mounted volumes can be edited.');
    }
    
    // Get original file permissions and ownership (needs sudo for Docker volumes)
    const statCommand = `sudo stat -c '%a|%U|%G' "${hostPath}" 2>&1`;
    const statResult = await connectionManager.executeCommand(serverConfig, statCommand);
    
    let originalPerms = '644';
    let originalOwner = null;
    let originalGroup = null;
    
    if (statResult.code === 0 && statResult.stdout) {
      const [perms, owner, group] = statResult.stdout.trim().split('|');
      originalPerms = perms;
      originalOwner = owner;
      originalGroup = group;
    }
    
    // Create a temporary file with the content
    const tempFile = `/tmp/containerfile_${Date.now()}.tmp`;
    
    // Write content to temp file using printf for better handling of special characters
    // Escape backslashes and percent signs for printf
    const escapedContent = content.replace(/\\/g, '\\\\').replace(/%/g, '%%');
    const writeCommand = `printf '%s' '${escapedContent.replace(/'/g, "'\\''")}' > ${tempFile}`;
    const writeResult = await connectionManager.executeCommand(serverConfig, writeCommand);
    
    if (writeResult.code !== 0) {
      throw new Error('Failed to create temporary file');
    }
    
    // Copy temp file to destination (needs sudo for Docker volumes)
    const copyCommand = `sudo cp -f ${tempFile} "${hostPath}"`;
    const copyResult = await connectionManager.executeCommand(serverConfig, copyCommand);
    
    if (copyResult.code !== 0) {
      // Clean up temp file
      await connectionManager.executeCommand(serverConfig, `rm -f ${tempFile}`);
      throw new Error(copyResult.stderr || 'Failed to write file');
    }
    
    // Restore original permissions and ownership
    if (originalPerms) {
      await connectionManager.executeCommand(serverConfig, `sudo chmod ${originalPerms} "${hostPath}"`);
    }
    
    if (originalOwner && originalGroup) {
      await connectionManager.executeCommand(serverConfig, `sudo chown ${originalOwner}:${originalGroup} "${hostPath}"`);
    }
    
    // Clean up temp file
    await connectionManager.executeCommand(serverConfig, `rm -f ${tempFile}`);
    
    return true;
  } catch (error) {
    console.error('Error writing container file:', error);
    throw error;
  }
}

/**
 * Get file statistics from container
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @param {string} filePath - File path to stat
 * @returns {Promise<Object>} File statistics
 */
async function getContainerFileStats(serverConfig, containerId, filePath) {
  // Sanitize path
  const safePath = filePath.replace(/[;&|`$]/g, '');
  
  // Use docker exec with stat to get file info
  const command = `docker exec ${containerId} stat -c '%s|%Y|%A|%U|%G' "${safePath}" 2>&1`;
  
  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(serverConfig, command);
    
    // Check for errors
    const output = stdout || stderr;
    if (output.includes('No such file or directory')) {
      throw new Error('File not found');
    }
    if (output.includes('Permission denied')) {
      throw new Error('Permission denied');
    }
    
    // Parse stat output (size|modified|permissions|owner|group)
    const [size, modified, permissions, owner, group] = stdout.trim().split('|');
    
    return {
      size: parseInt(size) || 0,
      modified: new Date(parseInt(modified) * 1000).toISOString(),
      permissions,
      owner,
      group
    };
  } catch (error) {
    console.error('Error getting container file stats:', error);
    throw error;
  }
}

/**
 * Check if container is running
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @returns {Promise<boolean>} True if running
 */
async function isContainerRunning(serverConfig, containerId) {
  const command = `docker inspect -f '{{.State.Running}}' ${containerId} 2>&1`;
  
  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(serverConfig, command);
    return stdout.trim() === 'true';
  } catch (error) {
    console.error('Error checking container status:', error);
    return false;
  }
}

/**
 * Download file from container (supports both volume and non-volume containers)
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @param {string} filePath - File path to download
 * @param {boolean} isDirectory - Whether the path is a directory (for bulk download)
 * @returns {Promise<{buffer: Buffer, filename: string, size: number, isLarge: boolean}>}
 */
async function downloadContainerFile(serverConfig, containerId, filePath, isDirectory = false) {
  // Sanitize path
  const safePath = filePath.replace(/[;&|`$]/g, '');
  const timestamp = Date.now();
  const tempPath = `/tmp/qdeploy_dl_${timestamp}`;
  
  console.log(`[downloadContainerFile] Container: ${containerId}, Path: ${safePath}, IsDir: ${isDirectory}`);
  
  try {
    const mounts = await getContainerMounts(serverConfig, containerId);
    const hostPath = mapContainerPathToHost(mounts, safePath);
    
    let downloadPath;
    let needsCleanup = false;
    let archiveFilename;
    
    if (isDirectory) {
      // For directories, create a tar.gz archive
      archiveFilename = `${path.basename(safePath) || 'root'}_${timestamp}.tar.gz`;
      const archivePath = `${tempPath}.tar.gz`;
      
      if (hostPath) {
        // Volume-mapped directory - tar from host path
        console.log(`[downloadContainerFile] Creating tar from host path: ${hostPath}`);
        const tarCommand = `sudo tar -czf ${archivePath} -C "${path.dirname(hostPath)}" "${path.basename(hostPath)}" 2>&1`;
        const tarResult = await connectionManager.executeCommand(serverConfig, tarCommand);
        
        if (tarResult.code !== 0) {
          throw new Error(`Failed to create archive: ${tarResult.stderr || tarResult.stdout}`);
        }
      } else {
        // Non-volume directory - use docker cp to temp, then tar
        console.log(`[downloadContainerFile] Using docker cp for non-volume path`);
        
        // Create temp directory
        await connectionManager.executeCommand(serverConfig, `mkdir -p ${tempPath}`);
        
        // docker cp from container (works for both running and stopped containers)
        const cpCommand = `docker cp "${containerId}:${safePath}" "${tempPath}/" 2>&1`;
        const cpResult = await connectionManager.executeCommand(serverConfig, cpCommand);
        
        if (cpResult.code !== 0) {
          // Check if container exists
          if (cpResult.stdout.includes('No such container') || cpResult.stderr.includes('No such container')) {
            throw new Error('Container not found. It may have been removed.');
          }
          throw new Error(`Failed to copy from container: ${cpResult.stderr || cpResult.stdout}`);
        }
        
        // Create tar from the copied files
        const tarCommand = `tar -czf ${archivePath} -C "${tempPath}" . 2>&1`;
        const tarResult = await connectionManager.executeCommand(serverConfig, tarCommand);
        
        if (tarResult.code !== 0) {
          throw new Error(`Failed to create archive: ${tarResult.stderr || tarResult.stdout}`);
        }
        
        // Clean up temp directory (keep tar file)
        await connectionManager.executeCommand(serverConfig, `rm -rf ${tempPath}`);
      }
      
      downloadPath = archivePath;
      needsCleanup = true;
    } else {
      // Single file download
      if (hostPath) {
        // Volume-mapped file - download directly via SFTP with sudo copy
        console.log(`[downloadContainerFile] Downloading from host path: ${hostPath}`);
        
        // Copy to temp with sudo (Docker volumes often need elevated permissions)
        const cpCommand = `sudo cp "${hostPath}" "${tempPath}" && sudo chmod 644 "${tempPath}"`;
        const cpResult = await connectionManager.executeCommand(serverConfig, cpCommand);
        
        if (cpResult.code !== 0) {
          throw new Error(`Failed to access file: ${cpResult.stderr || 'Permission denied'}`);
        }
        
        downloadPath = tempPath;
        needsCleanup = true;
        archiveFilename = path.basename(safePath);
      } else {
        // Non-volume file - use docker cp
        console.log(`[downloadContainerFile] Using docker cp for non-volume file`);
        
        const cpCommand = `docker cp "${containerId}:${safePath}" "${tempPath}" 2>&1`;
        const cpResult = await connectionManager.executeCommand(serverConfig, cpCommand);
        
        if (cpResult.code !== 0) {
          if (cpResult.stdout.includes('No such container') || cpResult.stderr.includes('No such container')) {
            throw new Error('Container not found. It may have been removed.');
          }
          throw new Error(`Failed to copy from container: ${cpResult.stderr || cpResult.stdout}`);
        }
        
        downloadPath = tempPath;
        needsCleanup = true;
        archiveFilename = path.basename(safePath);
      }
    }
    
    // Get file size for large file warning
    const sizeResult = await connectionManager.executeCommand(serverConfig, `stat -c%s "${downloadPath}" 2>/dev/null || echo 0`);
    const fileSize = parseInt(sizeResult.stdout.trim()) || 0;
    const isLarge = fileSize > LARGE_FILE_THRESHOLD;
    
    console.log(`[downloadContainerFile] Downloading ${downloadPath}, size: ${fileSize} bytes`);
    
    // Download file to buffer via SFTP
    const buffer = await downloadFileToBuffer(serverConfig, downloadPath);
    
    // Cleanup temp file if needed
    if (needsCleanup) {
      await connectionManager.executeCommand(serverConfig, `rm -f "${downloadPath}"`);
    }
    
    return {
      buffer,
      filename: archiveFilename,
      size: fileSize,
      isLarge
    };
  } catch (error) {
    // Cleanup on error
    await connectionManager.executeCommand(serverConfig, `rm -rf ${tempPath} ${tempPath}.tar.gz 2>/dev/null`);
    console.error('Error downloading container file:', error);
    throw error;
  }
}

/**
 * Get file/directory info for download (check size before downloading)
 * @param {Object} serverConfig - Server connection configuration
 * @param {string} containerId - Docker container ID
 * @param {string} filePath - File path to check
 * @returns {Promise<{isDirectory: boolean, size: number, isLarge: boolean, exists: boolean}>}
 */
async function getContainerFileInfo(serverConfig, containerId, filePath) {
  // Sanitize path
  const safePath = filePath.replace(/[;&|`$]/g, '');
  
  try {
    const mounts = await getContainerMounts(serverConfig, containerId);
    const hostPath = mapContainerPathToHost(mounts, safePath);
    
    let statCommand;
    if (hostPath) {
      // Use host path with sudo
      statCommand = `sudo stat -c '%F|%s' "${hostPath}" 2>&1`;
    } else {
      // Use docker exec for non-volume paths
      statCommand = `docker exec ${containerId} stat -c '%F|%s' "${safePath}" 2>&1`;
    }
    
    const result = await connectionManager.executeCommand(serverConfig, statCommand);
    
    if (result.code !== 0 || result.stdout.includes('No such file') || result.stdout.includes('cannot stat')) {
      return { exists: false, isDirectory: false, size: 0, isLarge: false };
    }
    
    const [fileType, size] = result.stdout.trim().split('|');
    const isDirectory = fileType.includes('directory');
    const fileSize = parseInt(size) || 0;
    
    // For directories, estimate size with du
    let totalSize = fileSize;
    if (isDirectory) {
      let duCommand;
      if (hostPath) {
        duCommand = `sudo du -sb "${hostPath}" 2>/dev/null | cut -f1`;
      } else {
        duCommand = `docker exec ${containerId} du -sb "${safePath}" 2>/dev/null | cut -f1`;
      }
      const duResult = await connectionManager.executeCommand(serverConfig, duCommand);
      if (duResult.code === 0) {
        totalSize = parseInt(duResult.stdout.trim()) || 0;
      }
    }
    
    return {
      exists: true,
      isDirectory,
      size: totalSize,
      isLarge: totalSize > LARGE_FILE_THRESHOLD
    };
  } catch (error) {
    console.error('Error getting container file info:', error);
    return { exists: false, isDirectory: false, size: 0, isLarge: false };
  }
}

module.exports = {
  listContainerFiles,
  readContainerFile,
  writeContainerFile,
  getContainerFileStats,
  isContainerRunning,
  downloadContainerFile,
  getContainerFileInfo,
  getContainerMounts,
  mapContainerPathToHost,
  LARGE_FILE_THRESHOLD
};
