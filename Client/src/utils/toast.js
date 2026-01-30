import { toast } from 'react-toastify';

/**
 * Global toast notification utility
 * Provides consistent toast notifications across the application
 */

const defaultOptions = {
  position: 'bottom-right',
  autoClose: 4000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

export const showSuccess = (message, options = {}) => {
  return toast.success(message, { ...defaultOptions, ...options });
};

export const showError = (message, options = {}) => {
  return toast.error(message, { ...defaultOptions, autoClose: 6000, ...options });
};

export const showWarning = (message, options = {}) => {
  return toast.warn(message, { ...defaultOptions, ...options });
};

export const showInfo = (message, options = {}) => {
  return toast.info(message, { ...defaultOptions, ...options });
};

/**
 * Show a "Copied!" notification
 */
export const showCopied = (label = 'Copied to clipboard') => {
  return toast.success(label, {
    ...defaultOptions,
    autoClose: 2000,
    icon: '📋',
  });
};

/**
 * Parse and show an API error
 */
export const showApiError = (error, fallbackMessage = 'An error occurred') => {
  const message = 
    error?.response?.data?.error || 
    error?.response?.data?.message || 
    error?.message || 
    fallbackMessage;
  return showError(message);
};

/**
 * Show a loading toast that can be updated later
 */
export const showLoading = (message = 'Loading...') => {
  return toast.loading(message, {
    position: 'bottom-right',
  });
};

/**
 * Update an existing toast (useful for loading -> success/error flows)
 */
export const updateToast = (toastId, { type, message, ...options }) => {
  toast.update(toastId, {
    render: message,
    type,
    isLoading: false,
    autoClose: 4000,
    ...options,
  });
};

/**
 * Dismiss a specific toast or all toasts
 */
export const dismissToast = (toastId) => {
  if (toastId) {
    toast.dismiss(toastId);
  } else {
    toast.dismiss();
  }
};

const toastUtils = {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  copied: showCopied,
  apiError: showApiError,
  loading: showLoading,
  update: updateToast,
  dismiss: dismissToast,
};

export default toastUtils;
