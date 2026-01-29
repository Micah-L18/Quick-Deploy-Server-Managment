import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from './Modal';
import Button from './Button';
import { FolderIcon, FileIcon, XIcon, ChevronRightIcon, AlertIcon, RefreshIcon, EditIcon, SaveIcon, DownloadIcon } from './Icons';
import { appsService } from '../api/apps';
import { useBackgroundJobs } from '../contexts/BackgroundJobsContext';
import styles from './ContainerFileBrowser.module.css';

// 50MB threshold for large file warning
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;
// 5MB threshold for using background job tracker
const BACKGROUND_JOB_THRESHOLD = 5 * 1024 * 1024;

const ContainerFileBrowser = ({ appId, deploymentId, containerStatus, appName }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileModal, setShowFileModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const queryClient = useQueryClient();
  const { startDownloadJob, updateDownloadProgress, completeDownloadJob } = useBackgroundJobs();

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

  // Save file mutation
  const saveFileMutation = useMutation({
    mutationFn: ({ path, content }) => appsService.writeContainerFile(appId, deploymentId, path, content),
    onSuccess: () => {
      // Invalidate file content cache to refresh
      queryClient.invalidateQueries(['container-file-content', appId, deploymentId, selectedFile]);
      setIsEditing(false);
    },
  });

  // Handle file download
  const handleDownload = async (filePath, isDirectory = false, e) => {
    if (e) {
      e.stopPropagation(); // Prevent row click from triggering navigation
    }
    
    setDownloadError(null);
    const fileName = filePath.split('/').pop() || 'download';
    
    try {
      // Get file info to check size
      const info = await appsService.getContainerFileInfo(appId, deploymentId, filePath);
      
      if (!info.exists) {
        setDownloadError('File or directory not found');
        return;
      }
      
      // For large files (>50MB), show confirmation
      if (info.size > LARGE_FILE_THRESHOLD) {
        const sizeMB = Math.round(info.size / (1024 * 1024));
        const confirmed = window.confirm(
          `This ${info.isDirectory ? 'directory' : 'file'} is ${sizeMB}MB. Large downloads may take a while. Continue?`
        );
        if (!confirmed) {
          return;
        }
      }
      
      // For files > 5MB, use background job tracking
      if (info.size > BACKGROUND_JOB_THRESHOLD) {
        // Start background job with total size
        const jobId = startDownloadJob(fileName, appName || 'Container', info.isDirectory || isDirectory, info.size);
        
        try {
          const { blob, filename } = await appsService.downloadContainerFileWithProgress(
            appId,
            deploymentId,
            filePath,
            info.isDirectory || isDirectory,
            (percent, loaded, total) => {
              updateDownloadProgress(jobId, percent, loaded, total);
            }
          );
          
          // Trigger browser download
          appsService.triggerBlobDownload(blob, filename);
          completeDownloadJob(jobId, true);
        } catch (error) {
          console.error('Download failed:', error);
          completeDownloadJob(jobId, false, error.message);
          setDownloadError(error.message || 'Download failed');
        }
      } else {
        // For small files, use simple download with inline progress
        setDownloadingFile(filePath);
        
        try {
          const { blob, filename } = await appsService.downloadContainerFile(
            appId, 
            deploymentId, 
            filePath, 
            info.isDirectory || isDirectory
          );
          
          appsService.triggerBlobDownload(blob, filename);
        } catch (error) {
          console.error('Download failed:', error);
          setDownloadError(error.response?.data?.error || error.message || 'Download failed');
        } finally {
          setDownloadingFile(null);
        }
      }
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadError(error.response?.data?.error || error.message || 'Download failed');
      setDownloadingFile(null);
    }
  };

  // Handle bulk download of current directory
  const handleBulkDownload = async () => {
    await handleDownload(currentPath, true);
  };

  // Update edited content when file content loads
  useEffect(() => {
    if (fileContent?.content) {
      setEditedContent(fileContent.content);
    }
  }, [fileContent?.content]);

  // Reset edit state when modal closes
  useEffect(() => {
    if (!showFileModal) {
      setIsEditing(false);
      setEditedContent('');
    }
  }, [showFileModal]);

  const isRunning = containerStatus === 'running';
  const hasChanges = editedContent !== fileContent?.content;

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
            onClick={handleBulkDownload}
            disabled={isLoading || downloadingFile === currentPath}
            title="Download current directory as archive"
          >
            <DownloadIcon size={16} />
            {downloadingFile === currentPath ? 'Downloading...' : 'Download All'}
          </Button>
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

      {/* Download Error Message */}
      {downloadError && (
        <div className={styles.error}>
          <AlertIcon size={16} />
          <span>Download failed: {downloadError}</span>
          <button 
            className={styles.dismissError} 
            onClick={() => setDownloadError(null)}
            title="Dismiss"
          >
            <XIcon size={14} />
          </button>
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
            <div className={styles.fileHeaderActions}>Actions</div>
          </div>
          {fileData.files.map((file, idx) => {
            const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
            const isDownloading = downloadingFile === filePath;
            
            return (
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
                <div className={styles.fileActions}>
                  <button
                    className={styles.actionButton}
                    onClick={(e) => handleDownload(filePath, file.isDirectory, e)}
                    disabled={isDownloading}
                    title={file.isDirectory ? 'Download as archive' : 'Download file'}
                  >
                    {isDownloading ? (
                      <span className={styles.spinner} />
                    ) : (
                      <DownloadIcon size={16} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
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
            ) : isEditing ? (
              <textarea
                className={styles.fileEditor}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                spellCheck={false}
              />
            ) : fileContent?.content ? (
              <pre className={styles.fileContent}>{fileContent.content}</pre>
            ) : (
              <div className={styles.emptyContent}>Unable to load file content</div>
            )}
          </div>
          <div className={styles.fileViewerActions}>
            {!isEditing && (
              <>
                <Button
                  variant="outline"
                  onClick={(e) => handleDownload(selectedFile, false, e)}
                  disabled={downloadingFile === selectedFile}
                  title="Download file"
                >
                  <DownloadIcon size={16} />
                  {downloadingFile === selectedFile ? 'Downloading...' : 'Download'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  disabled={isRunning}
                  title={isRunning ? 'Cannot edit files while container is running' : 'Edit file'}
                >
                  <EditIcon size={16} />
                  Edit
                </Button>
              </>
            )}
            {isEditing && hasChanges && (
              <Button
                variant="primary"
                onClick={() => saveFileMutation.mutate({ path: selectedFile, content: editedContent })}
                disabled={saveFileMutation.isPending}
              >
                <SaveIcon size={16} />
                {saveFileMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            )}
            {isEditing && (
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setEditedContent(fileContent?.content || '');
                }}
              >
                Cancel
              </Button>
            )}
            {!isEditing && (
              <Button variant="secondary" onClick={closeFileModal}>
                Close
              </Button>
            )}
          </div>
          {saveFileMutation.isError && (
            <div className={styles.saveError}>
              <AlertIcon size={16} />
              {saveFileMutation.error?.response?.data?.error || 'Failed to save file'}
            </div>
          )}
          {saveFileMutation.isSuccess && (
            <div className={styles.saveSuccess}>
              File saved successfully!
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default ContainerFileBrowser;
