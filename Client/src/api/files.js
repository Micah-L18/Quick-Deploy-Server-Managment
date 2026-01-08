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

  writeFile: async (serverId, path, content) => {
    const response = await api.post(`/servers/${serverId}/files/write`, {
      path,
      content,
    });
    return response.data;
  },

  searchFiles: async (serverId, query, searchPath = '/home') => {
    const response = await api.get(`/servers/${serverId}/files/search`, {
      params: { q: query, path: searchPath },
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
