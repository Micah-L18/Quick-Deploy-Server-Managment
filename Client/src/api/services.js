import api from './axiosConfig';

export const servicesAPI = {
  getOSInfo: async (serverId) => {
    const response = await api.get(`/servers/${serverId}/os-info`);
    return response.data;
  },

  getServiceStatus: async (serverId, serviceName) => {
    const response = await api.get(`/servers/${serverId}/services/${serviceName}/status`);
    return response.data;
  },

  installService: async (serverId, serviceName) => {
    const response = await api.post(`/servers/${serverId}/services/${serviceName}/install`);
    return response.data;
  },

  manageService: async (serverId, serviceName, action) => {
    const response = await api.post(`/servers/${serverId}/services/${serviceName}/${action}`);
    return response.data;
  },
};
