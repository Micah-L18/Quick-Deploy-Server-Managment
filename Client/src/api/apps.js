import api from './axiosConfig';

export const appsService = {
  getApps: async () => {
    const response = await api.get('/apps');
    return response.data;
  },

  getApp: async (id) => {
    const response = await api.get(`/apps/${id}`);
    return response.data;
  },

  createApp: async (data) => {
    const response = await api.post('/apps', data);
    return response.data;
  },

  deleteApp: async (id) => {
    const response = await api.delete(`/apps/${id}`);
    return response.data;
  },
};
