import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import Modal from './Modal';
import Button from './Button';
import { serversService } from '../api/servers';
import migrationsService from '../api/migrations';
import { ServerIcon, ChevronRightIcon, AlertIcon, CheckIcon, CopyIcon, MoveIcon, XIcon } from './Icons';
import styles from './MigrateDeploymentModal.module.css';
import { io } from 'socket.io-client';

const MigrateDeploymentModal = ({ isOpen, onClose, deployment, mode = 'copy' }) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1); // 1: Select server, 2: Configure, 3: Progress
  const [targetServerId, setTargetServerId] = useState('');
  const [containerName, setContainerName] = useState('');
  const [portMappings, setPortMappings] = useState([]);
  const [conflicts, setConflicts] = useState({ containerName: false, ports: [] });
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ stage: '', percent: 0, message: '' });
  const [socketId, setSocketId] = useState(null);
  const [socket, setSocket] = useState(null);
  
  const isMove = mode === 'move';

  // Fetch servers
  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: serversService.getServers,
    enabled: isOpen
  });

  // Filter out source server
  const availableServers = servers.filter(s => s.id !== deployment?.server_id);

  // Initialize socket connection
  useEffect(() => {
    if (!isOpen) return;

    const socketInstance = io(window.location.origin.replace(':3000', ':3044'), {
      withCredentials: true
    });

    socketInstance.on('connect', () => {
      setSocketId(socketInstance.id);
    });

    socketInstance.on('migration-progress', (data) => {
      if (data.deploymentId === deployment?.id) {
        setProgress({
          stage: data.stage,
          percent: data.percent,
          message: data.message
        });
        
        if (data.stage === 'complete') {
          // Invalidate queries after successful migration
          setTimeout(() => {
            queryClient.invalidateQueries(['servers']);
            queryClient.invalidateQueries(['apps']);
            queryClient.invalidateQueries(['deployments']);
          }, 1000);
        }
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [isOpen, deployment?.id, queryClient]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && deployment) {
      setStep(1);
      setTargetServerId('');
      setContainerName(`${deployment.container_name}_${isMove ? 'moved' : 'copy'}`);
      
      // Parse port mappings from deployment
      let ports = deployment.port_mappings;
      if (typeof ports === 'string') {
        try {
          ports = JSON.parse(ports);
        } catch {
          ports = [];
        }
      }
      setPortMappings(ports || []);
      
      setConflicts({ containerName: false, ports: [] });
      setError('');
      setProgress({ stage: '', percent: 0, message: '' });
    }
  }, [isOpen, deployment, isMove]);

  // Check conflicts when target server or config changes
  const checkConflictsDebounced = useCallback(async () => {
    if (!targetServerId || !containerName) return;
    
    setCheckingConflicts(true);
    try {
      const result = await migrationsService.checkConflicts(
        targetServerId,
        containerName,
        portMappings
      );
      setConflicts(result);
    } catch (err) {
      console.error('Failed to check conflicts:', err);
    } finally {
      setCheckingConflicts(false);
    }
  }, [targetServerId, containerName, portMappings]);

  useEffect(() => {
    if (step === 2) {
      const timeout = setTimeout(checkConflictsDebounced, 300);
      return () => clearTimeout(timeout);
    }
  }, [step, checkConflictsDebounced]);

  // Execute migration mutation
  const migrationMutation = useMutation({
    mutationFn: () => migrationsService.executeMigration({
      deploymentId: deployment.id,
      appId: deployment.app_id,
      targetServerId,
      containerName,
      portMappings,
      deleteOriginal: isMove,
      socketId
    }),
    onSuccess: () => {
      // Progress will be updated via socket
    },
    onError: (err) => {
      setError(err.response?.data?.error || err.message);
    }
  });

  const handleServerSelect = (serverId) => {
    setTargetServerId(serverId);
    setStep(2);
  };

  const handleStartMigration = () => {
    if (conflicts.containerName || conflicts.ports.length > 0) {
      setError('Please resolve conflicts before proceeding');
      return;
    }
    setStep(3);
    migrationMutation.mutate();
  };

  const handlePortChange = (index, field, value) => {
    const newPorts = [...portMappings];
    newPorts[index] = { ...newPorts[index], [field]: value };
    setPortMappings(newPorts);
  };

  const handleAddPort = () => {
    setPortMappings([...portMappings, { host: '', container: '' }]);
  };

  const handleRemovePort = (index) => {
    setPortMappings(portMappings.filter((_, i) => i !== index));
  };

  const hasConflicts = conflicts.containerName || conflicts.ports.length > 0;
  const targetServer = availableServers.find(s => s.id === targetServerId);

  const getProgressColor = () => {
    if (progress.stage === 'error') return '#ef4444';
    if (progress.stage === 'complete') return '#22c55e';
    return '#3b82f6';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === 3 && progress.stage !== 'complete' && progress.stage !== 'error' ? undefined : onClose}
      title={
        <div className={styles.modalTitle}>
          {isMove ? <MoveIcon size={20} /> : <CopyIcon size={20} />}
          {isMove ? 'Move Deployment' : 'Copy Deployment'}
        </div>
      }
      size="medium"
    >
      <div className={styles.container}>
        {/* Progress Steps Indicator */}
        <div className={styles.stepsIndicator}>
          <div className={`${styles.step} ${step >= 1 ? styles.active : ''}`}>
            <span className={styles.stepNumber}>1</span>
            <span className={styles.stepLabel}>Select Server</span>
          </div>
          <div className={styles.stepArrow}><ChevronRightIcon size={16} /></div>
          <div className={`${styles.step} ${step >= 2 ? styles.active : ''}`}>
            <span className={styles.stepNumber}>2</span>
            <span className={styles.stepLabel}>Configure</span>
          </div>
          <div className={styles.stepArrow}><ChevronRightIcon size={16} /></div>
          <div className={`${styles.step} ${step >= 3 ? styles.active : ''}`}>
            <span className={styles.stepNumber}>3</span>
            <span className={styles.stepLabel}>{isMove ? 'Move' : 'Copy'}</span>
          </div>
        </div>

        {/* Step 1: Select Target Server */}
        {step === 1 && (
          <div className={styles.stepContent}>
            <h3>Select Target Server</h3>
            <p className={styles.stepDescription}>
              Choose the server where you want to {isMove ? 'move' : 'copy'} this deployment.
            </p>
            
            {availableServers.length === 0 ? (
              <div className={styles.noServers}>
                <AlertIcon size={24} />
                <p>No other servers available. Add more servers to {isMove ? 'move' : 'copy'} deployments.</p>
              </div>
            ) : (
              <div className={styles.serverGrid}>
                {availableServers.map(server => (
                  <button
                    key={server.id}
                    className={styles.serverCard}
                    onClick={() => handleServerSelect(server.id)}
                  >
                    <ServerIcon size={24} />
                    <div className={styles.serverInfo}>
                      <span className={styles.serverName}>{server.name || server.ip}</span>
                      <span className={styles.serverIp}>{server.ip}</span>
                    </div>
                    <span className={`${styles.serverStatus} ${styles[server.status || 'pending']}`}>
                      {server.status || 'pending'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 2 && (
          <div className={styles.stepContent}>
            <h3>Configure Target Deployment</h3>
            
            <div className={styles.migrationSummary}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>From:</span>
                <span>{deployment?.server_name || deployment?.server_ip || 'Source'}</span>
              </div>
              <ChevronRightIcon size={20} />
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>To:</span>
                <span>{targetServer?.name || targetServer?.ip}</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Container Name</label>
              <input
                type="text"
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
                className={conflicts.containerName ? styles.inputError : ''}
              />
              {conflicts.containerName && (
                <span className={styles.errorText}>
                  <AlertIcon size={14} /> Container name already exists on target server
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label>Port Mappings</label>
              <div className={styles.portList}>
                {portMappings.map((port, index) => (
                  <div key={index} className={styles.portRow}>
                    <input
                      type="text"
                      value={port.host}
                      onChange={(e) => handlePortChange(index, 'host', e.target.value)}
                      placeholder="Host"
                      className={conflicts.ports.includes(String(port.host)) ? styles.inputError : ''}
                    />
                    <span className={styles.portArrow}>→</span>
                    <input
                      type="text"
                      value={port.container}
                      onChange={(e) => handlePortChange(index, 'container', e.target.value)}
                      placeholder="Container"
                    />
                    <button
                      className={styles.removePortBtn}
                      onClick={() => handleRemovePort(index)}
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                ))}
                <Button variant="outline" size="small" onClick={handleAddPort}>
                  + Add Port
                </Button>
              </div>
              {conflicts.ports.length > 0 && (
                <span className={styles.errorText}>
                  <AlertIcon size={14} /> Port(s) {conflicts.ports.join(', ')} already in use on target server
                </span>
              )}
            </div>

            {isMove && (
              <div className={styles.warningBox}>
                <AlertIcon size={16} />
                <span>
                  <strong>Move mode:</strong> The original deployment will be removed after successful migration.
                </span>
              </div>
            )}

            {error && (
              <div className={styles.errorBox}>
                <AlertIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.actions}>
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleStartMigration}
                disabled={hasConflicts || checkingConflicts || !containerName}
              >
                {checkingConflicts ? 'Checking...' : `Start ${isMove ? 'Move' : 'Copy'}`}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Progress */}
        {step === 3 && (
          <div className={styles.stepContent}>
            <h3>{isMove ? 'Moving' : 'Copying'} Deployment</h3>
            
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${progress.percent}%`,
                    backgroundColor: getProgressColor()
                  }}
                />
              </div>
              <div className={styles.progressText}>
                <span className={styles.progressStage}>
                  {progress.stage === 'complete' && <CheckIcon size={16} />}
                  {progress.stage === 'error' && <AlertIcon size={16} />}
                  {progress.message || 'Initializing...'}
                </span>
                <span className={styles.progressPercent}>{progress.percent}%</span>
              </div>
            </div>

            {progress.stage === 'error' && (
              <div className={styles.errorBox}>
                <AlertIcon size={16} />
                <span>{progress.message}</span>
              </div>
            )}

            {progress.stage === 'complete' && (
              <div className={styles.successBox}>
                <CheckIcon size={16} />
                <span>Deployment {isMove ? 'moved' : 'copied'} successfully!</span>
              </div>
            )}

            <div className={styles.actions}>
              {(progress.stage === 'complete' || progress.stage === 'error') && (
                <Button variant="primary" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MigrateDeploymentModal;
