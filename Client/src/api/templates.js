import api from './axiosConfig';

export const templatesService = {
  /**
   * Get all templates with categories
   * @param {string} category - Optional category filter
   * @returns {Promise<{templates: Array, categories: Array}>}
   */
  getTemplates: async (category = null) => {
    const params = category ? { category } : {};
    const response = await api.get('/templates', { params });
    return response.data;
  },

  /**
   * Get a single template by ID
   * @param {string} id - Template ID
   * @returns {Promise<Object>} Template data
   */
  getTemplate: async (id) => {
    const response = await api.get(`/templates/${id}`);
    return response.data;
  },
};
