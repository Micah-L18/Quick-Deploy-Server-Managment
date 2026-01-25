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
    const response = await api.put(`/servers/${serverId}/files/write`, {
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

  uploadFile: async (serverId, remotePath, file, onUploadProgress, socketId, cancelToken) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', remotePath);

    const params = {};
    if (socketId) {
      params.socketId = socketId;
    }

    const response = await api.post(`/servers/${serverId}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
      params,
      cancelToken,
    });
    return response.data;
  },

  uploadFolder: async (serverId, basePath, files, onUploadProgress, socketId, cancelToken, onFileUploaded) => {
    const formData = new FormData();
    
    // Add all files with their relative paths
    for (const file of files) {
      formData.append('files', file, file.webkitRelativePath || file.name);
    }
    formData.append('basePath', basePath);

    const params = {};
    if (socketId) {
      params.socketId = socketId;
    }

    const response = await api.post(`/servers/${serverId}/files/upload-multiple`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
      params,
      cancelToken,
    });
    return response.data;
  },

  createFile: async (serverId, path, content = '') => {
    return filesService.writeFile(serverId, path, content);
  },

  createDirectory: async (serverId, path) => {
    const response = await api.post(`/servers/${serverId}/files/mkdir`, {
      path,
    });
    return response.data;
  },

  moveFile: async (serverId, oldPath, newPath) => {
    const response = await api.post(`/servers/${serverId}/files/rename`, {
      oldPath,
      newPath,
    });
    return response.data;
  },

  deleteFile: async (serverId, path, isDirectory = false, socketId) => {
    const params = { path, isDirectory };
    if (socketId) {
      params.socketId = socketId;
    }

    const response = await api.delete(`/servers/${serverId}/files`, {
      params,
    });
    return response.data;
  },

  deleteMultipleFiles: async (serverId, paths) => {
    // Delete files sequentially to avoid overwhelming the server
    const results = [];
    for (const path of paths) {
      try {
        await filesService.deleteFile(serverId, path, false);
        results.push({ path, success: true });
      } catch (error) {
        results.push({ path, success: false, error: error.message });
      }
    }
    return results;
  },

  downloadFile: async (serverId, remotePath) => {
    const response = await api.get(`/servers/${serverId}/files/download`, {
      params: { path: remotePath },
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', remotePath.split('/').pop());
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return response.data;
  },
};
