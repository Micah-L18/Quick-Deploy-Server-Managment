const { run, get, all } = require('../database/connection');

/**
 * Get a system setting by key
 * @param {string} key - Setting key
 * @returns {Promise<any>} - Parsed JSON value or null
 */
async function getValue(key) {
  const result = await get('SELECT value FROM system_settings WHERE key = ?', [key]);
  if (!result) return null;
  
  try {
    return JSON.parse(result.value);
  } catch {
    return result.value;
  }
}

/**
 * Set a system setting (upsert)
 * @param {string} key - Setting key
 * @param {any} value - Value to store (will be JSON stringified)
 * @returns {Promise<void>}
 */
async function setValue(key, value) {
  const updatedAt = new Date().toISOString();
  const jsonValue = JSON.stringify(value);
  
  await run(
    `INSERT INTO system_settings (key, value, updated_at) 
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
    [key, jsonValue, updatedAt, jsonValue, updatedAt]
  );
}

/**
 * Delete a system setting
 * @param {string} key - Setting key
 * @returns {Promise<void>}
 */
async function deleteValue(key) {
  await run('DELETE FROM system_settings WHERE key = ?', [key]);
}

/**
 * Get all system settings
 * @returns {Promise<Object>} - Object with key-value pairs
 */
async function getAll() {
  const rows = await all('SELECT key, value FROM system_settings');
  const settings = {};
  
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  
  return settings;
}

/**
 * Get backup-related settings with defaults
 * @returns {Promise<Object>}
 */
async function getBackupSettings() {
  const { BACKUP_CONFIG } = require('../config');
  
  const storagePath = await getValue('backup_storage_path');
  const maxStorageGB = await getValue('backup_max_storage_gb');
  const retentionDays = await getValue('backup_retention_days');
  
  return {
    storagePath: storagePath || BACKUP_CONFIG.storagePath,
    maxStorageGB: maxStorageGB || BACKUP_CONFIG.maxStorageGB,
    retentionDays: retentionDays || BACKUP_CONFIG.retentionDays
  };
}

/**
 * Update backup-related settings
 * @param {Object} settings - Settings to update
 * @returns {Promise<void>}
 */
async function updateBackupSettings(settings) {
  if (settings.storagePath !== undefined) {
    await setValue('backup_storage_path', settings.storagePath);
  }
  if (settings.maxStorageGB !== undefined) {
    await setValue('backup_max_storage_gb', settings.maxStorageGB);
  }
  if (settings.retentionDays !== undefined) {
    await setValue('backup_retention_days', settings.retentionDays);
  }
}

module.exports = {
  getValue,
  setValue,
  deleteValue,
  getAll,
  getBackupSettings,
  updateBackupSettings
};
