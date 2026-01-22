import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { appsService } from '../api/apps';

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

    socketRef.current = socketInstance;

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Get socket ID for passing to API calls
  const getSocketId = useCallback(() => {
    return socketRef.current?.id || null;
  }, []);

  const jobsList = Object.values(jobs).sort((a, b) => b.timestamp - a.timestamp);
  const jobCount = jobsList.length;

  return (
    <BackgroundJobsContext.Provider value={{
      jobs: jobsList,
      jobCount,
      getSocketId
    }}>
      {children}
    </BackgroundJobsContext.Provider>
  );
};

export default BackgroundJobsContext;
