import api from './axiosConfig';

export const appsService = {
  getApps: async () => {
    const response = await api.get('/apps');
    return response.data;
  },

  getAllDeployments: async () => {
    const response = await api.get('/apps/deployments/all');
    return response.data;
  },

  getOrphanedApps: async () => {
    const response = await api.get('/apps/orphaned');
    return response.data;
  },

  getApp: async (id) => {
    const response = await api.get(`/apps/${id}`);
    // Parse JSON fields if they're strings
    const app = response.data;
    if (app.ports && typeof app.ports === 'string') {
      app.ports = JSON.parse(app.ports);
    }
    if (app.env_vars && typeof app.env_vars === 'string') {
      app.env_vars = JSON.parse(app.env_vars);
    }
    if (app.volumes && typeof app.volumes === 'string') {
      app.volumes = JSON.parse(app.volumes);
    }
    return app;
  },

  createApp: async (data) => {
    const response = await api.post('/apps', data);
    return response.data;
  },

  updateApp: async (id, data) => {
    const response = await api.put(`/apps/${id}`, data);
    return response.data;
  },

  deleteApp: async (id) => {
    const response = await api.delete(`/apps/${id}`);
    return response.data;
  },

  // Deployment related endpoints
  getDeployments: async (appId) => {
    const response = await api.get(`/apps/${appId}/deployments`);
    return response.data;
  },

  checkPorts: async (appId, serverId, ports, excludeDeploymentId = null) => {
    const response = await api.post(`/apps/${appId}/check-ports`, { serverId, ports, excludeDeploymentId });
    return response.data;
  },

  removeDeployment: async (appId, deploymentId, force = false) => {
    const url = force 
      ? `/apps/${appId}/deployments/${deploymentId}?force=true`
      : `/apps/${appId}/deployments/${deploymentId}`;
    const response = await api.delete(url);
    return response.data;
  },

  getDeploymentStats: async (appId, deploymentId) => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}/stats`);
    return response.data;
  },

  getDeploymentLogs: async (appId, deploymentId, lines = 100) => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}/logs`, { params: { lines } });
    return response.data;
  },

  startDeployment: async (appId, deploymentId) => {
    const response = await api.post(`/apps/${appId}/deployments/${deploymentId}/start`);
    return response.data;
  },

  stopDeployment: async (appId, deploymentId) => {
    const response = await api.post(`/apps/${appId}/deployments/${deploymentId}/stop`);
    return response.data;
  },

  getDeployment: async (appId, deploymentId) => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}`);
    const deployment = response.data;
    // Parse JSON fields if they're strings
    if (deployment.port_mappings && typeof deployment.port_mappings === 'string') {
      deployment.port_mappings = JSON.parse(deployment.port_mappings);
    }
    if (deployment.env_vars && typeof deployment.env_vars === 'string') {
      deployment.env_vars = JSON.parse(deployment.env_vars);
    }
    if (deployment.volumes && typeof deployment.volumes === 'string') {
      deployment.volumes = JSON.parse(deployment.volumes);
    }
    // Parse app_config JSON fields too
    if (deployment.app_config) {
      if (deployment.app_config.ports && typeof deployment.app_config.ports === 'string') {
        deployment.app_config.ports = JSON.parse(deployment.app_config.ports);
      }
      if (deployment.app_config.env_vars && typeof deployment.app_config.env_vars === 'string') {
        deployment.app_config.env_vars = JSON.parse(deployment.app_config.env_vars);
      }
      if (deployment.app_config.volumes && typeof deployment.app_config.volumes === 'string') {
        deployment.app_config.volumes = JSON.parse(deployment.app_config.volumes);
      }
    }
    return deployment;
  },

  updateDeployment: async (appId, deploymentId, config) => {
    const response = await api.put(`/apps/${appId}/deployments/${deploymentId}`, config);
    return response.data;
  },
};
