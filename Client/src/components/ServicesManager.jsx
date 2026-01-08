import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { servicesAPI } from '../api/services';
import styles from './ServicesManager.module.css';
import { ServerIcon, CheckCircleIcon, XCircleIcon, ClockIcon, DownloadIcon, PlayIcon, StopCircleIcon, RotateIcon } from './Icons';

const AVAILABLE_SERVICES = [
  { name: 'docker', displayName: 'Docker', description: 'Container platform for building and running applications' },
  { name: 'nginx', displayName: 'Nginx', description: 'High-performance web server and reverse proxy' },
  { 
    name: 'nodejs', 
    displayName: 'Node.js', 
    description: 'JavaScript runtime',
    hasVersions: true,
    versions: [
      { value: '22', label: 'v22.x (Current)' },
      { value: '20', label: 'v20.x LTS (Recommended)' },
      { value: '18', label: 'v18.x LTS' },
      { value: '16', label: 'v16.x LTS (Maintenance)' },
    ],
    defaultVersion: '20'
  },
  { name: 'postgresql', displayName: 'PostgreSQL', description: 'Advanced open source relational database' },
  { name: 'redis', displayName: 'Redis', description: 'In-memory data structure store and cache' },
];

const ServicesManager = ({ serverId }) => {
  const queryClient = useQueryClient();
  const [expandedService, setExpandedService] = useState(null);
  const [actionOutput, setActionOutput] = useState({});
  const [installingService, setInstallingService] = useState(null);
  const [liveOutput, setLiveOutput] = useState('');
  const [selectedVersions, setSelectedVersions] = useState(
    // Initialize with default versions for services that have them
    AVAILABLE_SERVICES.reduce((acc, service) => {
      if (service.hasVersions && service.defaultVersion) {
        acc[service.name] = service.defaultVersion;
      }
      return acc;
    }, {})
  );
  const socketRef = useRef(null);
  const outputRef = useRef(null);
  const installingServiceRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => {
    installingServiceRef.current = installingService;
  }, [installingService]);

  // Socket.IO connection - only connect once on mount
  useEffect(() => {
    const socket = io('http://localhost:3044');
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('install-output', ({ data }) => {
      setLiveOutput(prev => prev + data);
    });

    socket.on('install-complete', ({ success, message }) => {
      const serviceName = installingServiceRef.current;
      if (serviceName) {
        setInstallingService(null);
        setActionOutput(prev => ({
          ...prev,
          [serviceName]: { 
            type: success ? 'success' : 'error', 
            message
          }
        }));
        // Refetch service status
        queryClient.invalidateQueries(['serviceStatus', serverId, serviceName]);
      }
    });

    socket.on('install-error', ({ message }) => {
      const serviceName = installingServiceRef.current;
      if (serviceName) {
        const isSudoError = message.includes('password is required') || message.includes('askpass helper');
        setInstallingService(null);
        setActionOutput(prev => ({
          ...prev,
          [serviceName]: { 
            type: 'error', 
            message: isSudoError ? 'Permission denied - sudo password required' : message,
            isSudoError
          }
        }));
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, serverId]);

  // Fetch OS information
  const { data: osInfo, isLoading: osLoading } = useQuery({
    queryKey: ['osInfo', serverId],
    queryFn: () => servicesAPI.getOSInfo(serverId),
  });

  // Fetch status for all services
  const serviceQueries = useQueries({
    queries: AVAILABLE_SERVICES.map(service => ({
      queryKey: ['serviceStatus', serverId, service.name],
      queryFn: () => servicesAPI.getServiceStatus(serverId, service.name),
      enabled: !!osInfo, // Only fetch after OS info is loaded
    }))
  });

  // Auto-scroll live output
  useEffect(() => {
    if (outputRef.current && liveOutput) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [liveOutput]);

  // Manage service mutation (keep this for start/stop/restart - quick actions)
  const manageMutation = useMutation({
    mutationFn: ({ serviceName, action }) => servicesAPI.manageService(serverId, serviceName, action),
    onSuccess: (data, variables) => {
      setActionOutput(prev => ({
        ...prev,
        [variables.serviceName]: { type: 'success', message: data.message, output: data.output }
      }));
      // Refetch service status after management action
      queryClient.invalidateQueries(['serviceStatus', serverId, variables.serviceName]);
    },
    onError: (error, variables) => {
      setActionOutput(prev => ({
        ...prev,
        [variables.serviceName]: { 
          type: 'error', 
          message: error.response?.data?.error || 'Action failed',
          output: error.response?.data?.output
        }
      }));
    },
  });

  const handleInstall = (serviceName) => {
    setActionOutput(prev => ({ ...prev, [serviceName]: null }));
    setLiveOutput('');
    setInstallingService(serviceName);
    // Get version if service supports versions
    const version = selectedVersions[serviceName];
    // Use WebSocket for real-time output
    socketRef.current.emit('install-service', { serverId, serviceName, version });
  };

  const handleManageService = (serviceName, action) => {
    setActionOutput(prev => ({ ...prev, [serviceName]: null }));
    manageMutation.mutate({ serviceName, action });
  };

  const toggleExpand = (serviceName) => {
    setExpandedService(expandedService === serviceName ? null : serviceName);
    // Clear output when collapsing
    if (expandedService === serviceName) {
      setActionOutput(prev => ({ ...prev, [serviceName]: null }));
      setLiveOutput('');
    }
  };

  if (osLoading) {
    return (
      <div className={styles.loading}>
        <ClockIcon />
        <span>Detecting server OS...</span>
      </div>
    );
  }

  if (!osInfo) {
    return (
      <div className={styles.error}>
        <XCircleIcon />
        <span>Failed to detect server OS. Please ensure the server is connected.</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* OS Information Header */}
      <div className={styles.osInfo}>
        <ServerIcon />
        <div className={styles.osDetails}>
          <h3>{osInfo.prettyName || 'Linux Server'}</h3>
          <div className={styles.osMetadata}>
            <span>Version: {osInfo.version || 'Unknown'}</span>
            <span>•</span>
            <span>Package Manager: {osInfo.packageManager || 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Services List */}
      <div className={styles.servicesList}>
        <h3>Available Services</h3>
        {AVAILABLE_SERVICES.map((service, index) => {
          const statusQuery = serviceQueries[index];
          const status = statusQuery?.data;
          const isExpanded = expandedService === service.name;
          const output = actionOutput[service.name];
          const isInstalling = installingService === service.name;
          const isLoading = isInstalling || manageMutation.isPending && manageMutation.variables?.serviceName === service.name;

          return (
            <div key={service.name} className={styles.serviceCard}>
              <div className={styles.serviceHeader} onClick={() => toggleExpand(service.name)}>
                <div className={styles.serviceInfo}>
                  <h4>{service.displayName}</h4>
                  <p>{service.description}</p>
                </div>
                <div className={styles.serviceStatus}>
                  {statusQuery.isLoading ? (
                    <span className={styles.statusBadge}>
                      <ClockIcon />
                      Checking...
                    </span>
                  ) : isInstalling ? (
                    <span className={`${styles.statusBadge} ${styles.installing}`}>
                      <span className={styles.pulsingDot}></span>
                      Installing...
                    </span>
                  ) : status?.installed ? (
                    <div className={styles.statusBadges}>
                      <span className={`${styles.statusBadge} ${styles.installed}`}>
                        <CheckCircleIcon />
                        Installed
                      </span>
                      <span className={`${styles.statusBadge} ${status.active ? styles.active : styles.inactive}`}>
                        {status.active ? 'Running' : 'Stopped'}
                      </span>
                      {status.enabled && (
                        <span className={`${styles.statusBadge} ${styles.enabled}`}>
                          Auto-start
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.notInstalled}`}>
                      <XCircleIcon />
                      Not Installed
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className={styles.serviceActions}>
                  {!status?.installed ? (
                    <div className={styles.installSection}>
                      {/* Version selector for services that support it */}
                      {service.hasVersions && (
                        <div className={styles.versionSelector}>
                          <label>Version:</label>
                          <select
                            value={selectedVersions[service.name] || service.defaultVersion}
                            onChange={(e) => setSelectedVersions(prev => ({ 
                              ...prev, 
                              [service.name]: e.target.value 
                            }))}
                            disabled={isLoading}
                            className={styles.versionDropdown}
                          >
                            {service.versions.map(ver => (
                              <option key={ver.value} value={ver.value}>
                                {ver.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button
                        className={`${styles.actionButton} ${styles.install} ${isLoading ? styles.loading : ''}`}
                        onClick={() => handleInstall(service.name)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <span className={styles.spinner}></span>
                            Installing {service.displayName}...
                          </>
                        ) : (
                          <>
                            <DownloadIcon size={18} />
                            Install {service.displayName}{service.hasVersions ? ` v${selectedVersions[service.name] || service.defaultVersion}` : ''}
                          </>
                        )}
                      </button>
                      {!isLoading && (
                        <p className={styles.installHint}>
                          Click to install {service.displayName} on your server
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className={styles.actionButtons}>
                      {!status.active ? (
                        <button
                          className={`${styles.actionButton} ${styles.start} ${isLoading ? styles.loading : ''}`}
                          onClick={() => handleManageService(service.name, 'start')}
                          disabled={isLoading}
                        >
                          {isLoading && manageMutation.variables?.action === 'start' ? (
                            <span className={styles.spinner}></span>
                          ) : (
                            <PlayIcon size={16} />
                          )}
                          Start
                        </button>
                      ) : (
                        <>
                          <button
                            className={`${styles.actionButton} ${styles.stop} ${isLoading ? styles.loading : ''}`}
                            onClick={() => handleManageService(service.name, 'stop')}
                            disabled={isLoading}
                          >
                            {isLoading && manageMutation.variables?.action === 'stop' ? (
                              <span className={styles.spinner}></span>
                            ) : (
                              <StopCircleIcon size={16} />
                            )}
                            Stop
                          </button>
                          <button
                            className={`${styles.actionButton} ${styles.restart} ${isLoading ? styles.loading : ''}`}
                            onClick={() => handleManageService(service.name, 'restart')}
                            disabled={isLoading}
                          >
                            {isLoading && manageMutation.variables?.action === 'restart' ? (
                              <span className={styles.spinner}></span>
                            ) : (
                              <RotateIcon size={16} />
                            )}
                            Restart
                          </button>
                        </>
                      )}
                      {status.enabled ? (
                        <button
                          className={`${styles.actionButton} ${styles.disable} ${isLoading ? styles.loading : ''}`}
                          onClick={() => handleManageService(service.name, 'disable')}
                          disabled={isLoading}
                        >
                          {isLoading && manageMutation.variables?.action === 'disable' ? (
                            <span className={styles.spinner}></span>
                          ) : null}
                          Disable Auto-start
                        </button>
                      ) : (
                        <button
                          className={`${styles.actionButton} ${styles.enable} ${isLoading ? styles.loading : ''}`}
                          onClick={() => handleManageService(service.name, 'enable')}
                          disabled={isLoading}
                        >
                          {isLoading && manageMutation.variables?.action === 'enable' ? (
                            <span className={styles.spinner}></span>
                          ) : null}
                          Enable Auto-start
                        </button>
                      )}
                    </div>
                  )}

                  {/* Live Installation Terminal */}
                  {isInstalling && (
                    <div className={styles.liveTerminal}>
                      <div className={styles.terminalHeader}>
                        <span className={styles.terminalDot} style={{background: '#ff5f56'}}></span>
                        <span className={styles.terminalDot} style={{background: '#ffbd2e'}}></span>
                        <span className={styles.terminalDot} style={{background: '#27c93f'}}></span>
                        <span className={styles.terminalTitle}>Installing {service.displayName}...</span>
                        <span className={styles.liveIndicator}>
                          <span className={styles.liveDot}></span>
                          LIVE
                        </span>
                      </div>
                      <pre className={styles.liveOutput} ref={outputRef}>{liveOutput || 'Connecting to server...'}</pre>
                    </div>
                  )}

                  {/* Output Display (after completion) */}
                  {output && !isInstalling && (
                    <div className={`${styles.output} ${styles[output.type]}`}>
                      <div className={styles.outputHeader}>
                        <span className={styles.outputTitle}>
                          {output.type === 'success' ? '✓' : '✗'} {output.message}
                        </span>
                      </div>
                      {output.isSudoError && (
                        <div className={styles.sudoHelp}>
                          <p><strong>How to fix:</strong> Your SSH user requires a password for sudo.</p>
                          <p>Either:</p>
                          <ol>
                            <li>Use <code>root</code> as the username when adding the server</li>
                            <li>Or configure passwordless sudo on your server:</li>
                          </ol>
                          <pre className={styles.helpCode}>sudo visudo{'\n'}# Add this line at the end:{'\n'}yourusername ALL=(ALL) NOPASSWD: ALL</pre>
                        </div>
                      )}
                      {output.output && !output.isSudoError && (
                        <div className={styles.terminalOutput}>
                          <div className={styles.terminalHeader}>
                            <span className={styles.terminalDot} style={{background: '#ff5f56'}}></span>
                            <span className={styles.terminalDot} style={{background: '#ffbd2e'}}></span>
                            <span className={styles.terminalDot} style={{background: '#27c93f'}}></span>
                            <span className={styles.terminalTitle}>Terminal Output</span>
                          </div>
                          <pre className={styles.outputDetails}>{output.output}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  {isLoading && !isInstalling && (
                    <div className={styles.loadingIndicator}>
                      <ClockIcon />
                      <span>Executing commands on server...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServicesManager;
