/**
 * System API Service - Version, status, and update management
 */

import api from './axiosConfig';

export const systemService = {
  /**
   * Get current version and check for updates
   */
  getVersion: async () => {
    const response = await api.get('/system/version');
    return response.data;
  },

  /**
   * Get system status (uptime, memory, etc.)
   */
  getStatus: async () => {
    const response = await api.get('/system/status');
    return response.data;
  },

  /**
   * Get changelog (commits available in update)
   */
  getChangelog: async () => {
    const response = await api.get('/system/changelog');
    return response.data;
  },

  /**
   * Get current update status (for polling/restoring state)
   */
  getUpdateStatus: async () => {
    const response = await api.get('/system/update-status');
    return response.data;
  },

  /**
   * Clear update status (reset to idle)
   */
  clearUpdateStatus: async () => {
    const response = await api.post('/system/update-status/clear');
    return response.data;
  },

  /**
   * Trigger system update (git pull + npm install + build)
   * Update now runs in background - returns immediately
   */
  triggerUpdate: async () => {
    const response = await api.post('/system/update');
    return response.data;
  },

  /**
   * Restart the server
   */
  restartServer: async () => {
    const response = await api.post('/system/restart');
    return response.data;
  }
};

export default systemService;
