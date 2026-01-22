import api from './axiosConfig';

/**
 * Preview a migration - get details about what will be migrated
 * @param {string} deploymentId - Deployment ID
 * @param {string} appId - App ID
 * @param {string} targetServerId - Target server ID
 * @returns {Promise<Object>} - Migration preview details
 */
export const previewMigration = async (deploymentId, appId, targetServerId) => {
  const response = await api.post('/migrations/preview', {
    deploymentId,
    appId,
    targetServerId
  });
  return response.data;
};

/**
 * Check for conflicts on target server
 * @param {string} targetServerId - Target server ID
 * @param {string} containerName - Proposed container name
 * @param {Array} portMappings - Proposed port mappings
 * @returns {Promise<Object>} - { containerName: boolean, ports: string[] }
 */
export const checkConflicts = async (targetServerId, containerName, portMappings) => {
  const response = await api.post('/migrations/check-conflicts', {
    targetServerId,
    containerName,
    portMappings
  });
  return response.data;
};

/**
 * Execute a migration (move or copy)
 * @param {Object} params - Migration parameters
 * @param {string} params.deploymentId - Deployment ID
 * @param {string} params.appId - App ID
 * @param {string} params.targetServerId - Target server ID
 * @param {string} params.containerName - Container name on target
 * @param {Array} params.portMappings - Port mappings for target
 * @param {boolean} params.deleteOriginal - If true, delete source after migration (move)
 * @param {string} params.socketId - Socket.IO ID for progress updates
 * @returns {Promise<Object>} - { success, newDeploymentId, message }
 */
export const executeMigration = async ({ 
  deploymentId, 
  appId, 
  targetServerId, 
  containerName, 
  portMappings,
  deleteOriginal = false,
  socketId 
}) => {
  const response = await api.post('/migrations/execute', {
    deploymentId,
    appId,
    targetServerId,
    containerName,
    portMappings,
    deleteOriginal,
    socketId
  });
  return response.data;
};

/**
 * Cancel an active migration
 * @param {string} deploymentId - Deployment ID of the migration to cancel
 * @returns {Promise<Object>} - { success, message }
 */
export const cancelMigration = async (deploymentId) => {
  const response = await api.post(`/migrations/${deploymentId}/cancel`);
  return response.data;
};

/**
 * Get list of active migrations for current user
 * @returns {Promise<Array>} - List of active migrations
 */
export const getActiveMigrations = async () => {
  const response = await api.get('/migrations/active');
  return response.data;
};

export default {
  previewMigration,
  checkConflicts,
  executeMigration,
  cancelMigration,
  getActiveMigrations
};
