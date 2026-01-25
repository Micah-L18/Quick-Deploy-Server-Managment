import api from './axiosConfig';

export const uploadsService = {
  uploadIcon: async (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('icon', file);

    const response = await api.post('/uploads/icons', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    return response.data;
  },

  deleteIcon: async (iconUrl) => {
    const response = await api.delete('/uploads/icons', {
      data: { iconUrl },
    });
    return response.data;
  },

  getStorageInfo: async () => {
    const response = await api.get('/uploads/storage-info');
    return response.data;
  },

  listIcons: async () => {
    const response = await api.get('/uploads/icons');
    return response.data;
  },

  renameIcon: async (oldIconUrl, newFilename) => {
    const response = await api.put('/uploads/icons/rename', {
      oldIconUrl,
      newFilename,
    });
    return response.data;
  },
};
