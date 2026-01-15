import api from './axiosConfig';

export const serversService = {
  getServers: async () => {
    const response = await api.get('/servers');
    return response.data;
  },

  getServer: async (id) => {
    const response = await api.get(`/servers/${id}`);
    return response.data;
  },

  addServer: async (data) => {
    const response = await api.post('/servers', data);
    return response.data;
  },

  updateServer: async (id, data) => {
    const response = await api.put(`/servers/${id}`, data);
    return response.data;
  },

  deleteServer: async (id, force = false) => {
    const url = force ? `/servers/${id}?force=true` : `/servers/${id}`;
    const response = await api.delete(url);
    return response.data;
  },

  checkStatus: async (id) => {
    const response = await api.get(`/servers/${id}/status`);
    return response.data;
  },

  checkAllStatus: async () => {
    const response = await api.get('/servers/status/all');
    return response.data;
  },

  getMetrics: async (id) => {
    const response = await api.get(`/servers/${id}/metrics`);
    return response.data;
  },

  getMetricsHistory: async (id, hours = 24) => {
    const response = await api.get(`/servers/${id}/metrics/history?hours=${hours}`);
    return response.data;
  },

  listFiles: async (id, path = '/root') => {
    const response = await api.get(`/servers/${id}/files?path=${encodeURIComponent(path)}`);
    return response.data;
  },

  checkDockerStatus: async (id) => {
    const response = await api.get(`/servers/${id}/docker-status`);
    return response.data;
  },

  getAllTags: async () => {
    const response = await api.get('/servers/tags');
    return response.data;
  },
};