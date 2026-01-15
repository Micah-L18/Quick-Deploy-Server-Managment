import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serversService } from '../api/servers';
import { filesService } from '../api/files';
import FileEditor from './FileEditor';
import Modal from './Modal';
import styles from './FileBrowser.module.css';

const FileBrowser = ({ serverId }) => {
  const [currentPath, setCurrentPath] = useState('/home');
  const [selectedFile, setSelectedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchWholeSystem, setSearchWholeSystem] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

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
            {/* <div className={styles.permColumn}>Permissions</div> */}
          </div>
          {filteredFiles.map((file, index) => (
            <div
              key={index}
              className={`${styles.fileRow} ${file.isDirectory ? styles.directory : styles.file} ${!file.isDirectory && isFileSelected(file.name) ? styles.selected : ''}`}
              onClick={() => handleNavigate(file)}
              title={file.isDirectory ? 'Open directory' : 'Open file in editor'}
            >
              <div className={styles.nameColumn}>
                <span className={styles.icon}>
                  {file.isDirectory ? '📁' : '📄'}
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
              {/* <div className={styles.permColumn}>
                {file.permissions || '-'}
              </div> */}
            </div>
          ))}
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
                <span className={styles.placeholderIcon}>📝</span>
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
    </div>
  );
};

export default FileBrowser;
