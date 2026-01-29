import api from './axiosConfig';

export const appsService = {
  getApps: async () => {
    const response = await api.get('/apps');
    return response.data;
  },

  getAllDeployments: async () => {
    const response = await api.get('/apps/deployments/all');
    return response.data;
  },

  getOrphanedApps: async () => {
    const response = await api.get('/apps/orphaned');
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

  getDeployment: async (appId, deploymentId) => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}`);
    return response.data;
  },

  checkPorts: async (appId, serverId, ports) => {
    const response = await api.post(`/apps/${appId}/check-ports`, { serverId, ports });
    return response.data;
  },

  removeDeployment: async (appId, deploymentId, force = false) => {
    const url = force 
      ? `/apps/${appId}/deployments/${deploymentId}?force=true`
      : `/apps/${appId}/deployments/${deploymentId}`;
    const response = await api.delete(url);
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

  updateDeployment: async (appId, deploymentId, config) => {
    const response = await api.put(`/apps/${appId}/deployments/${deploymentId}`, config);
    return response.data;
  },

  // Container file browsing
  getContainerFiles: async (appId, deploymentId, path = '/') => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}/files`, {
      params: { path }
    });
    return response.data;
  },

  readContainerFile: async (appId, deploymentId, path) => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}/files/read`, {
      params: { path }
    });
    return response.data;
  },

  writeContainerFile: async (appId, deploymentId, path, content) => {
    const response = await api.put(`/apps/${appId}/deployments/${deploymentId}/files/write`, {
      path,
      content
    });
    return response.data;
  },

  // Get file/directory info (for size check before download)
  getContainerFileInfo: async (appId, deploymentId, path) => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}/files/info`, {
      params: { path }
    });
    return response.data;
  },

  // Download single file or directory from container
  // Returns a blob for browser download
  downloadContainerFile: async (appId, deploymentId, path, bulk = false) => {
    const response = await api.get(`/apps/${appId}/deployments/${deploymentId}/files/download`, {
      params: { path, bulk: bulk ? 'true' : 'false' },
      responseType: 'blob'
    });
    
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = path.split('/').pop() || 'download';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
      if (match) {
        filename = match[1];
      }
    }
    
    return {
      blob: response.data,
      filename,
      size: parseInt(response.headers['x-file-size']) || 0,
      isLarge: response.headers['x-is-large'] === 'true'
    };
  },

  // Download with progress tracking (for large files)
  // Uses XMLHttpRequest for progress events
  downloadContainerFileWithProgress: (appId, deploymentId, path, bulk = false, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const baseUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';
      const url = `${baseUrl}/api/apps/${appId}/deployments/${deploymentId}/files/download?path=${encodeURIComponent(path)}&bulk=${bulk ? 'true' : 'false'}`;
      
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.withCredentials = true;
      
      // Track download progress
      xhr.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = (event.loaded / event.total) * 100;
          onProgress(percent, event.loaded, event.total);
        } else if (onProgress) {
          // If content-length not available, show indeterminate progress
          onProgress(-1, event.loaded, 0);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Extract filename from Content-Disposition header
          const contentDisposition = xhr.getResponseHeader('content-disposition');
          let filename = path.split('/').pop() || 'download';
          if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
            if (match) {
              filename = match[1];
            }
          }
          
          resolve({
            blob: xhr.response,
            filename,
            size: parseInt(xhr.getResponseHeader('x-file-size')) || 0
          });
        } else {
          // Try to parse error from blob
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const error = JSON.parse(reader.result);
              reject(new Error(error.error || 'Download failed'));
            } catch {
              reject(new Error(`Download failed: ${xhr.status}`));
            }
          };
          reader.onerror = () => reject(new Error(`Download failed: ${xhr.status}`));
          reader.readAsText(xhr.response);
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error during download'));
      xhr.onabort = () => reject(new Error('Download cancelled'));
      
      xhr.send();
      
      // Return abort function for cancellation
      return () => xhr.abort();
    });
  },

  // Helper to trigger browser download from blob
  triggerBlobDownload: (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
