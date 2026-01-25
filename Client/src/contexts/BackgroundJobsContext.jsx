import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { appsService } from '../api/apps';
import { systemService } from '../api/system';

const BackgroundJobsContext = createContext(null);

export const useBackgroundJobs = () => {
  const context = useContext(BackgroundJobsContext);
  if (!context) {
    throw new Error('useBackgroundJobs must be used within a BackgroundJobsProvider');
  }
  return context;
};

export const BackgroundJobsProvider = ({ children }) => {
  const [jobs, setJobs] = useState({});
  const [progress, setProgress] = useState({}); // Track progress from socket events
  const [fileJobs, setFileJobs] = useState({}); // Track file operation jobs
  
  // System update state - persists across navigation
  const [systemUpdate, setSystemUpdate] = useState({
    status: 'idle', // 'idle' | 'updating' | 'complete' | 'error'
    logs: [],
    percent: 0,
    stage: null,
    requiresRestart: false,
    newVersion: null,
    newCommit: null,
    error: null
  });
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  
  const socketRef = useRef(null);

  // Poll for deployments with active statuses
  useEffect(() => {
    const fetchActiveJobs = async () => {
      try {
        const deployments = await appsService.getAllDeployments();
        const activeStatuses = ['snapshotting', 'restoring', 'migrating'];
        
        const activeJobs = {};
        deployments.forEach(dep => {
          if (activeStatuses.includes(dep.status)) {
            const jobId = `${dep.status}-${dep.id}`;
            activeJobs[jobId] = {
              id: jobId,
              deploymentId: dep.id,
              type: dep.status === 'snapshotting' ? 'Snapshotting' :
                    dep.status === 'restoring' ? 'Restoring' :
                    dep.status === 'migrating' ? 'Migrating' : dep.status,
              containerName: dep.container_name,
              appName: dep.app_name,
              percent: progress[dep.id]?.percent ?? 0,
              stage: progress[dep.id]?.stage ?? 'in-progress',
              message: progress[dep.id]?.message ?? '',
              timestamp: Date.now()
            };
          }
        });
        
        setJobs(activeJobs);
      } catch (error) {
        // Silently fail - user might not be logged in
        console.debug('[BackgroundJobs] Failed to fetch deployments:', error.message);
      }
    };

    // Initial fetch
    fetchActiveJobs();

    // Poll every 3 seconds
    const interval = setInterval(fetchActiveJobs, 3000);

    return () => clearInterval(interval);
  }, [progress]);

  // Fetch update status on mount and periodically when updating
  useEffect(() => {
    const fetchUpdateStatus = async () => {
      try {
        const status = await systemService.getUpdateStatus();
        
        // Update local state from server state
        setSystemUpdate(prev => ({
          ...prev,
          status: status.status,
          logs: status.logs || [],
          requiresRestart: status.requiresRestart,
          newVersion: status.newVersion,
          newCommit: status.newCommit,
          error: status.error
        }));

        // Show modal if update just completed
        if (status.status === 'complete' && status.requiresRestart) {
          setShowUpdateModal(true);
        }
      } catch (error) {
        // Silently fail - user might not be logged in
        console.debug('[BackgroundJobs] Failed to fetch update status:', error.message);
      }
    };

    // Initial fetch
    fetchUpdateStatus();

    // Poll every 5 seconds while updating, less frequently otherwise
    const interval = setInterval(() => {
      if (systemUpdate.status === 'updating') {
        fetchUpdateStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [systemUpdate.status]);

  // Initialize socket connection for progress updates
  useEffect(() => {
    const socketInstance = io(window.location.origin.replace(':3000', ':3044'), {
      withCredentials: true
    });

    socketInstance.on('connect', () => {
      console.log('[BackgroundJobs] Socket connected:', socketInstance.id);
    });

    // Listen for snapshot progress
    socketInstance.on('snapshot-progress', (data) => {
      setProgress(prev => ({
        ...prev,
        [data.deploymentId]: {
          percent: data.percent,
          stage: data.stage,
          message: data.label || data.message
        }
      }));
    });

    // Listen for migration progress
    socketInstance.on('migration-progress', (data) => {
      setProgress(prev => ({
        ...prev,
        [data.deploymentId]: {
          percent: data.percent,
          stage: data.stage,
          message: data.message
        }
      }));
    });

    // Listen for system update progress logs
    socketInstance.on('system-update-progress', (data) => {
      setSystemUpdate(prev => ({
        ...prev,
        logs: [...prev.logs, data]
      }));
    });

    // Listen for system update stage changes (with percent)
    socketInstance.on('system-update-stage', (data) => {
      setSystemUpdate(prev => ({
        ...prev,
        status: 'updating',
        percent: data.percent,
        stage: data.stage
      }));
    });

    // Listen for system update completion
    socketInstance.on('system-update-complete', (data) => {
      setSystemUpdate(prev => ({
        ...prev,
        status: data.success ? 'complete' : 'error',
        requiresRestart: data.requiresRestart || false,
        newVersion: data.newVersion || null,
        newCommit: data.newCommit || null,
        error: data.error || null,
        percent: data.success ? 100 : prev.percent
      }));
      
      // Show the restart modal
      if (data.success && data.requiresRestart) {
        setShowUpdateModal(true);
      }
    });

    // Listen for server restart
    socketInstance.on('system-restart', () => {
      // Could show a reconnecting indicator here
      console.log('[BackgroundJobs] Server is restarting...');
    });

    // Listen for file operation progress
    socketInstance.on('file-operation-progress', (data) => {
      setFileJobs(prev => ({
        ...prev,
        [data.jobId]: {
          id: data.jobId,
          type: data.type, // 'Uploading' or 'Deleting'
          fileName: data.fileName,
          serverName: data.serverName,
          percent: data.percent,
          stage: data.stage || 'in-progress',
          message: data.message || '',
          timestamp: Date.now()
        }
      }));
    });

    // Listen for file operation complete/error
    socketInstance.on('file-operation-complete', (data) => {
      setFileJobs(prev => {
        const updated = { ...prev };
        if (updated[data.jobId]) {
          updated[data.jobId] = {
            ...updated[data.jobId],
            stage: 'complete',
            percent: 100
          };
          // Remove after 3 seconds
          setTimeout(() => {
            setFileJobs(current => {
              const { [data.jobId]: removed, ...rest } = current;
              return rest;
            });
          }, 3000);
        }
        return updated;
      });
    });

    socketInstance.on('file-operation-error', (data) => {
      setFileJobs(prev => {
        const updated = { ...prev };
        if (updated[data.jobId]) {
          updated[data.jobId] = {
            ...updated[data.jobId],
            stage: 'error',
            message: data.error || 'Operation failed'
          };
          // Remove after 5 seconds
          setTimeout(() => {
            setFileJobs(current => {
              const { [data.jobId]: removed, ...rest } = current;
              return rest;
            });
          }, 5000);
        }
        return updated;
      });
    });

    socketRef.current = socketInstance;

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Get socket ID for passing to API calls
  const getSocketId = useCallback(() => {
    return socketRef.current?.id || null;
  }, []);

  // Start a system update
  const startSystemUpdate = useCallback(async () => {
    try {
      setSystemUpdate(prev => ({
        ...prev,
        status: 'updating',
        logs: [],
        percent: 0,
        stage: 'starting',
        error: null
      }));
      await systemService.triggerUpdate();
    } catch (error) {
      setSystemUpdate(prev => ({
        ...prev,
        status: 'error',
        error: error.message
      }));
    }
  }, []);

  // Restart server after update
  const restartServer = useCallback(async () => {
    try {
      await systemService.restartServer();
      // Clear update state
      setSystemUpdate({
        status: 'idle',
        logs: [],
        percent: 0,
        stage: null,
        requiresRestart: false,
        newVersion: null,
        newCommit: null,
        error: null
      });
      setShowUpdateModal(false);
    } catch (error) {
      console.error('[BackgroundJobs] Failed to restart server:', error);
    }
  }, []);

  // Dismiss the update modal (restart later)
  const dismissUpdateModal = useCallback(() => {
    setShowUpdateModal(false);
  }, []);

  // Clear update status
  const clearUpdateStatus = useCallback(async () => {
    try {
      await systemService.clearUpdateStatus();
      setSystemUpdate({
        status: 'idle',
        logs: [],
        percent: 0,
        stage: null,
        requiresRestart: false,
        newVersion: null,
        newCommit: null,
        error: null
      });
    } catch (error) {
      console.error('[BackgroundJobs] Failed to clear update status:', error);
    }
  }, []);

  // Combine deployment jobs and file jobs
  const allJobs = { ...jobs, ...fileJobs };
  
  // Add system update as a job if active
  if (systemUpdate.status === 'updating') {
    allJobs['system-update'] = {
      id: 'system-update',
      type: 'System Update',
      percent: systemUpdate.percent,
      stage: systemUpdate.stage,
      message: systemUpdate.stage ? `${systemUpdate.stage}...` : 'Updating...',
      timestamp: Date.now()
    };
  }
  
  const jobsList = Object.values(allJobs).sort((a, b) => b.timestamp - a.timestamp);
  const jobCount = jobsList.length;

  return (
    <BackgroundJobsContext.Provider value={{
      jobs: jobsList,
      jobCount,
      getSocketId,
      // System update specific
      systemUpdate,
      showUpdateModal,
      startSystemUpdate,
      restartServer,
      dismissUpdateModal,
      clearUpdateStatus
    }}>
      {children}
    </BackgroundJobsContext.Provider>
  );
};

export default BackgroundJobsContext;
