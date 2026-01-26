const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { run } = require('../../database/connection');

/**
 * Storage service for managing uploaded files
 */

const STORAGE_BASE = path.join(__dirname, '../../uploads');
const ICONS_DIR = path.join(STORAGE_BASE, 'icons');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB for icons

// Import snapshot service to get accurate snapshot storage stats
let snapshotService;
try {
  snapshotService = require('../snapshots/snapshotService');
} catch (err) {
  console.warn('Snapshot service not available for storage calculations');
}

/**
 * Ensure upload directories exist
 */
async function ensureDirectories() {
  await fs.mkdir(STORAGE_BASE, { recursive: true });
  await fs.mkdir(ICONS_DIR, { recursive: true });
}

/**
 * Generate a unique filename
 * @param {string} originalName - Original filename
 * @returns {string} - Unique filename
 */
function generateUniqueFilename(originalName) {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `${timestamp}_${randomString}${ext}`;
}

/**
 * Save an icon file
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} - Relative URL path to the saved file
 */
async function saveIcon(fileBuffer, originalName) {
  await ensureDirectories();
  
  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  
  // Generate unique filename
  const filename = generateUniqueFilename(originalName);
  const filePath = path.join(ICONS_DIR, filename);
  
  // Save file
  await fs.writeFile(filePath, fileBuffer);
  
  // Return relative URL path
  return `/uploads/icons/${filename}`;
}

/**
 * Delete an icon file
 * @param {string} iconUrl - Icon URL (e.g., /uploads/icons/filename.png)
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
async function deleteIcon(iconUrl) {
  if (!iconUrl || !iconUrl.startsWith('/uploads/icons/')) {
    return false;
  }
  
  const filename = path.basename(iconUrl);
  const filePath = path.join(ICONS_DIR, filename);
  
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // File doesn't exist
    }
    throw err;
  }
}

/**
 * Rename an icon file
 * @param {string} oldIconUrl - Current icon URL
 * @param {string} newFilename - New filename (without path)
 * @returns {Promise<string>} - New icon URL
 */
async function renameIcon(oldIconUrl, newFilename) {
  if (!oldIconUrl || !oldIconUrl.startsWith('/uploads/icons/')) {
    throw new Error('Invalid icon URL');
  }
  
  // Validate new filename
  if (!newFilename || newFilename.includes('/') || newFilename.includes('\\')) {
    throw new Error('Invalid filename');
  }
  
  const oldFilename = path.basename(oldIconUrl);
  const oldFilePath = path.join(ICONS_DIR, oldFilename);
  
  // Keep the extension from the original file
  const oldExt = path.extname(oldFilename);
  const newExt = path.extname(newFilename);
  
  // If no extension provided or different extension, use original extension
  let finalNewFilename = newFilename;
  if (!newExt || newExt !== oldExt) {
    finalNewFilename = path.basename(newFilename, newExt) + oldExt;
  }
  
  const newFilePath = path.join(ICONS_DIR, finalNewFilename);
  
  // Check if old file exists
  try {
    await fs.access(oldFilePath);
  } catch (err) {
    throw new Error('Icon file not found');
  }
  
  // Check if new filename already exists
  try {
    await fs.access(newFilePath);
    throw new Error('A file with this name already exists');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  
  // Rename the file
  await fs.rename(oldFilePath, newFilePath);
  
  const newIconUrl = `/uploads/icons/${finalNewFilename}`;
  
  // Update all database references to this icon
  // Update apps table
  await run(
    'UPDATE apps SET icon_url = ? WHERE icon_url = ?',
    [newIconUrl, oldIconUrl]
  );
  
  // Update app_deployments table
  await run(
    'UPDATE app_deployments SET icon_url = ? WHERE icon_url = ?',
    [newIconUrl, oldIconUrl]
  );
  
  // Return new URL
  return newIconUrl;
}

/**
 * Get storage info
 * @returns {Promise<Object>} - Storage statistics
 */
async function getStorageInfo() {
  await ensureDirectories();
  
  const iconsFiles = await fs.readdir(ICONS_DIR);
  
  let iconsSize = 0;
  for (const file of iconsFiles) {
    try {
      const stats = await fs.stat(path.join(ICONS_DIR, file));
      iconsSize += stats.size;
    } catch (err) {
      // Skip files that can't be read
    }
  }
  
  // Get snapshots storage from snapshot service (more accurate)
  let snapshotsSize = 0;
  let snapshotsCount = 0;
  let totalStorage = 1099511627776; // Default 1TB if snapshot service unavailable
  
  if (snapshotService) {
    try {
      const snapshotStats = await snapshotService.getStorageStats();
      snapshotsSize = snapshotStats.usedBytes || 0;
      totalStorage = snapshotStats.maxBytes || totalStorage; // Use snapshot max storage as total
      
      // Get snapshot count from model
      const { SnapshotModel } = require('../../models');
      const snapshots = await SnapshotModel.findAll();
      snapshotsCount = snapshots.length;
    } catch (err) {
      console.error('Error getting snapshot storage:', err);
      // Fall back to directory scan if snapshot service fails
      const snapshotsDir = path.join(STORAGE_BASE, 'snapshots');
      try {
        const snapshotFiles = await fs.readdir(snapshotsDir);
        for (const file of snapshotFiles) {
          try {
            const stats = await fs.stat(path.join(snapshotsDir, file));
            snapshotsSize += stats.size;
          } catch (err) {
            // Skip files that can't be read
          }
        }
      } catch (err) {
        // Snapshots directory might not exist yet
      }
    }
  }
  
  // Get database file size
  let databaseSize = 0;
  const dbPath = path.join(STORAGE_BASE, '..', 'database', 'app.db');
  try {
    const stats = await fs.stat(dbPath);
    databaseSize = stats.size;
  } catch (err) {
    // Database file might not exist
  }
  
  const total = iconsSize + snapshotsSize + databaseSize;
  
  return {
    icons_size: iconsSize,
    snapshots_size: snapshotsSize,
    database_size: databaseSize,
    used: total,
    total: totalStorage,
    icons_count: iconsFiles.length,
    snapshots_count: snapshotsCount
  };
}

/**
 * List all uploaded icons
 * @returns {Promise<Array>} - Array of icon URLs
 */
async function listIcons() {
  await ensureDirectories();
  
  const iconsFiles = await fs.readdir(ICONS_DIR);
  
  // Filter out .gitkeep and return URLs
  const iconUrls = iconsFiles
    .filter(file => file !== '.gitkeep' && !file.startsWith('.'))
    .map(file => `/uploads/icons/${file}`);
  
  return iconUrls;
}

module.exports = {
  saveIcon,
  deleteIcon,
  renameIcon,
  getStorageInfo,
  listIcons,
  ensureDirectories,
  STORAGE_BASE,
  ICONS_DIR
};
