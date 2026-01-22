import React, { useState } from 'react';
import { useBackgroundJobs } from '../contexts/BackgroundJobsContext';
import { ChevronUpIcon, ChevronDownIcon, CheckIcon, AlertIcon, RefreshIcon, XIcon } from './Icons';
import migrationsService from '../api/migrations';
import styles from './BackgroundJobsWidget.module.css';

const BackgroundJobsWidget = () => {
  const { jobs, jobCount } = useBackgroundJobs();
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
      alert(error.response?.data?.error || 'Failed to cancel migration');
    } finally {
      setCancelling(prev => ({ ...prev, [job.deploymentId]: false }));
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
    <div className={styles.widget}>
      <div className={styles.header} onClick={() => jobCount > 1 && setExpanded(!expanded)}>
        <div className={styles.headerLeft}>
          <div className={styles.spinnerContainer}>
            <RefreshIcon size={14} className={styles.spinner} />
          </div>
          <span className={styles.jobCount}>
            {jobCount} job{jobCount !== 1 ? 's' : ''} running
          </span>
        </div>
        {jobCount > 1 && (
          <button className={styles.expandBtn}>
            {expanded ? <ChevronDownIcon size={16} /> : <ChevronUpIcon size={16} />}
          </button>
        )}
      </div>
      
      <div className={`${styles.jobsList} ${expanded ? styles.expanded : ''}`}>
        {jobs.map((job, index) => (
          <div 
            key={job.id} 
            className={`${styles.jobItem} ${!expanded && index > 0 ? styles.hidden : ''}`}
          >
            <div className={styles.jobInfo}>
              <div className={styles.jobLeft}>
                <span className={styles.jobType}>{cancelled[job.deploymentId] ? 'Cancelled' : job.type}</span>
                <span className={styles.jobName}>{job.containerName || job.appName}</span>
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
            {job.message && (
              <div className={styles.jobMessage}>{job.message}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BackgroundJobsWidget;
