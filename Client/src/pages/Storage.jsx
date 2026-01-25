import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import Button from '../components/Button';
import { TrashIcon, AlertIcon, UploadIcon, EditIcon } from '../components/Icons';
import { uploadsService } from '../api/uploads';
import * as snapshotsService from '../api/snapshots';
import api from '../api/axiosConfig';
import styles from './Storage.module.css';

const Storage = () => {
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const [confirm, setConfirm] = useState({ isOpen: false, type: '', data: null });
  const [activeTab, setActiveTab] = useState('overview');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const [renameModal, setRenameModal] = useState({ isOpen: false, iconUrl: null, currentName: '' });
  const [newIconName, setNewIconName] = useState('');

  // Fetch storage info
  const { data: storageInfo, isLoading: loadingStorage } = useQuery({
    queryKey: ['storage-info'],
    queryFn: uploadsService.getStorageInfo,
    staleTime: 30000, // 30 seconds
  });

  // Fetch icons
  const { data: icons = [], isLoading: loadingIcons } = useQuery({
    queryKey: ['uploaded-icons'],
    queryFn: uploadsService.listIcons,
    staleTime: 30000,
  });

  // Fetch snapshots with storage stats
  const { data: snapshotsData = { snapshots: [], stats: {} }, isLoading: loadingSnapshots } = useQuery({
    queryKey: ['snapshots-storage'],
    queryFn: async () => {
      const result = await snapshotsService.getAll();
      // result is already { snapshots, storage: {...} }
      return {
        snapshots: result.snapshots || [],
        stats: result.storage || {}
      };
    },
    staleTime: 30000,
  });

  // Upload icon mutation
  const uploadIconMutation = useMutation({
    mutationFn: (file) => uploadsService.uploadIcon(file, (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      setUploadProgress(percentCompleted);
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['uploaded-icons']);
      queryClient.invalidateQueries(['storage-info']);
      setUploadProgress(0);
      setAlert({
        isOpen: true,
        type: 'success',
        title: 'Success',
        message: 'Icon uploaded successfully',
      });
    },
    onError: (error) => {
      setUploadProgress(0);
      setAlert({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.response?.data?.error || 'Failed to upload icon',
      });
    },
  });

  // Rename icon mutation
  const renameIconMutation = useMutation({
    mutationFn: ({ oldIconUrl, newFilename }) => uploadsService.renameIcon(oldIconUrl, newFilename),
    onSuccess: () => {
      queryClient.invalidateQueries(['uploaded-icons']);
      setRenameModal({ isOpen: false, iconUrl: null, currentName: '' });
      setNewIconName('');
      setAlert({
        isOpen: true,
        type: 'success',
        title: 'Success',
        message: 'Icon renamed successfully',
      });
    },
    onError: (error) => {
      setAlert({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.response?.data?.error || 'Failed to rename icon',
      });
    },
  });

  // Delete icon mutation
  const deleteIconMutation = useMutation({
    mutationFn: (iconUrl) => uploadsService.deleteIcon(iconUrl),
    onSuccess: () => {
      queryClient.invalidateQueries(['uploaded-icons']);
      queryClient.invalidateQueries(['storage-info']);
      setAlert({
        isOpen: true,
        type: 'success',
        title: 'Success',
        message: 'Icon deleted successfully',
      });
    },
    onError: (error) => {
      setAlert({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.response?.data?.error || 'Failed to delete icon',
      });
    },
  });

  // Delete snapshot mutation
  const deleteSnapshotMutation = useMutation({
    mutationFn: (snapshotId) => snapshotsService.remove(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries(['snapshots-storage']);
      queryClient.invalidateQueries(['storage-info']);
      setAlert({
        isOpen: true,
        type: 'success',
        title: 'Success',
        message: 'Snapshot deleted successfully',
      });
    },
    onError: (error) => {
      setAlert({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.response?.data?.error || 'Failed to delete snapshot',
      });
    },
  });

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setAlert({
        isOpen: true,
        type: 'error',
        title: 'Invalid File Type',
        message: 'Please upload an image file (JPEG, PNG, GIF, WebP, or SVG)',
      });
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setAlert({
        isOpen: true,
        type: 'error',
        title: 'File Too Large',
        message: 'Icon must be less than 5MB',
      });
      return;
    }

    uploadIconMutation.mutate(file);
  };

  const handleRenameIcon = (iconUrl, fileName) => {
    // Remove extension for editing
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    setNewIconName(nameWithoutExt);
    setRenameModal({
      isOpen: true,
      iconUrl,
      currentName: fileName,
    });
  };

  const handleConfirmRename = () => {
    if (!newIconName.trim()) {
      setAlert({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Filename cannot be empty',
      });
      return;
    }
    renameIconMutation.mutate({
      oldIconUrl: renameModal.iconUrl,
      newFilename: newIconName.trim(),
    });
  };

  const handleDeleteIcon = (iconUrl, fileName) => {
    setConfirm({
      isOpen: true,
      type: 'deleteIcon',
      data: { iconUrl, fileName },
    });
  };

  const handleDeleteSnapshot = (snapshotId, name) => {
    setConfirm({
      isOpen: true,
      type: 'deleteSnapshot',
      data: { snapshotId, name },
    });
  };

  const handleConfirm = () => {
    if (confirm.type === 'deleteIcon') {
      deleteIconMutation.mutate(confirm.data.iconUrl);
    } else if (confirm.type === 'deleteSnapshot') {
      deleteSnapshotMutation.mutate(confirm.data.snapshotId);
    }
  };

  const closeConfirm = () => {
    setConfirm({ isOpen: false, type: '', data: null });
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStoragePercentage = () => {
    if (!storageInfo?.total || storageInfo.total === 0) return 0;
    return Math.round((storageInfo.used / storageInfo.total) * 100);
  };

  const getStorageColor = () => {
    const percentage = getStoragePercentage();
    if (percentage > 80) return '#ff4444';
    if (percentage > 60) return '#ffaa00';
    return '#00d4ff';
  };

  return (
    <Layout>
      <div className={styles.storageContainer}>
        <div className={styles.header}>
          <h1>Storage Management</h1>
          <p className={styles.subtitle}>Monitor and manage your storage usage</p>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'overview' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'icons' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('icons')}
          >
            Icons ({icons.length || 0})
          </button>
          {/* <button
            className={`${styles.tab} ${activeTab === 'snapshots' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('snapshots')}
          >
            Snapshots ({snapshotsData.snapshots?.length || 0})
          </button> */}
        </div>

        {/* Content */}
        <div className={styles.tabContent}>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className={styles.overviewSection}>
              {loadingStorage ? (
                <div className={styles.loading}>Loading storage information...</div>
              ) : (
                <>
                  {/* Storage Bar */}
                  <div className={styles.storageCard}>
                    <h2>Disk Usage</h2>
                    <div className={styles.storageBarContainer}>
                      <div className={styles.storageLabel}>
                        <span>Used</span>
                        <span className={styles.storageValue}>
                          {formatBytes(storageInfo?.used || 0)}
                        </span>
                      </div>
                      <div
                        className={styles.storageBar}
                        style={{
                          background: `linear-gradient(90deg, ${getStorageColor()} ${getStoragePercentage()}%, #1a1f3a ${getStoragePercentage()}%)`,
                        }}
                      >
                        <span className={styles.storagePercentage}>
                          {getStoragePercentage()}%
                        </span>
                      </div>
                      <div className={styles.storageLabel}>
                        <span>Total</span>
                        <span className={styles.storageValue}>
                          {formatBytes(storageInfo?.total || 0)}
                        </span>
                      </div>
                    </div>
                    {getStoragePercentage() > 80 && (
                      <div className={styles.storageWarning}>
                        <AlertIcon size={16} />
                        <span>Storage usage is high. Consider deleting old snapshots or icons.</span>
                      </div>
                    )}
                  </div>

                  {/* Breakdown */}
                  <div className={styles.breakdownGrid}>
                    <div className={styles.breakdownCard}>
                      <h3>Icons Storage</h3>
                      <div className={styles.breakdownValue}>
                        {formatBytes(storageInfo?.icons_size || 0)}
                      </div>
                      <div className={styles.breakdownSubtitle}>
                        {icons.length} icon{icons.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className={styles.breakdownCard}>
                      <h3>Snapshots Storage</h3>
                      <div className={styles.breakdownValue}>
                        {formatBytes(storageInfo?.snapshots_size || 0)}
                      </div>
                      <div className={styles.breakdownSubtitle}>
                        {snapshotsData.snapshots?.length || 0} snapshot
                        {snapshotsData.snapshots?.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className={styles.breakdownCard}>
                      <h3>Other Storage</h3>
                      <div className={styles.breakdownValue}>
                        {formatBytes(
                          (storageInfo?.used || 0) -
                            (storageInfo?.icons_size || 0) -
                            (storageInfo?.snapshots_size || 0)
                        )}
                      </div>
                      <div className={styles.breakdownSubtitle}>Database & configs</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Icons Tab */}
          {activeTab === 'icons' && (
            <div className={styles.listSection}>
              <div className={styles.sectionHeader}>
                <h2>Uploaded Icons</h2>
                <div className={styles.uploadSection}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadIconMutation.isPending}
                  >
                    <UploadIcon size={16} />
                    {uploadIconMutation.isPending ? `Uploading... ${uploadProgress}%` : 'Upload Icon'}
                  </Button>
                </div>
              </div>
              {loadingIcons ? (
                <div className={styles.loading}>Loading icons...</div>
              ) : icons.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No icons uploaded yet</p>
                  <p className={styles.emptyStateSubtext}>Click "Upload Icon" to add your first icon</p>
                </div>
              ) : (
                <div className={styles.iconsList}>
                  {icons.map((iconUrl, index) => {
                    // Extract filename from URL
                    const fileName = iconUrl.split('/').pop() || `icon-${index}`;
                    return (
                      <div key={iconUrl} className={styles.iconItem}>
                        <div className={styles.iconPreview}>
                          <img
                            src={`${api.defaults.baseURL.replace('/api', '')}${iconUrl}`}
                            alt={fileName}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div
                            className={styles.iconPlaceholder}
                            style={{ display: 'none' }}
                          >
                            ?
                          </div>
                        </div>
                        <div className={styles.iconInfo}>
                          <div className={styles.iconName}>{fileName}</div>
                          <div className={styles.iconPath}>{iconUrl}</div>
                        </div>
                        <div className={styles.iconActions}>
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => handleRenameIcon(iconUrl, fileName)}
                            disabled={renameIconMutation.isPending}
                          >
                            <EditIcon size={16} />
                            Rename
                          </Button>
                          <Button
                            variant="danger"
                            size="small"
                            onClick={() => handleDeleteIcon(iconUrl, fileName)}
                            disabled={deleteIconMutation.isPending}
                          >
                            <TrashIcon size={16} />
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Snapshots Tab */}
          {activeTab === 'snapshots' && (
            <div className={styles.listSection}>
              <h2>Snapshots</h2>
              {loadingSnapshots ? (
                <div className={styles.loading}>Loading snapshots...</div>
              ) : !Array.isArray(snapshotsData.snapshots) || snapshotsData.snapshots?.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No snapshots found</p>
                </div>
              ) : (
                <div className={styles.snapshotsList}>
                  {snapshotsData.snapshots.map((snapshot) => (
                    <div key={snapshot.id} className={styles.snapshotItem}>
                      <div className={styles.snapshotInfo}>
                        <div className={styles.snapshotName}>
                          {snapshot.deployment_name} - {snapshot.snapshot_name}
                        </div>
                        <div className={styles.snapshotDetails}>
                          <span className={styles.snapshotSize}>
                            Size: {formatBytes(snapshot.size || 0)}
                          </span>
                          <span className={styles.snapshotDate}>
                            Created: {new Date(snapshot.created_at).toLocaleString()}
                          </span>
                          {snapshot.notes && (
                            <span className={styles.snapshotNotes}>
                              Notes: {snapshot.notes}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() =>
                          handleDeleteSnapshot(snapshot.id, snapshot.snapshot_name)
                        }
                        disabled={deleteSnapshotMutation.isPending}
                      >
                        <TrashIcon size={16} />
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alert.isOpen}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onClose={() => setAlert({ ...alert, isOpen: false })}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirm.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={
          confirm.type === 'deleteIcon'
            ? 'Delete Icon'
            : 'Delete Snapshot'
        }
        message={
          confirm.type === 'deleteIcon'
            ? `Are you sure you want to delete the icon "${confirm.data?.fileName}"? This action cannot be undone.`
            : `Are you sure you want to delete the snapshot "${confirm.data?.name}"? This action cannot be undone.`
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Rename Modal */}
      <ConfirmModal
        isOpen={renameModal.isOpen}
        onClose={() => {
          setRenameModal({ isOpen: false, iconUrl: null, currentName: '' });
          setNewIconName('');
        }}
        onConfirm={handleConfirmRename}
        title="Rename Icon"
        message={
          <div>
            <p style={{ marginBottom: '16px' }}>Enter a new name for the icon:</p>
            <input
              type="text"
              value={newIconName}
              onChange={(e) => setNewIconName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleConfirmRename()}
              placeholder="Icon name"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #1a1f3a',
                borderRadius: '4px',
                background: '#0a0e27',
                color: '#e0e0e0',
              }}
            />
            <p style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
              Current: {renameModal.currentName}
            </p>
          </div>
        }
        confirmText="Rename"
        cancelText="Cancel"
        confirmVariant="primary"
      />
    </Layout>
  );
};

export default Storage;
