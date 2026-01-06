export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'Just now';
  }
};

export const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '0m';
};

export const getFileIcon = (type, name) => {
  if (type === 'directory') return '📁';
  
  const ext = name.split('.').pop().toLowerCase();
  const iconMap = {
    js: '📜',
    json: '📋',
    html: '🌐',
    css: '🎨',
    py: '🐍',
    txt: '📄',
    md: '📝',
    pdf: '📕',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    zip: '📦',
    tar: '📦',
    gz: '📦',
  };

  return iconMap[ext] || '📄';
};

export const getRegionFlag = (region) => {
  const flags = {
    'us-east': '🇺🇸',
    'us-west': '🇺🇸',
    'eu-west': '🇪🇺',
    'eu-central': '🇪🇺',
    'asia-southeast': '🌏',
    'asia-east': '🌏',
  };
  return flags[region] || '🌍';
};
