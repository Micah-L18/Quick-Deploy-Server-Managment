import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';

const SnapshotProgressContext = createContext(null);

/**
 * Provider that maintains a persistent Socket.IO connection for snapshot progress
 * This allows progress to persist even when the modal is closed
 */
export const SnapshotProgressProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const socketRef = useRef(null);
  const socketIdRef = useRef(null);
  
  // Map of deploymentId -> progress state
  const [progressMap, setProgressMap] = useState({});

  // Initialize socket connection
  useEffect(() => {
    const socket = io(API_URL);
    socketRef.current = socket;
    
    socket.on('connect', () => {
      socketIdRef.current = socket.id;
    });
    
    socket.on('snapshot-progress', (data) => {
      const deploymentId = data.deploymentId || data.snapshotId;
      
      setProgressMap(prev => ({
        ...prev,
        [deploymentId]: data
      }));
      
      // On complete or error, clear after delay and refresh data
      if (data.stage === 'complete') {
        setTimeout(() => {
          setProgressMap(prev => {
            const next = { ...prev };
            delete next[deploymentId];
            return next;
          });
          // Invalidate all relevant queries
          queryClient.invalidateQueries(['snapshots']);
          queryClient.invalidateQueries(['snapshot-storage']);
          queryClient.invalidateQueries(['server-deployments']);
          queryClient.invalidateQueries(['all-deployments']);
          queryClient.invalidateQueries(['app-deployments']);
        }, 1500);
      } else if (data.stage === 'error') {
        setTimeout(() => {
          setProgressMap(prev => {
            const next = { ...prev };
            delete next[deploymentId];
            return next;
          });
        }, 5000);
      }
    });
    
    return () => {
      socket.disconnect();
      socketRef.current = null;
      socketIdRef.current = null;
    };
  }, [queryClient]);

  // Get progress for a specific deployment
  const getProgress = useCallback((deploymentId) => {
    return progressMap[deploymentId] || null;
  }, [progressMap]);

  // Get socket ID for API calls
  const getSocketId = useCallback(() => {
    return socketIdRef.current;
  }, []);

  // Check if any snapshot operation is in progress
  const hasActiveProgress = useCallback(() => {
    return Object.keys(progressMap).length > 0;
  }, [progressMap]);

  // Set progress manually (for optimistic UI)
  const setProgress = useCallback((deploymentId, progress) => {
    setProgressMap(prev => ({
      ...prev,
      [deploymentId]: progress
    }));
  }, []);

  // Clear progress
  const clearProgress = useCallback((deploymentId) => {
    setProgressMap(prev => {
      const next = { ...prev };
      delete next[deploymentId];
      return next;
    });
  }, []);

  const value = {
    progressMap,
    getProgress,
    getSocketId,
    hasActiveProgress,
    setProgress,
    clearProgress
  };

  return (
    <SnapshotProgressContext.Provider value={value}>
      {children}
    </SnapshotProgressContext.Provider>
  );
};

export const useSnapshotProgress = () => {
  const context = useContext(SnapshotProgressContext);
  if (!context) {
    throw new Error('useSnapshotProgress must be used within SnapshotProgressProvider');
  }
  return context;
};

export default SnapshotProgressContext;
