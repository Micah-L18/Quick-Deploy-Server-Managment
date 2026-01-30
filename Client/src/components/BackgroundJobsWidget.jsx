import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackgroundJobs } from '../contexts/BackgroundJobsContext';
import { ChevronUpIcon, ChevronDownIcon, CheckIcon, AlertIcon, RefreshIcon, XIcon, SettingsIcon, DownloadIcon } from './Icons';
import migrationsService from '../api/migrations';
import { showApiError } from '../utils/toast';
import styles from './BackgroundJobsWidget.module.css';

// Helper to format bytes compactly
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0) + ' ' + sizes[i];
};

const BackgroundJobsWidget = () => {
  const { jobs, jobCount, systemUpdate, setSelectedJobId } = useBackgroundJobs();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState({});
  const [cancelled, setCancelled] = useState({});

  if (jobCount === 0) return null;

  const handleCancel = async (job) => {
    if (job.type !== 'Migrating') return;
    
    setCancelling(prev => ({ ...prev, [job.deploymentId]: true }));
    try {
      await migrationsService.cancelMigration(job.deploymentId);
      // Show brief success state before job disappears
      setCancelled(prev => ({ ...prev, [job.deploymentId]: true }));
      setTimeout(() => {
        setCancelled(prev => ({ ...prev, [job.deploymentId]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to cancel migration:', error);
      showApiError(error, 'Failed to cancel migration');
    } finally {
      setCancelling(prev => ({ ...prev, [job.deploymentId]: false }));
    }
  };

  const handleJobClick = (job, e) => {
    e.stopPropagation();
    // Navigate to Settings page if it's a system update job
    if (job.id === 'system-update') {
      navigate('/settings');
    } else {
      // Open job details modal (via context)
      setSelectedJobId(job.id);
    }
  };

  const canCancel = (job) => {
    // Only migration jobs can be cancelled, and only at certain stages
    if (job.type !== 'Migrating') return false;
    const safeStages = ['in-progress', 'stopping', 'archiving', 'downloading', 'uploading'];
    return safeStages.includes(job.stage) || job.percent < 60;
  };

  const getStatusIcon = (stage, deploymentId) => {
    if (cancelled[deploymentId]) return <XIcon size={12} />;
    if (stage === 'complete') return <CheckIcon size={12} />;
    if (stage === 'error' || stage === 'cancelled') return <AlertIcon size={12} />;
    return null;
  };

  const getStatusColor = (stage, deploymentId) => {
    if (cancelled[deploymentId]) return '#f59e0b'; // Orange for cancelled
    if (stage === 'complete') return '#22c55e';
    if (stage === 'error') return '#ef4444';
    if (stage === 'cancelled') return '#f59e0b';
    return '#3b82f6';
  };

  return (
    <div className={`${styles.widget} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header} onClick={() => setCollapsed(!collapsed)}>
        <div className={styles.headerLeft}>
          <div className={styles.spinnerContainer}>
            <RefreshIcon size={14} className={styles.spinner} />
          </div>
          <span className={styles.jobCount}>
            {jobCount} job{jobCount !== 1 ? 's' : ''} running
          </span>
        </div>
        <button className={styles.collapseBtn} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        </button>
      </div>
      
      {!collapsed && (
        <div className={styles.jobsContainer}>
          {jobCount > 1 && (
            <button 
              className={styles.expandJobsBtn}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : `Show all ${jobCount} jobs`}
              {expanded ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
            </button>
          )}
          <div className={`${styles.jobsList} ${expanded ? styles.expanded : ''}`}>
            {jobs.map((job, index) => {
              const isDownloadJob = job.id?.startsWith('download-');
              return (
                <div 
                  key={job.id} 
                  className={`${styles.jobItem} ${!expanded && index > 0 ? styles.hidden : ''} ${job.id === 'system-update' ? styles.systemUpdateJob : ''} ${isDownloadJob ? styles.downloadJob : ''}`}
                  onClick={(e) => handleJobClick(job, e)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.jobInfo}>
                    <div className={styles.jobLeft}>
                      {job.id === 'system-update' && <SettingsIcon size={12} className={styles.jobIcon} />}
                      {isDownloadJob && <DownloadIcon size={12} className={styles.jobIcon} />}
                      <span className={styles.jobType}>{cancelled[job.deploymentId] ? 'Cancelled' : job.type}</span>
                      <span className={styles.jobName}>
                        {job.id === 'system-update' ? 'NoBase' : (job.containerName || job.appName || job.fileName)}
                      </span>
                    </div>
                    <div className={styles.jobRight}>
                      <span className={styles.jobPercent} style={{ color: getStatusColor(job.stage, job.deploymentId) }}>
                        {getStatusIcon(job.stage, job.deploymentId) || `${job.percent}%`}
                      </span>
                      {canCancel(job) && !cancelled[job.deploymentId] && (
                        <button 
                          className={styles.cancelBtn}
                          onClick={() => handleCancel(job)}
                          disabled={cancelling[job.deploymentId]}
                          title="Cancel migration"
                        >
                          <XIcon size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill} 
                      style={{ 
                        width: `${job.percent}%`, 
                        backgroundColor: getStatusColor(job.stage) 
                    }}
                  />
                </div>
                {/* Show download size for download jobs, otherwise show message */}
                {isDownloadJob && (job.loaded > 0 || job.total > 0) ? (
                  <div className={styles.jobMessage}>
                    {formatBytes(job.loaded)} / {job.total > 0 ? formatBytes(job.total) : '...'}
                  </div>
                ) : job.message ? (
                  <div className={styles.jobMessage}>{job.message}</div>
                ) : null}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BackgroundJobsWidget;
