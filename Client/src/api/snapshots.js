import api from './axiosConfig';

/**
 * Get all snapshots with storage stats
 */
export const getAll = async () => {
  const response = await api.get('/snapshots');
  return response.data;
};

/**
 * Get storage statistics
 */
export const getStorageStats = async () => {
  const response = await api.get('/snapshots/storage');
  return response.data;
};

/**
 * Get a single snapshot
 */
export const getById = async (snapshotId) => {
  const response = await api.get(`/snapshots/${snapshotId}`);
  return response.data;
};

/**
 * Get snapshots for a deployment
 */
export const getByDeployment = async (deploymentId) => {
  const response = await api.get(`/deployments/${deploymentId}/snapshots`);
  return response.data;
};

/**
 * Create a snapshot for a deployment
 */
export const create = async (deploymentId, notes = null, socketId = null) => {
  const response = await api.post(`/deployments/${deploymentId}/snapshots`, { notes, socketId });
  return response.data;
};

/**
 * Delete a snapshot
 */

/**
 * Update snapshot notes
 */
export const update = async (snapshotId, notes) => {
  const response = await api.patch(`/snapshots/${snapshotId}`, { notes });
  return response.data;
};

export const remove = async (snapshotId) => {
  const response = await api.delete(`/snapshots/${snapshotId}`);
  return response.data;
};

/**
 * Restore a snapshot
 */
export const restore = async (snapshotId, socketId = null) => {
  const response = await api.post(`/snapshots/${snapshotId}/restore`, { socketId });
  return response.data;
};

/**
 * Get download URL for snapshot
 */
export const getDownloadUrl = (snapshotId) => {
  return `${api.defaults.baseURL}/snapshots/${snapshotId}/download`;
};

/**
 * Get backup settings
 */
export const getBackupSettings = async () => {
  const response = await api.get('/settings/backup');
  return response.data;
};

/**
 * Update backup settings
 */
export const updateBackupSettings = async (settings) => {
  const response = await api.put('/settings/backup', settings);
  return response.data;
};

export const snapshotsService = {
  getAll,
  getStorageStats,
  getById,
  getByDeployment,
  create,
  remove,
  restore,
  getDownloadUrl,
  getBackupSettings,
  updateBackupSettings
};
