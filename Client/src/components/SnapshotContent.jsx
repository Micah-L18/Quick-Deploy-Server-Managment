import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import Button from './Button';
import ConfirmModal from './ConfirmModal';
import { snapshotsService } from '../api/snapshots';
import { HardDriveIcon, DownloadIcon, RefreshIcon, TrashIcon, ClockIcon, AlertIcon, CheckCircleIcon } from './Icons';
import styles from './SnapshotModal.module.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
};

/**
 * Reusable snapshot content component that can be used in a modal or as a tab
 * @param {Object} props
 * @param {Object} props.deployment - The deployment object
 * @param {Object} props.server - The server object (optional)
 * @param {boolean} props.isVisible - Whether this content is currently visible (for socket management)
 * @param {boolean} props.showFooter - Whether to show the footer with close button
 * @param {Function} props.onClose - Close handler (optional)
 */
const SnapshotContent = ({ deployment, server, isVisible = true, showFooter = false, onClose }) => {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, snapshot: null });
  const [confirmRestore, setConfirmRestore] = useState({ isOpen: false, snapshot: null });
  
  // Progress state
  const [progress, setProgress] = useState(null);
  const socketRef = useRef(null);
  const socketIdRef = useRef(null);

  // Socket.IO connection for progress tracking
  useEffect(() => {
    if (isVisible && deployment?.id) {
      const socket = io(API_URL);
      socketRef.current = socket;
      
      socket.on('connect', () => {
        socketIdRef.current = socket.id;
      });
      
      socket.on('snapshot-progress', (data) => {
        setProgress(data);
        
        // On complete or error, refresh the snapshots list
        if (data.stage === 'complete') {
          setTimeout(() => {
            setProgress(null);
            queryClient.invalidateQueries(['snapshots', deployment?.id]);
            queryClient.invalidateQueries(['snapshot-storage']);
          }, 1500);
        } else if (data.stage === 'error') {
          setError(data.message);
          setTimeout(() => setProgress(null), 3000);
        }
      });
      
      return () => {
        socket.disconnect();
        socketRef.current = null;
        socketIdRef.current = null;
      };
    }
  }, [isVisible, deployment?.id, queryClient]);

  // Fetch snapshots for this deployment
  const { data: snapshots = [], isLoading, refetch } = useQuery({
    queryKey: ['snapshots', deployment?.id],
    queryFn: () => snapshotsService.getByDeployment(deployment.id),
    enabled: isVisible && !!deployment?.id,
  });

  // Fetch storage stats
  const { data: storageStats } = useQuery({
    queryKey: ['snapshot-storage'],
    queryFn: () => snapshotsService.getStorageStats(),
    enabled: isVisible,
  });

  // Create snapshot mutation
  const createMutation = useMutation({
    mutationFn: () => snapshotsService.create(deployment.id, notes || null, socketIdRef.current),
    onMutate: () => {
      setProgress({ type: 'create', stage: 'starting', percent: 0, label: 'Initializing...', message: 'Preparing snapshot' });
    },
    onSuccess: () => {
      setNotes('');
      setError('');
      // Progress will auto-clear after 'complete' stage via socket listener
    },
    onError: (err) => {
      setProgress(null);
      setError(err.response?.data?.error || 'Failed to create snapshot');
    }
  });

  // Delete snapshot mutation
  const deleteMutation = useMutation({
    mutationFn: (snapshotId) => snapshotsService.remove(snapshotId),
    onSuccess: () => {
      setConfirmDelete({ isOpen: false, snapshot: null });
      queryClient.invalidateQueries(['snapshots', deployment?.id]);
      queryClient.invalidateQueries(['snapshot-storage']);
    },
    onError: (err) => {
      setError(err.response?.data?.error || 'Failed to delete snapshot');
    }
  });

  // Restore snapshot mutation
  const restoreMutation = useMutation({
    mutationFn: (snapshotId) => snapshotsService.restore(snapshotId, socketIdRef.current),
    onMutate: () => {
      setProgress({ type: 'restore', stage: 'starting', percent: 0, label: 'Initializing...', message: 'Preparing restore' });
    },
    onSuccess: () => {
      setConfirmRestore({ isOpen: false, snapshot: null });
      // Progress will auto-clear after 'complete' stage via socket listener
    },
    onError: (err) => {
      setProgress(null);
      setError(err.response?.data?.error || 'Failed to restore snapshot');
    }
  });

  const handleCreateSnapshot = () => {
    setError('');
    createMutation.mutate();
  };

  const handleDelete = (snapshot) => {
    setConfirmDelete({ isOpen: true, snapshot });
  };

  const handleRestore = (snapshot) => {
    setConfirmRestore({ isOpen: true, snapshot });
  };

  const handleDownload = (snapshot) => {
    window.open(snapshotsService.getDownloadUrl(snapshot.id), '_blank');
  };

  // Check if deployment has volumes
  const getVolumes = () => {
    if (!deployment?.volumes) return [];
    if (typeof deployment.volumes === 'string') {
      try {
        return JSON.parse(deployment.volumes);
      } catch {
        return [];
      }
    }
    return deployment.volumes || [];
  };

  const hasVolumes = getVolumes().length > 0;

  if (!deployment) return null;

  return (
    <>
      <div className={styles.container}>
        {/* Storage Stats */}
        {storageStats && (
          <div className={styles.storageStats}>
            <div className={styles.storageHeader}>
              <HardDriveIcon size={18} />
              <span>Storage Usage</span>
            </div>
            <div className={styles.storageBar}>
              <div 
                className={styles.storageUsed} 
                style={{ width: `${Math.min(storageStats.usedPercentage, 100)}%` }}
              />
            </div>
            <div className={styles.storageText}>
              {storageStats.usedGB} GB / {storageStats.maxGB} GB ({storageStats.usedPercentage}%)
            </div>
          </div>
        )}

        {/* Create Snapshot Section */}
        <div className={styles.createSection}>
          <h3>Create Snapshot</h3>
          {!hasVolumes ? (
            <div className={styles.noVolumes}>
              <AlertIcon size={18} />
              <span>No volumes configured for this deployment. Add volume mounts to enable snapshots.</span>
            </div>
          ) : (
            <>
              <p className={styles.hint}>
                Create a backup of all volume data. The container will be stopped briefly during the snapshot.
              </p>
              <div className={styles.createForm}>
                <input
                  type="text"
                  placeholder="Optional notes (e.g., 'Before update')"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={styles.notesInput}
                />
                <Button
                  onClick={handleCreateSnapshot}
                  disabled={createMutation.isPending || !hasVolumes || !!progress}
                >
                  {createMutation.isPending || (progress?.type === 'create') ? 'Creating...' : 'Create Snapshot'}
                </Button>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className={styles.error}>
            <AlertIcon size={16} />
            {error}
          </div>
        )}

        {/* Progress Indicator */}
        {progress && (
          <div className={styles.progressContainer}>
            <div className={styles.progressHeader}>
              <span className={styles.progressType}>
                {progress.type === 'create' ? 'Creating Snapshot...' : 'Restoring Snapshot...'}
              </span>
              <span className={styles.progressPercent}>{progress.percent}%</span>
            </div>
            <div className={styles.progressBarContainer}>
              <div 
                className={`${styles.progressBar} ${progress.stage === 'complete' ? styles.progressComplete : ''} ${progress.stage === 'error' ? styles.progressError : ''}`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className={styles.progressDetails}>
              <span className={styles.progressLabel}>{progress.label}</span>
              {progress.message && <span className={styles.progressMessage}>{progress.message}</span>}
            </div>
          </div>
        )}

        {/* Snapshots List */}
        <div className={styles.snapshotsList}>
          <div className={styles.listHeader}>
            <h3>Snapshots ({snapshots.length})</h3>
            <button className={styles.refreshBtn} onClick={() => refetch()}>
              <RefreshIcon size={16} />
            </button>
          </div>

          {isLoading ? (
            <div className={styles.loading}>Loading snapshots...</div>
          ) : snapshots.length === 0 ? (
            <div className={styles.empty}>
              No snapshots yet. Create one to backup your volume data.
            </div>
          ) : (
            <div className={styles.snapshots}>
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className={styles.snapshotCard}>
                  <div className={styles.snapshotInfo}>
                    <div className={styles.snapshotHeader}>
                      {snapshot.status === 'complete' ? (
                        <CheckCircleIcon size={16} color="var(--success)" />
                      ) : snapshot.status === 'failed' ? (
                        <AlertIcon size={16} color="var(--error)" />
                      ) : (
                        <ClockIcon size={16} color="var(--warning)" />
                      )}
                      <span className={styles.snapshotDate}>{formatDate(snapshot.created_at)}</span>
                      <span className={`${styles.snapshotStatus} ${styles[snapshot.status]}`}>
                        {snapshot.status}
                      </span>
                    </div>
                    {snapshot.notes && (
                      <div className={styles.snapshotNotes}>{snapshot.notes}</div>
                    )}
                    <div className={styles.snapshotMeta}>
                      <span>{formatBytes(snapshot.size_bytes)}</span>
                      <span>•</span>
                      <span>{JSON.parse(snapshot.volume_paths || '[]').length} volume(s)</span>
                    </div>
                  </div>
                  <div className={styles.snapshotActions}>
                    {snapshot.status === 'complete' && (
                      <>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleRestore(snapshot)}
                          title="Restore snapshot"
                          disabled={restoreMutation.isPending || !!progress}
                        >
                          <RefreshIcon size={16} />
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleDownload(snapshot)}
                          title="Download archive"
                          disabled={!!progress}
                        >
                          <DownloadIcon size={16} />
                        </button>
                      </>
                    )}
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleDelete(snapshot)}
                      title="Delete snapshot"
                      disabled={deleteMutation.isPending || !!progress}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showFooter && onClose && (
          <div className={styles.footer}>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, snapshot: null })}
        onConfirm={() => deleteMutation.mutate(confirmDelete.snapshot?.id)}
        title="Delete Snapshot"
        message={`Are you sure you want to delete this snapshot from ${formatDate(confirmDelete.snapshot?.created_at)}? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Confirm Restore Modal */}
      <ConfirmModal
        isOpen={confirmRestore.isOpen}
        onClose={() => setConfirmRestore({ isOpen: false, snapshot: null })}
        onConfirm={() => restoreMutation.mutate(confirmRestore.snapshot?.id)}
        title="Restore Snapshot"
        message={`This will restore volume data from ${formatDate(confirmRestore.snapshot?.created_at)}. The container will be stopped during restore. Current volume data will be overwritten. Continue?`}
        confirmText="Restore"
        confirmVariant="primary"
        isLoading={restoreMutation.isPending}
      />
    </>
  );
};

export default SnapshotContent;
