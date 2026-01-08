import api from './axiosConfig';

export const appsService = {
  getApps: async () => {
    const response = await api.get('/apps');
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

  checkPorts: async (appId, serverId, ports) => {
    const response = await api.post(`/apps/${appId}/check-ports`, { serverId, ports });
    return response.data;
  },

  removeDeployment: async (appId, deploymentId) => {
    const response = await api.delete(`/apps/${appId}/deployments/${deploymentId}`);
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
};
