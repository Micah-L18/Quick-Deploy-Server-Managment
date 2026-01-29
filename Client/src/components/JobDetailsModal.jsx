import React from 'react';
import { useBackgroundJobs } from '../contexts/BackgroundJobsContext';
import Modal from './Modal';
import Button from './Button';
import { DownloadIcon, RefreshIcon, ClockIcon, XIcon } from './Icons';
import migrationsService from '../api/migrations';
import styles from './JobDetailsModal.module.css';

// Helper to format timestamp
const formatTime = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};

// Helper to format bytes
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(i > 1 ? 2 : 0) + ' ' + sizes[i];
};

const JobDetailsModal = () => {
  const { 
    jobs, 
    selectedJobId, 
    setSelectedJobId, 
    cancelDownloadJob 
  } = useBackgroundJobs();
  
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelled, setCancelled] = React.useState(false);

  // Get the current job data from jobs array (for live updates)
  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

  // Auto-close modal if job completes or is removed
  React.useEffect(() => {
    if (selectedJobId && !selectedJob) {
      // Job was removed, close modal after brief delay
      const timeout = setTimeout(() => {
        setSelectedJobId(null);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [selectedJobId, selectedJob, setSelectedJobId]);

  if (!selectedJob) return null;

  const handleCloseModal = () => {
    setSelectedJobId(null);
  };

  const handleCancelDownload = (jobId) => {
    if (cancelDownloadJob) {
      cancelDownloadJob(jobId);
    }
    setSelectedJobId(null);
  };

  const handleCancelMigration = async (job) => {
    if (job.type !== 'Migrating') return;
    
    setCancelling(true);
    try {
      await migrationsService.cancelMigration(job.deploymentId);
      setCancelled(true);
      setTimeout(() => {
        setCancelled(false);
        setSelectedJobId(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to cancel migration:', error);
      alert(error.response?.data?.error || 'Failed to cancel migration');
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = (job) => {
    // Only migration jobs can be cancelled, and only at certain stages
    if (job.type !== 'Migrating') return false;
    const safeStages = ['in-progress', 'stopping', 'archiving', 'downloading', 'uploading'];
    return safeStages.includes(job.stage) || job.percent < 60;
  };

  const getStatusColor = (stage) => {
    if (cancelled) return '#f59e0b';
    if (stage === 'complete') return '#22c55e';
    if (stage === 'error') return '#ef4444';
    if (stage === 'cancelled') return '#f59e0b';
    return '#3b82f6';
  };

  return (
    <Modal 
      isOpen={!!selectedJob} 
      onClose={handleCloseModal}
      title={`${selectedJob.type} Details`}
      size="default"
    >
      <div className={styles.jobDetailsModal}>
        {/* Job Header */}
        <div className={styles.jobDetailsHeader}>
          <div className={styles.jobDetailsIcon}>
            {selectedJob.id?.startsWith('download-') ? (
              <DownloadIcon size={32} />
            ) : selectedJob.type === 'Migrating' ? (
              <RefreshIcon size={32} />
            ) : (
              <RefreshIcon size={32} />
            )}
          </div>
          <div className={styles.jobDetailsTitle}>
            <h3>{selectedJob.containerName || selectedJob.appName || selectedJob.fileName || 'Unknown'}</h3>
            <span className={styles.jobDetailsType}>{cancelled ? 'Cancelled' : selectedJob.type}</span>
          </div>
        </div>

        {/* Progress Section */}
        <div className={styles.jobDetailsProgress}>
          <div className={styles.jobDetailsProgressHeader}>
            <span>Progress</span>
            <span style={{ color: getStatusColor(selectedJob.stage) }}>
              {cancelled ? 'Cancelled' :
               selectedJob.stage === 'complete' ? 'Complete' : 
               selectedJob.stage === 'error' ? 'Error' : 
               `${selectedJob.percent}%`}
            </span>
          </div>
          <div className={styles.jobDetailsProgressBar}>
            <div 
              className={styles.jobDetailsProgressFill}
              style={{ 
                width: `${selectedJob.percent}%`,
                backgroundColor: getStatusColor(selectedJob.stage)
              }}
            />
          </div>
          {/* Show download size progress for download jobs */}
          {selectedJob.id?.startsWith('download-') && (selectedJob.loaded > 0 || selectedJob.total > 0) ? (
            <p className={styles.jobDetailsMessage}>
              {formatBytes(selectedJob.loaded)} / {selectedJob.total > 0 ? formatBytes(selectedJob.total) : 'Unknown'}
            </p>
          ) : selectedJob.message ? (
            <p className={styles.jobDetailsMessage}>{selectedJob.message}</p>
          ) : null}
        </div>

        {/* Details Grid */}
        <div className={styles.jobDetailsGrid}>
          <div className={styles.jobDetailsRow}>
            <span className={styles.jobDetailsLabel}>Status</span>
            <span className={styles.jobDetailsValue} style={{ color: getStatusColor(selectedJob.stage) }}>
              {cancelled ? '✗ Cancelled' :
               selectedJob.stage === 'complete' ? '✓ Complete' :
               selectedJob.stage === 'error' ? '✗ Error' :
               selectedJob.stage === 'starting' ? '◐ Starting...' :
               selectedJob.stage === 'downloading' ? '↓ Downloading' :
               selectedJob.stage === 'uploading' ? '↑ Uploading' :
               '◌ In Progress'}
            </span>
          </div>
          
          {selectedJob.appName && (
            <div className={styles.jobDetailsRow}>
              <span className={styles.jobDetailsLabel}>App</span>
              <span className={styles.jobDetailsValue}>{selectedJob.appName}</span>
            </div>
          )}
          
          {selectedJob.fileName && (
            <div className={styles.jobDetailsRow}>
              <span className={styles.jobDetailsLabel}>File</span>
              <span className={styles.jobDetailsValue}>{selectedJob.fileName}</span>
            </div>
          )}
          
          {selectedJob.containerName && (
            <div className={styles.jobDetailsRow}>
              <span className={styles.jobDetailsLabel}>Container</span>
              <span className={styles.jobDetailsValue}>{selectedJob.containerName}</span>
            </div>
          )}
          
          {selectedJob.timestamp && (
            <div className={styles.jobDetailsRow}>
              <span className={styles.jobDetailsLabel}>Started</span>
              <span className={styles.jobDetailsValue}>
                <ClockIcon size={14} style={{ marginRight: 4 }} />
                {formatTime(selectedJob.timestamp)}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className={styles.jobDetailsActions}>
          {selectedJob.id?.startsWith('download-') && selectedJob.stage !== 'complete' && selectedJob.stage !== 'error' && (
            <Button 
              variant="danger" 
              size="small"
              onClick={() => handleCancelDownload(selectedJob.id)}
            >
              Cancel Download
            </Button>
          )}
          {canCancel(selectedJob) && !cancelled && (
            <Button 
              variant="danger" 
              size="small"
              onClick={() => handleCancelMigration(selectedJob)}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Migration'}
            </Button>
          )}
          <Button variant="secondary" size="small" onClick={handleCloseModal}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default JobDetailsModal;
