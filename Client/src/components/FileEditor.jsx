import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesService } from '../api/files';
import { CheckIcon, AlertIcon } from './Icons';
import styles from './FileEditor.module.css';

const FileEditor = ({ serverId, filePath, onClose }) => {
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const queryClient = useQueryClient();

  const { data: fileData, isLoading, error } = useQuery({
    queryKey: ['file-content', serverId, filePath],
    queryFn: () => filesService.readFile(serverId, filePath),
    enabled: !!serverId && !!filePath,
  });

  useEffect(() => {
    if (fileData?.content !== undefined) {
      setContent(fileData.content);
      setIsDirty(false);
    }
  }, [fileData]);

  const saveMutation = useMutation({
    mutationFn: () => filesService.writeFile(serverId, filePath, content),
    onSuccess: () => {
      setIsDirty(false);
      setSaveStatus('success');
      // Invalidate the file query to refresh the content
      queryClient.invalidateQueries(['file-content', serverId, filePath]);
      setTimeout(() => setSaveStatus(null), 3000);
    },
    onError: (error) => {
      setSaveStatus('error');
      console.error('Failed to save file:', error);
      setTimeout(() => setSaveStatus(null), 5000);
    },
  });

  const handleContentChange = (e) => {
    setContent(e.target.value);
    setIsDirty(true);
    setSaveStatus(null);
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleClose = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isDirty) {
        handleSave();
      }
    }
  };

  // Get file extension for syntax hints
  const getFileExtension = () => {
    if (!filePath) return '';
    const parts = filePath.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  };

  const fileExtension = getFileExtension();

  return (
    <div className={styles.fileEditor}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{filePath?.split('/').pop()}</span>
            <span className={styles.filePath}>{filePath}</span>
          </div>
          {fileExtension && (
            <span className={styles.fileExtension}>{fileExtension}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          {isDirty && (
            <span className={styles.unsavedIndicator}>● Unsaved changes</span>
          )}
          {saveStatus === 'success' && (
            <span className={styles.saveSuccess}><CheckIcon size={16} /> Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className={styles.saveError}><AlertIcon size={16} /> Save failed</span>
          )}
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button className={styles.closeButton} onClick={handleClose}>
            ✕
          </button>
        </div>
      </div>

      <div className={styles.editorContainer}>
        {isLoading && (
          <div className={styles.loading}>Loading file...</div>
        )}

        {error && (
          <div className={styles.error}>
            <p>Failed to load file: {error.message}</p>
            <button onClick={() => queryClient.invalidateQueries(['file-content', serverId, filePath])}>
              Try Again
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <textarea
            className={styles.editor}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.lineCount}>
            {content.split('\n').length} lines
          </span>
          <span className={styles.charCount}>
            {content.length} characters
          </span>
        </div>
        <div className={styles.footerRight}>
          <span className={styles.hint}>Press Ctrl+S (Cmd+S) to save</span>
        </div>
      </div>
    </div>
  );
};

export default FileEditor;
