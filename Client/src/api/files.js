import api from './axiosConfig';

export const filesService = {
  listFiles: async (serverId, path = '/') => {
    const response = await api.get(`/servers/${serverId}/files`, {
      params: { path },
    });
    return response.data;
  },

  readFile: async (serverId, path) => {
    const response = await api.get(`/servers/${serverId}/files/read`, {
      params: { path },
    });
    return response.data;
  },

  getStats: async (serverId, path) => {
    const response = await api.get(`/servers/${serverId}/files/stats`, {
      params: { path },
    });
    return response.data;
  },
};
