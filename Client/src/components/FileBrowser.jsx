import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serversService } from '../api/servers';
import styles from './FileBrowser.module.css';

const FileBrowser = ({ serverId }) => {
  const [currentPath, setCurrentPath] = useState('/');

  const { data: filesData, isLoading, error, refetch } = useQuery({
    queryKey: ['server-files', serverId, currentPath],
    queryFn: () => serversService.listFiles(serverId, currentPath),
    enabled: !!serverId,
  });

  // Extract files array from response
  const files = filesData?.items || [];
  const displayPath = filesData?.path || currentPath;

  const handleNavigate = (item) => {
    if (item.isDirectory) {
      // Construct the full path
      const newPath = displayPath === '/' 
        ? '/' + item.name 
        : displayPath + '/' + item.name;
      setCurrentPath(newPath);
    }
  };

  const handleGoUp = () => {
    if (currentPath === '/') return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === '-') return '-';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className={styles.fileBrowser}>
      <div className={styles.header}>
        <div className={styles.pathBar}>
          <button
            className={styles.navButton}
            onClick={handleGoUp}
            disabled={currentPath === '/'}
          >
            ↑ Up
          </button>
          <span className={styles.currentPath}>{displayPath}</span>
          <button
            className={styles.refreshButton}
            onClick={() => refetch()}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className={styles.loading}>Loading files...</div>
      )}

      {error && (
        <div className={styles.error}>
          <p>Failed to load files: {error.message}</p>
          <button onClick={() => refetch()}>Try Again</button>
        </div>
      )}

      {!isLoading && !error && files && files.length > 0 && (
        <div className={styles.fileList}>
          <div className={styles.tableHeader}>
            <div className={styles.nameColumn}>Name</div>
            <div className={styles.sizeColumn}>Size</div>
            <div className={styles.dateColumn}>Modified</div>
            <div className={styles.permColumn}>Permissions</div>
          </div>
          {files.map((file, index) => (
            <div
              key={index}
              className={`${styles.fileRow} ${file.isDirectory ? styles.directory : ''}`}
              onClick={() => {
                if (file.isDirectory) {
                  handleNavigate(file);
                }
              }}
            >
              <div className={styles.nameColumn}>
                <span className={styles.icon}>
                  {file.isDirectory ? '📁' : '📄'}
                </span>
                {file.name}
              </div>
              <div className={styles.sizeColumn}>
                {file.isDirectory ? '-' : formatSize(file.size)}
              </div>
              <div className={styles.dateColumn}>
                {formatDate(file.modified)}
              </div>
              <div className={styles.permColumn}>
                {file.permissions || '-'}
              </div>
            </div>
          ))}
          {files.length === 0 && (
            <div className={styles.emptyState}>
              <p>This directory is empty</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileBrowser;
