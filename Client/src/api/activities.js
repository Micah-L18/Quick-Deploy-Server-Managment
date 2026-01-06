import api from './axiosConfig';

export const activitiesService = {
  getActivities: async (limit = 10) => {
    const response = await api.get('/activities', {
      params: { limit },
    });
    return response.data;
  },

  addActivity: async (data) => {
    const response = await api.post('/activities', data);
    return response.data;
  },
};
