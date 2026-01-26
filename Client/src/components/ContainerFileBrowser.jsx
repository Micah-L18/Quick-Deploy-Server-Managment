import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from './Modal';
import Button from './Button';
import { FolderIcon, FileIcon, XIcon, ChevronRightIcon, AlertIcon, RefreshIcon } from './Icons';
import { appsService } from '../api/apps';
import styles from './ContainerFileBrowser.module.css';

const ContainerFileBrowser = ({ appId, deploymentId, containerStatus }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileModal, setShowFileModal] = useState(false);

  // Fetch file list for current path
  const { data: fileData, isLoading, error, refetch } = useQuery({
    queryKey: ['container-files', appId, deploymentId, currentPath],
    queryFn: () => appsService.getContainerFiles(appId, deploymentId, currentPath),
    staleTime: 10000,
  });

  // Fetch file content when file is selected
  const { data: fileContent, isLoading: loadingContent } = useQuery({
    queryKey: ['container-file-content', appId, deploymentId, selectedFile],
    queryFn: () => appsService.readContainerFile(appId, deploymentId, selectedFile),
    enabled: !!selectedFile && showFileModal,
  });

  // Generate breadcrumb from path
  const getBreadcrumbs = () => {
    if (currentPath === '/') return [{ name: 'root', path: '/' }];
    
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'root', path: '/' }];
    
    let buildPath = '';
    parts.forEach(part => {
      buildPath += `/${part}`;
      breadcrumbs.push({ name: part, path: buildPath });
    });
    
    return breadcrumbs;
  };

  const handleFileClick = (file) => {
    if (file.isDirectory) {
      // Navigate to directory
      const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      setCurrentPath(newPath);
    } else {
      // Open file viewer
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      setSelectedFile(filePath);
      setShowFileModal(true);
    }
  };

  const handleBreadcrumbClick = (path) => {
    setCurrentPath(path);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setSelectedFile(null);
  };

  return (
    <div className={styles.container}>
      {/* Breadcrumb Navigation */}
      <div className={styles.breadcrumb}>
        {getBreadcrumbs().map((crumb, idx) => (
          <React.Fragment key={crumb.path}>
            {idx > 0 && <ChevronRightIcon size={14} className={styles.breadcrumbSeparator} />}
            <button
              className={styles.breadcrumbItem}
              onClick={() => handleBreadcrumbClick(crumb.path)}
              disabled={crumb.path === currentPath}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
        <div className={styles.breadcrumbActions}>
          <Button
            variant="outline"
            size="small"
            onClick={() => refetch()}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshIcon size={16} />
          </Button>
        </div>
      </div>

      {/* Volume Access Message */}
      {fileData?._volumeAccess && fileData?._message && (
        <div className={styles.infoMessage}>
          <AlertIcon size={16} />
          <span>{fileData._message}</span>
        </div>
      )}

      {/* File List */}
      {error && (
        <div className={styles.error}>
          <AlertIcon size={20} />
          <span>{error.response?.data?.error || error.message || 'Failed to load files'}</span>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loading}>Loading files...</div>
      ) : fileData?.files && fileData.files.length > 0 ? (
        <div className={styles.fileList}>
          <div className={styles.fileHeader}>
            <div className={styles.fileHeaderName}>Name</div>
            <div className={styles.fileHeaderSize}>Size</div>
            <div className={styles.fileHeaderModified}>Modified</div>
            <div className={styles.fileHeaderPermissions}>Permissions</div>
          </div>
          {fileData.files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className={styles.fileRow}
              onClick={() => handleFileClick(file)}
            >
              <div className={styles.fileName}>
                {file.isDirectory ? (
                  <FolderIcon size={18} className={styles.folderIcon} />
                ) : (
                  <FileIcon size={18} className={styles.fileIcon} />
                )}
                <span>{file.name}</span>
                {file.isSymlink && <span className={styles.symlinkBadge}>→</span>}
              </div>
              <div className={styles.fileSize}>
                {file.isDirectory ? '-' : formatSize(file.size)}
              </div>
              <div className={styles.fileModified}>{file.modified}</div>
              <div className={styles.filePermissions}>
                <code>{file.permissions}</code>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyDirectory}>
          <FolderIcon size={48} />
          <p>This directory is empty</p>
        </div>
      )}

      {/* File Viewer Modal */}
      {showFileModal && (
        <Modal isOpen={showFileModal} onClose={closeFileModal} title={selectedFile} size="large">
          <div className={styles.fileViewer}>
            {loadingContent ? (
              <div className={styles.loadingContent}>Loading file...</div>
            ) : fileContent?.content ? (
              <pre className={styles.fileContent}>{fileContent.content}</pre>
            ) : (
              <div className={styles.emptyContent}>Unable to load file content</div>
            )}
          </div>
          <div className={styles.fileViewerActions}>
            <Button variant="secondary" onClick={closeFileModal}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ContainerFileBrowser;
