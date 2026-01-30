import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { serversService } from '../api/servers';
import { filesService } from '../api/files';
import FileEditor from './FileEditor';
import Modal from './Modal';
import Button from './Button';
import ConfirmModal from './ConfirmModal';
import { useBackgroundJobs } from '../contexts/BackgroundJobsContext';
import { showSuccess, showError, showWarning, showInfo } from '../utils/toast';
import { FolderIcon, FileIcon } from './Icons';
import styles from './FileBrowser.module.css';

const FileBrowser = ({ serverId }) => {
  const { getSocketId } = useBackgroundJobs();
  const [currentPath, setCurrentPath] = useState('/home');
  const [selectedFile, setSelectedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchWholeSystem, setSearchWholeSystem] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCreateFileModal, setShowCreateFileModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [confirm, setConfirm] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [cancelTokenSource, setCancelTokenSource] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = React.useRef(null);

  // Detect mobile viewport
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { data: filesData, isLoading, error, refetch } = useQuery({
    queryKey: ['server-files', serverId, currentPath],
    queryFn: () => serversService.listFiles(serverId, currentPath),
    enabled: !!serverId,
  });

  // Extract files array from response
  const files = filesData?.items || [];
  const displayPath = filesData?.path || currentPath;

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsSearching(true);
        const searchPath = searchWholeSystem ? '/' : currentPath;
        const result = await filesService.searchFiles(serverId, searchQuery, searchPath);
        setSearchResults(result.results);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, serverId, currentPath, searchWholeSystem]);

  const handleNavigate = (item) => {
    // If item has a full path (from search results), use it directly
    if (item.path) {
      if (item.isDirectory) {
        setCurrentPath(item.path);
        setSearchQuery(''); // Clear search when navigating
        setSearchResults(null); // Clear search results
      } else {
        setSelectedFile(item.path);
      }
      return;
    }

    // Otherwise use the old logic for current directory items
    if (item.isDirectory) {
      // Construct the full path
      const newPath = displayPath === '/' 
        ? '/' + item.name 
        : displayPath + '/' + item.name;
      setCurrentPath(newPath);
    } else {
      // Open file in editor
      const filePath = displayPath === '/' 
        ? '/' + item.name 
        : displayPath + '/' + item.name;
      setSelectedFile(filePath);
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

  const isFileSelected = (fileName) => {
    if (!selectedFile) return false;
    const currentFilePath = displayPath === '/' 
      ? '/' + fileName 
      : displayPath + '/' + fileName;
    return selectedFile === currentFilePath;
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancelUpload = async () => {
    if (cancelTokenSource) {
      cancelTokenSource.cancel('Upload cancelled by user');
      setCancelTokenSource(null);
      
      // Clean up any uploaded files
      if (uploadedFiles.length > 0) {
        try {
          await filesService.deleteMultipleFiles(serverId, uploadedFiles);
          console.log(`Cleaned up ${uploadedFiles.length} partially uploaded files`);
        } catch (error) {
          console.error('Failed to clean up uploaded files:', error);
        }
      }
      
      setUploadedFiles([]);
      setIsUploading(false);
      setUploadProgress(null);
      
      showInfo('Upload cancelled and partial files removed.');
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const CancelToken = axios.CancelToken;
    const source = CancelToken.source();

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setCancelTokenSource(source);
      setUploadedFiles([]);

      const remotePath = currentPath === '/' 
        ? `/${file.name}` 
        : `${currentPath}/${file.name}`;

      const socketId = getSocketId();
      await filesService.uploadFile(
        serverId,
        remotePath,
        file,
        (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
        socketId,
        source.token
      );

      // Refresh file list after successful upload
      refetch();
      showSuccess(`File "${file.name}" uploaded successfully!`);
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log('Upload cancelled:', error.message);
        // Cancel handler already showed the alert
      } else {
        console.error('Upload failed:', error);
        showError(`Failed to upload file: ${error.message}`);
      }
    } finally {
      setCancelTokenSource(null);
      setUploadedFiles([]);
      setIsUploading(false);
      setUploadProgress(null);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadFile = async (file, event) => {
    event.stopPropagation(); // Prevent file opening in editor
    
    if (file.isDirectory) {
      showWarning('Cannot download directories. Please select a file.');
      return;
    }

    try {
      const filePath = file.path || (currentPath === '/' 
        ? `/${file.name}` 
        : `${currentPath}/${file.name}`);
      
      await filesService.downloadFile(serverId, filePath);
    } catch (error) {
      console.error('Download failed:', error);
      showError(`Failed to download file: ${error.message}`);
    }
  };

  const handleDeleteFile = async (file, event) => {
    event.stopPropagation(); // Prevent file opening in editor
    
    const filePath = file.path || (currentPath === '/' 
      ? `/${file.name}` 
      : `${currentPath}/${file.name}`);
    
    const itemType = file.isDirectory ? 'folder' : 'file';
    
    setConfirm({
      isOpen: true,
      title: `Delete ${itemType}?`,
      message: `Are you sure you want to delete this ${itemType}?\n\n${file.name}\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        try {
          const socketId = getSocketId();
          await filesService.deleteFile(serverId, filePath, file.isDirectory, socketId);
          refetch();
        } catch (error) {
          console.error('Delete failed:', error);
          showError(`Failed to delete ${itemType}: ${error.message}`);
        }
      }
    });
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) {
      showWarning('Please enter a file name');
      return;
    }

    try {
      const filePath = currentPath === '/' 
        ? `/${newFileName}` 
        : `${currentPath}/${newFileName}`;
      
      await filesService.createFile(serverId, filePath, '');
      refetch();
      setShowCreateFileModal(false);
      setNewFileName('');
      
      // Open the new file in editor
      setSelectedFile(filePath);
    } catch (error) {
      console.error('File creation failed:', error);
      showError(`Failed to create file: ${error.message}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      showWarning('Please enter a folder name');
      return;
    }

    try {
      const folderPath = currentPath === '/' 
        ? `/${newFolderName}` 
        : `${currentPath}/${newFolderName}`;
      
      await filesService.createDirectory(serverId, folderPath);
      refetch();
      setShowCreateFolderModal(false);
      setNewFolderName('');
    } catch (error) {
      console.error('Folder creation failed:', error);
      showError(`Failed to create folder: ${error.message}`);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, file) => {
    const filePath = file.path || (currentPath === '/' 
      ? `/${file.name}` 
      : `${currentPath}/${file.name}`);
    
    setDraggedItem({
      name: file.name,
      path: filePath,
      isDirectory: file.isDirectory
    });
    
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow drop on directories
    if (file.isDirectory) {
      e.dataTransfer.dropEffect = 'move';
      const targetPath = file.path || (currentPath === '/' 
        ? `/${file.name}` 
        : `${currentPath}/${file.name}`);
      setDropTarget(targetPath);
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDropTarget(null);
  };

  const handleDrop = async (e, targetFile) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem || !targetFile.isDirectory) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    const targetPath = targetFile.path || (currentPath === '/' 
      ? `/${targetFile.name}` 
      : `${currentPath}/${targetFile.name}`);

    // Don't allow dropping on itself
    if (draggedItem.path === targetPath) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    // Don't allow dropping a parent into its child
    if (targetPath.startsWith(draggedItem.path + '/')) {
      showWarning('Cannot move a folder into itself');
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    try {
      const newPath = `${targetPath}/${draggedItem.name}`;
      
      await filesService.moveFile(serverId, draggedItem.path, newPath);
      refetch();
    } catch (error) {
      console.error('Move failed:', error);
      showError(`Failed to move: ${error.message}`);
    } finally {
      setDraggedItem(null);
      setDropTarget(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTarget(null);
  };

  // Drop on "Up" button to move to parent directory
  const handleDropOnUp = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem || currentPath === '/') {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    const newPath = parentPath === '/' 
      ? `/${draggedItem.name}` 
      : `${parentPath}/${draggedItem.name}`;

    // Don't move if already in parent
    if (draggedItem.path === newPath) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    try {
      await filesService.moveFile(serverId, draggedItem.path, newPath);
      refetch();
    } catch (error) {
      console.error('Move failed:', error);
      showError(`Failed to move: ${error.message}`);
    } finally {
      setDraggedItem(null);
      setDropTarget(null);
    }
  };

  // Filter files based on search query
  const displayFiles = searchResults 
    ? searchResults 
    : files;

  const filteredFiles = searchResults
    ? searchResults // Already filtered by backend
    : files; // Show all files in current directory

  return (
    <div className={styles.fileBrowserContainer}>
      <div className={styles.fileBrowser}>
      <div className={styles.header}>
        {/* Path Navigation */}
        <div className={styles.pathNav}>
          <Button
            variant="outline"
            size="small"
            onClick={handleGoUp}
            disabled={currentPath === '/'}
            onDragOver={(e) => {
              if (currentPath !== '/') {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={handleDropOnUp}
            title="Go up one directory (or drop here to move to parent)"
          >
            ↑ Up
          </Button>
          <span className={styles.currentPath}>{displayPath}</span>
          <Button
            variant="outline"
            size="small"
            onClick={() => refetch()}
            title="Refresh file list"
          >
            ↻ Refresh
          </Button>
        </div>

        {/* Actions Bar */}
        <div className={styles.actionsBar}>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          {!isUploading ? (
            <Button
              variant="outline"
              size="small"
              onClick={handleUploadClick}
              title="Upload file to current directory"
            >
              📄 Upload File
            </Button>
          ) : (
            <div className={styles.uploadProgress}>
              <span>↑ {uploadProgress}% uploading...</span>
              <Button
                variant="danger"
                size="small"
                onClick={handleCancelUpload}
                title="Cancel upload and remove partial files"
              >
                ✕ Cancel
              </Button>
            </div>
          )}
          <Button
            variant="primary"
            size="small"
            onClick={() => setShowCreateFileModal(true)}
            title="Create new file"
          >
            ＋ New File
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={() => setShowCreateFolderModal(true)}
            title="Create new folder"
          >
            ＋ New Folder
          </Button>
        </div>

        {/* Search Bar */}
        <div className={styles.searchBar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={searchWholeSystem ? "🔍 Search entire system..." : "🔍 Search current folder..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles.clearSearch}
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
          <label className={styles.searchToggle} title="Search from root (/) instead of current directory">
            <input
              type="checkbox"
              checked={searchWholeSystem}
              onChange={(e) => setSearchWholeSystem(e.target.checked)}
            />
            <span>Whole system</span>
          </label>
        </div>
      </div>

      {isSearching && (
        <div className={styles.loading}>Searching...</div>
      )}

      {isLoading && !isSearching && (
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
            <div className={styles.nameColumn}>
              Name
              {searchQuery && (
                <span className={styles.resultCount}>
                  ({filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div className={styles.sizeColumn}>Size</div>
            <div className={styles.dateColumn}>Modified</div>
            <div className={styles.actionsColumn}>Actions</div>
            {/* <div className={styles.permColumn}>Permissions</div> */}
          </div>
          {filteredFiles.map((file, index) => {
            const filePath = file.path || (currentPath === '/' 
              ? `/${file.name}` 
              : `${currentPath}/${file.name}`);
            const isDroppable = file.isDirectory;
            const isDraggedOver = dropTarget === filePath;
            
            return (
            <div
              key={index}
              className={`${styles.fileRow} ${file.isDirectory ? styles.directory : styles.file} ${!file.isDirectory && isFileSelected(file.name) ? styles.selected : ''} ${isDraggedOver ? styles.dropTarget : ''}`}
              onClick={() => handleNavigate(file)}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, file)}
              onDragEnd={handleDragEnd}
              onDragOver={isDroppable ? (e) => handleDragOver(e, file) : undefined}
              onDragLeave={isDroppable ? handleDragLeave : undefined}
              onDrop={isDroppable ? (e) => handleDrop(e, file) : undefined}
              title={file.isDirectory ? 'Open directory (or drag files here)' : 'Open file in editor'}
            >
              <div className={styles.nameColumn}>
                <span className={styles.icon}>
                  {file.isDirectory ? <FolderIcon size={16} /> : <FileIcon size={16} />}
                </span>
                <div className={styles.nameWithPath}>
                  <div className={styles.fileName}>{file.name}</div>
                  {searchResults && file.directory && (
                    <div className={styles.filePath}>{file.directory}</div>
                  )}
                </div>
              </div>
              <div className={styles.sizeColumn}>
                {file.isDirectory ? '-' : formatSize(file.size)}
              </div>
              <div className={styles.dateColumn}>
                {formatDate(file.modified)}
              </div>
              <div className={styles.actionsColumn}>
                {!file.isDirectory && (
                  <button
                    className={styles.downloadBtn}
                    onClick={(e) => handleDownloadFile(file, e)}
                    title="Download file"
                  >
                    ↓
                  </button>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => handleDeleteFile(file, e)}
                  title={`Delete ${file.isDirectory ? 'folder' : 'file'}`}
                >
                  🗑️
                </button>
              </div>
              {/* <div className={styles.permColumn}>
                {file.permissions || '-'}
              </div> */}
            </div>
            );
          })}
          {filteredFiles.length === 0 && (
            <div className={styles.emptyState}>
              {searchQuery ? (
                <>
                  <p>No files or folders match "{searchQuery}"</p>
                  <button 
                    className={styles.clearSearchBtn}
                    onClick={() => setSearchQuery('')}
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <p>This directory is empty</p>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Desktop: side-by-side editor panel */}
      {!isMobile && (
        <div className={styles.editorPanel}>
          {selectedFile ? (
            <FileEditor
              serverId={serverId}
              filePath={selectedFile}
              onClose={() => setSelectedFile(null)}
            />
          ) : (
            <div className={styles.editorPlaceholder}>
              <div className={styles.placeholderContent}>
                <span className={styles.placeholderIcon}><FileIcon size={32} /></span>
                <h3>Select a text file to view and edit</h3>
                <p>Click on any file in the browser to open it here</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile: modal popup for file editor */}
      {isMobile && selectedFile && (
        <Modal
          isOpen={!!selectedFile}
          onClose={() => setSelectedFile(null)}
          title={selectedFile.split('/').pop()}
          size="large"
        >
          <div className={styles.mobileEditorModal}>
            <FileEditor
              serverId={serverId}
              filePath={selectedFile}
              onClose={() => setSelectedFile(null)}
            />
          </div>
        </Modal>
      )}

      {/* Create File Modal */}
      <Modal
        isOpen={showCreateFileModal}
        onClose={() => {
          setShowCreateFileModal(false);
          setNewFileName('');
        }}
        title="Create New File"
        size="small"
      >
        <div className={styles.modalContent}>
          <p className={styles.modalDescription}>
            Create a new file in <strong>{currentPath}</strong>
          </p>
          <input
            type="text"
            className={styles.modalInput}
            placeholder="filename.txt"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateFile()}
            autoFocus
          />
          <div className={styles.modalButtons}>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateFileModal(false);
                setNewFileName('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateFile}
            >
              Create File
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Folder Modal */}
      <Modal
        isOpen={showCreateFolderModal}
        onClose={() => {
          setShowCreateFolderModal(false);
          setNewFolderName('');
        }}
        title="Create New Folder"
        size="small"
      >
        <div className={styles.modalContent}>
          <p className={styles.modalDescription}>
            Create a new folder in <strong>{currentPath}</strong>
          </p>
          <input
            type="text"
            className={styles.modalInput}
            placeholder="folder-name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
          />
          <div className={styles.modalButtons}>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateFolderModal(false);
                setNewFolderName('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateFolder}
            >
              Create Folder
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirm.isOpen}
        onClose={() => setConfirm({ ...confirm, isOpen: false })}
        onConfirm={confirm.onConfirm}
        title={confirm.title}
        message={confirm.message}
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
};

export default FileBrowser;
