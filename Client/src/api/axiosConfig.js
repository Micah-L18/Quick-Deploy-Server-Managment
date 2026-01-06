import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3044';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect if not already on login/register page and not checking auth
      const isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/register';
      const isAuthCheck = error.config?.url?.includes('/auth/me');
      
      if (!isAuthPage && !isAuthCheck) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
