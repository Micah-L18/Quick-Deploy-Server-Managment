import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { appsService } from '../api/apps';
import { serversService } from '../api/servers';
import { AppsIcon, AlertIcon, RefreshIcon, TrashIcon, PlayIcon, CheckCircleIcon, XCircleIcon } from '../components/Icons';
import styles from './AppDetail.module.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3044';

const AppDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('config');
  
  // Config form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    tag: 'latest',
    ports: [],
    env_vars: [],
    volumes: [],
    restart_policy: 'unless-stopped',
    network_mode: '',
    command: '',
    custom_args: '',
    registry_url: '',
    registry_username: '',
    registry_password: '',
    use_custom_registry: false
  });
  const [hasChanges, setHasChanges] = useState(false);
  
  // Deployment modal state
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployOutput, setDeployOutput] = useState('');
  const [portConflicts, setPortConflicts] = useState(null);
  const [customPorts, setCustomPorts] = useState([]);
  const [dockerStatus, setDockerStatus] = useState(null);
  const [checkingDocker, setCheckingDocker] = useState(false);
  const deployOutputRef = useRef(null);
  const socketRef = useRef(null);

  // Fetch app data
  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', id],
    queryFn: () => appsService.getApp(id),
  });

  // Fetch servers (for deployment dropdown)
  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: serversService.getServers,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => appsService.updateApp(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['app', id]);
      setHasChanges(false);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => appsService.deleteApp(id),
    onSuccess: () => {
      navigate('/apps');
    },
  });
  const removeDeploymentMutation = useMutation({
    mutationFn: (deploymentId) => appsService.removeDeployment(id, deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['app-deployments', id]);
    },
  });

  // Initialize form data when app loads
  useEffect(() => {
    if (app) {
      setFormData({
        name: app.name || '',
        description: app.description || '',
        image: app.image || '',
        tag: app.tag || 'latest',
        ports: app.ports || [],
        env_vars: app.env_vars || [],
        volumes: app.volumes || [],
        restart_policy: app.restart_policy || 'unless-stopped',
        network_mode: app.network_mode || '',
        command: app.command || '',
        custom_args: app.custom_args || '',
        registry_url: app.registry_url || '',
        registry_username: app.registry_username || '',
        registry_password: '',
        use_custom_registry: !!(app.registry_url || app.registry_username)
      });
      setCustomPorts(app.ports || []);
    }
  }, [app]);

  // Socket.IO for deployment
  useEffect(() => {
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on('deploy-output', ({ data }) => {
      setDeployOutput(prev => prev + data);
    });

    socket.on('deploy-complete', ({ success, deploymentId }) => {
      setIsDeploying(false);
      queryClient.invalidateQueries(['app-deployments', id]);
    });

    socket.on('deploy-error', ({ message }) => {
      setIsDeploying(false);
      setDeployOutput(prev => prev + `\n\x1b[31m>>> Error: ${message}\x1b[0m\n`);
    });

    return () => {
      socket.disconnect();
    };
  }, [id, queryClient]);

  // Auto-scroll deploy output
  useEffect(() => {
    if (deployOutputRef.current) {
      deployOutputRef.current.scrollTop = deployOutputRef.current.scrollHeight;
    }
  }, [deployOutput]);

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSaveConfig = () => {
    updateMutation.mutate(formData);
  };

  // Port management
  const addPort = () => {
    handleFormChange('ports', [...formData.ports, { host: '', container: '' }]);
  };

  const updatePort = (index, field, value) => {
    const newPorts = [...formData.ports];
    newPorts[index] = { ...newPorts[index], [field]: value };
    handleFormChange('ports', newPorts);
  };

  const removePort = (index) => {
    handleFormChange('ports', formData.ports.filter((_, i) => i !== index));
  };

  // Env var management
  const addEnvVar = () => {
    handleFormChange('env_vars', [...formData.env_vars, { key: '', value: '' }]);
  };

  const updateEnvVar = (index, field, value) => {
    const newVars = [...formData.env_vars];
    newVars[index] = { ...newVars[index], [field]: value };
    handleFormChange('env_vars', newVars);
  };

  const removeEnvVar = (index) => {
    handleFormChange('env_vars', formData.env_vars.filter((_, i) => i !== index));
  };

  // Volume management
  const addVolume = () => {
    handleFormChange('volumes', [...formData.volumes, { host: '', container: '' }]);
  };

  const updateVolume = (index, field, value) => {
    const newVolumes = [...formData.volumes];
    newVolumes[index] = { ...newVolumes[index], [field]: value };
    handleFormChange('volumes', newVolumes);
  };

  const removeVolume = (index) => {
    handleFormChange('volumes', formData.volumes.filter((_, i) => i !== index));
  };

  // Generate docker-compose YAML
  const generateYaml = () => {
    if (!formData.image) return '# No Docker image configured\n# Go to Config tab to set up your container';
    
    let yaml = `version: '3.8'\n\nservices:\n  ${formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}:\n`;
    yaml += `    image: ${formData.image}:${formData.tag || 'latest'}\n`;
    yaml += `    container_name: ${formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}\n`;
    yaml += `    restart: ${formData.restart_policy || 'unless-stopped'}\n`;
    
    if (formData.ports && formData.ports.length > 0) {
      yaml += `    ports:\n`;
      formData.ports.forEach(p => {
        if (p.host && p.container) {
          yaml += `      - "${p.host}:${p.container}"\n`;
        }
      });
    }
    
    if (formData.env_vars && formData.env_vars.length > 0) {
      yaml += `    environment:\n`;
      formData.env_vars.forEach(env => {
        if (env.key) {
          yaml += `      - ${env.key}=${env.value || ''}\n`;
        }
      });
    }
    
    if (formData.volumes && formData.volumes.length > 0) {
      yaml += `    volumes:\n`;
      formData.volumes.forEach(vol => {
        if (vol.host && vol.container) {
          yaml += `      - ${vol.host}:${vol.container}\n`;
        }
      });
    }
    
    if (formData.network_mode) {
      yaml += `    network_mode: ${formData.network_mode}\n`;
    }
    
    if (formData.command) {
      yaml += `    command: ${formData.command}\n`;
    }
    
    return yaml;
  };

  // Check ports and open deploy modal
  const handleOpenDeployModal = async () => {
    setShowDeployModal(true);
    setDeployOutput('');
    setPortConflicts(null);
    setSelectedServer('');
    setCustomPorts(formData.ports || []);
    setDockerStatus(null);
  };

  // Check port availability when server is selected
  const handleServerSelect = async (serverId) => {
    setSelectedServer(serverId);
    setPortConflicts(null);
    setDockerStatus(null);
    
    if (!serverId) return;
    
    // Check Docker status first
    setCheckingDocker(true);
    try {
      const dockerResult = await serversService.checkDockerStatus(serverId);
      setDockerStatus(dockerResult);
    } catch (error) {
      console.error('Failed to check Docker status:', error);
      setDockerStatus({ installed: false, message: 'Failed to check Docker status' });
    }
    setCheckingDocker(false);
    
    // Check port availability
    if (customPorts.length > 0) {
      try {
        const result = await appsService.checkPorts(id, serverId, customPorts);
        
        // Backend returns { available, conflicts: [{ port, inUse, details }] }
        if (result.conflicts && result.conflicts.length > 0) {
          const conflictPorts = result.conflicts.map(c => c.port);
          setPortConflicts(conflictPorts);
        }
      } catch (error) {
        console.error('Failed to check ports:', error);
      }
    }
  };

  // Start deployment
  const handleDeploy = (forceDeployWithConflicts = false) => {
    if (!selectedServer) return;
    
    if (portConflicts && portConflicts.length > 0 && !forceDeployWithConflicts) {
      // User must acknowledge conflicts
      return;
    }
    
    setIsDeploying(true);
    setDeployOutput('');
    socketRef.current.emit('deploy-app', {
      appId: id,
      serverId: selectedServer,
      portMappings: customPorts
    });
  };

  // Delete app with confirmation
  const handleDeleteApp = () => {
    if (window.confirm(`Are you sure you want to delete "${app.name}"? This will also remove all deployments.`)) {
      deleteMutation.mutate();
    }
  };

  // Remove deployment with confirmation
  const handleRemoveDeployment = (deployment) => {
    if (window.confirm(`Stop and remove container "${deployment.container_name}" from ${deployment.server_name || deployment.server_ip}?`)) {
      removeDeploymentMutation.mutate(deployment.id);
    }
  };

  if (appLoading) {
    return (
      <Layout>
        <div className={styles.loading}>Loading app details...</div>
      </Layout>
    );
  }

  if (!app) {
    return (
      <Layout>
        <div className={styles.error}>
          <AlertIcon size={60} />
          <h2>App Not Found</h2>
          <p>The app you're looking for doesn't exist.</p>
          <Link to="/apps">
            <Button>Back to Apps</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  // Filter servers that are online
  const dockerServers = servers.filter(s => s.status === 'online');

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <div>
          <Link to="/apps" className={styles.backLink}>
            ← Back to Apps
          </Link>
          <h1 className={styles.pageTitle}>
            <AppsIcon size={32} />
            {app.name}
          </h1>
          {app.image && (
            <span className={styles.imageBadge}>
              🐳 {app.image}:{app.tag || 'latest'}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <Button
            onClick={handleOpenDeployModal}
            variant="primary"
            disabled={!formData.image}
          >
            <PlayIcon size={18} /> Deploy
          </Button>
          <Button
            onClick={() => queryClient.invalidateQueries(['app', id])}
            variant="outline"
          >
            <RefreshIcon size={18} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'config' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Config
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'yaml' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('yaml')}
        >
          📄 YAML
        </button>
      </div>

      {/* Config Tab */}
      {activeTab === 'config' && (
        <div className={styles.tabContent}>
          <div className={styles.configSection}>
            <h3>Basic Information</h3>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>App Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="my-app"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
          </div>

          <div className={styles.configSection}>
            <h3>Docker Image</h3>
            <div className={styles.formRow}>
              <div className={styles.formGroup} style={{ flex: 2 }}>
                <label>Image Name *</label>
                <input
                  type="text"
                  value={formData.image}
                  onChange={(e) => handleFormChange('image', e.target.value)}
                  placeholder={formData.use_custom_registry ? "myapp/image" : "nginx, postgres, node, etc."}
                />
              </div>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label>Tag</label>
                <input
                  type="text"
                  value={formData.tag}
                  onChange={(e) => handleFormChange('tag', e.target.value)}
                  placeholder="latest"
                />
              </div>
            </div>
            
            {/* Registry Configuration */}
            <div className={styles.registryToggle}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.use_custom_registry}
                  onChange={(e) => {
                    handleFormChange('use_custom_registry', e.target.checked);
                    if (!e.target.checked) {
                      handleFormChange('registry_url', '');
                      handleFormChange('registry_username', '');
                      handleFormChange('registry_password', '');
                    }
                  }}
                />
                <span>Use Custom Registry (Private Registry, ECR, GCR, etc.)</span>
              </label>
            </div>
            
            {formData.use_custom_registry && (
              <div className={styles.registryConfig}>
                <div className={styles.registryPresets}>
                  <button
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => handleFormChange('registry_url', 'ghcr.io')}
                  >
                    GitHub Container Registry
                  </button>
                  <button
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => handleFormChange('registry_url', 'gcr.io')}
                  >
                    Google Container Registry
                  </button>
                  <button
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => handleFormChange('registry_url', '')}
                  >
                    AWS ECR
                  </button>
                  <button
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => handleFormChange('registry_url', '')}
                  >
                    Custom
                  </button>
                </div>
                
                <div className={styles.formGroup}>
                  <label>Registry URL *</label>
                  <input
                    type="text"
                    value={formData.registry_url}
                    onChange={(e) => handleFormChange('registry_url', e.target.value)}
                    placeholder="ghcr.io, gcr.io/project, 123.dkr.ecr.region.amazonaws.com"
                  />
                  <span className={styles.hint}>
                    The registry hostname (e.g., ghcr.io, gcr.io, or your private registry URL)
                  </span>
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Username *</label>
                    <input
                      type="text"
                      value={formData.registry_username}
                      onChange={(e) => handleFormChange('registry_username', e.target.value)}
                      placeholder="username or AWS, oauth2accesstoken"
                      autoComplete="username"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Password / Token *</label>
                    <input
                      type="password"
                      value={formData.registry_password}
                      onChange={(e) => handleFormChange('registry_password', e.target.value)}
                      placeholder="Enter password or access token"
                      autoComplete="new-password"
                    />
                    <span className={styles.hint}>
                      {formData.registry_password ? 'Password will be encrypted' : app?.registry_username ? 'Leave blank to keep existing' : 'Required for private registries'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.configSection}>
            <h3>Port Mappings</h3>
            <p className={styles.hint}>Map host ports to container ports</p>
            {formData.ports.map((port, index) => (
              <div key={index} className={styles.arrayRow}>
                <input
                  type="text"
                  value={port.host}
                  onChange={(e) => updatePort(index, 'host', e.target.value)}
                  placeholder="Host Port (e.g., 8080)"
                />
                <span className={styles.arrow}>→</span>
                <input
                  type="text"
                  value={port.container}
                  onChange={(e) => updatePort(index, 'container', e.target.value)}
                  placeholder="Container Port (e.g., 80)"
                />
                <button className={styles.removeBtn} onClick={() => removePort(index)}>×</button>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addPort}>+ Add Port Mapping</button>
          </div>

          <div className={styles.configSection}>
            <h3>Environment Variables</h3>
            <p className={styles.hint}>Set environment variables for the container</p>
            {formData.env_vars.map((env, index) => (
              <div key={index} className={styles.arrayRow}>
                <input
                  type="text"
                  value={env.key}
                  onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                  placeholder="KEY"
                />
                <span className={styles.equals}>=</span>
                <input
                  type="text"
                  value={env.value}
                  onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                  placeholder="value"
                />
                <button className={styles.removeBtn} onClick={() => removeEnvVar(index)}>×</button>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addEnvVar}>+ Add Environment Variable</button>
          </div>

          <div className={styles.configSection}>
            <h3>Volume Mounts</h3>
            <p className={styles.hint}>Mount host paths or volumes into the container</p>
            {formData.volumes.map((vol, index) => (
              <div key={index} className={styles.arrayRow}>
                <input
                  type="text"
                  value={vol.host}
                  onChange={(e) => updateVolume(index, 'host', e.target.value)}
                  placeholder="Host Path (e.g., /data)"
                />
                <span className={styles.arrow}>→</span>
                <input
                  type="text"
                  value={vol.container}
                  onChange={(e) => updateVolume(index, 'container', e.target.value)}
                  placeholder="Container Path (e.g., /var/lib/data)"
                />
                <button className={styles.removeBtn} onClick={() => removeVolume(index)}>×</button>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addVolume}>+ Add Volume</button>
          </div>

          <div className={styles.configSection}>
            <h3>Advanced Options</h3>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Restart Policy</label>
                <select
                  value={formData.restart_policy}
                  onChange={(e) => handleFormChange('restart_policy', e.target.value)}
                >
                  <option value="no">No</option>
                  <option value="always">Always</option>
                  <option value="unless-stopped">Unless Stopped</option>
                  <option value="on-failure">On Failure</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Network Mode</label>
                <input
                  type="text"
                  value={formData.network_mode}
                  onChange={(e) => handleFormChange('network_mode', e.target.value)}
                  placeholder="bridge, host, none, or custom"
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Command Override</label>
              <input
                type="text"
                value={formData.command}
                onChange={(e) => handleFormChange('command', e.target.value)}
                placeholder="Optional command to run instead of image default"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Custom Docker Arguments</label>
              <input
                type="text"
                value={formData.custom_args}
                onChange={(e) => handleFormChange('custom_args', e.target.value)}
                placeholder="e.g., --memory=512m --cpus=1 --privileged"
              />
              <small className={styles.fieldHint}>Additional docker run arguments (added before image name)</small>
            </div>
          </div>

          <div className={styles.configActions}>
            <Button
              onClick={handleSaveConfig}
              variant="primary"
              disabled={!hasChanges || updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
            </Button>
            {hasChanges && (
              <span className={styles.unsavedChanges}>You have unsaved changes</span>
            )}
          </div>

          <div className={styles.dangerZone}>
            <h3>Danger Zone</h3>
            <p>Deleting this app will also remove all associated deployments.</p>
            <Button variant="danger" onClick={handleDeleteApp}>
              <TrashIcon size={16} /> Delete App
            </Button>
          </div>
        </div>
      )}

      {/* YAML Tab */}
      {activeTab === 'yaml' && (
        <div className={styles.tabContent}>
          <div className={styles.yamlSection}>
            <div className={styles.yamlHeader}>
              <h3>Docker Compose YAML</h3>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(generateYaml());
                  alert('YAML copied to clipboard!');
                }}
              >
                📋 Copy YAML
              </Button>
            </div>
            <pre className={styles.yamlCode}>{generateYaml()}</pre>
            <p className={styles.yamlHint}>
              This YAML is auto-generated from your configuration. You can copy it to use with docker-compose directly.
            </p>
          </div>
        </div>
      )}

      {/* Deploy Modal */}
      <Modal
        isOpen={showDeployModal}
        onClose={() => {
          if (!isDeploying) {
            setShowDeployModal(false);
            setDeployOutput('');
            setSelectedServer('');
          }
        }}
        title="🚀 Deploy Application"
        size="large"
        variant="terminal"
      >
        <div className={styles.deployModal}>
          {!isDeploying && !deployOutput && (
            <>
              <div className={styles.formGroup}>
                <label>Select Target Server</label>
                <select
                  value={selectedServer}
                  onChange={(e) => handleServerSelect(e.target.value)}
                  className={styles.serverSelect}
                >
                  <option value="">-- Select a server --</option>
                  {dockerServers.map(server => (
                    <option key={server.id} value={server.id}>
                      {server.name || server.ip} ({server.ip})
                    </option>
                  ))}
                </select>
                {dockerServers.length === 0 && (
                  <p className={styles.warning}>
                    No online servers available. Make sure your servers are connected and have Docker installed.
                  </p>
                )}
              </div>

              {/* Docker Status Check */}
              {selectedServer && checkingDocker && (
                <div className={styles.dockerChecking}>
                  <span className={styles.spinner}></span> Checking Docker installation...
                </div>
              )}

              {selectedServer && !checkingDocker && dockerStatus && !dockerStatus.installed && (
                <div className={styles.dockerError}>
                  <strong>⚠️ Docker Not Available</strong>
                  <p>{dockerStatus.message || 'Docker is not installed on this server.'}</p>
                  <p>Please install Docker on the server before deploying.</p>
                  <Link to={`/servers/${selectedServer}?tab=services`} className={styles.dockerInstallLink}>
                    <Button variant="secondary" size="small">Go to Services Tab →</Button>
                  </Link>
                </div>
              )}

              {selectedServer && !checkingDocker && dockerStatus && dockerStatus.installed && !dockerStatus.running && (
                <div className={styles.dockerWarning}>
                  <strong>⚠️ Docker Not Running</strong>
                  <p>Docker is installed but the daemon is not running. Please start Docker on the server.</p>
                </div>
              )}

              {selectedServer && !checkingDocker && dockerStatus && dockerStatus.installed && dockerStatus.running && (
                <div className={styles.dockerSuccess}>
                  <strong>✓ Docker Ready</strong>
                  <span>{dockerStatus.version}</span>
                </div>
              )}

              {selectedServer && formData.ports.length > 0 && (
                <div className={styles.portSection}>
                  <label>Port Mappings</label>
                  {customPorts.map((port, index) => (
                    <div key={index} className={styles.portRow}>
                      <input
                        type="text"
                        value={port.host}
                        onChange={(e) => {
                          const newPorts = [...customPorts];
                          newPorts[index] = { ...newPorts[index], host: e.target.value };
                          setCustomPorts(newPorts);
                          // Re-check ports
                          handleServerSelect(selectedServer);
                        }}
                        placeholder="Host"
                      />
                      <span>:</span>
                      <input
                        type="text"
                        value={port.container}
                        onChange={(e) => {
                          const newPorts = [...customPorts];
                          newPorts[index] = { ...newPorts[index], container: e.target.value };
                          setCustomPorts(newPorts);
                        }}
                        placeholder="Container"
                        disabled
                      />
                      {portConflicts && portConflicts.includes(port.host) && (
                        <span className={styles.portConflict}>⚠️ In use</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {portConflicts && portConflicts.length > 0 && (
                <div className={styles.conflictWarning}>
                  <strong>⚠️ Port Conflict Detected</strong>
                  <p>Ports {portConflicts.join(', ')} are already in use on this server.</p>
                  <p>You can change the host ports above, or proceed anyway (may fail).</p>
                </div>
              )}

              <div className={styles.deployActions}>
                <Button
                  variant="primary"
                  onClick={() => handleDeploy(portConflicts && portConflicts.length > 0)}
                  disabled={!selectedServer || checkingDocker || !dockerStatus?.installed || !dockerStatus?.running}
                >
                  {portConflicts && portConflicts.length > 0 ? 'Deploy Anyway' : 'Deploy'}
                </Button>
              </div>
            </>
          )}

          {(isDeploying || deployOutput) && (
            <div className={styles.deployTerminal}>
              <div className={styles.terminalHeader}>
                {isDeploying && <span className={styles.deployingIndicator}>● DEPLOYING</span>}
                {!isDeploying && deployOutput && <span className={styles.doneIndicator}>✓ COMPLETE</span>}
              </div>
              <pre ref={deployOutputRef} className={styles.terminalOutput}>
                {deployOutput || 'Starting deployment...'}
              </pre>
              {!isDeploying && deployOutput && (
                <div className={styles.deployActions}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setShowDeployModal(false);
                      setDeployOutput('');
                      setSelectedServer('');
                    }}
                  >
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </Layout>
  );
};

// Deployment row component with stats fetching
const DeploymentRow = ({ deployment, appId, onRemove }) => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const result = await appsService.getDeploymentStats(appId, deployment.id);
        setStats(result);
      } catch (error) {
        // Container might be stopped/removed
        setStats({ status: 'unknown' });
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [appId, deployment.id]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'running':
        return <span className={styles.statusRunning}><CheckCircleIcon size={14} /> Running</span>;
      case 'exited':
        return <span className={styles.statusStopped}><XCircleIcon size={14} /> Stopped</span>;
      default:
        return <span className={styles.statusUnknown}>Unknown</span>;
    }
  };

  return (
    <div className={styles.tableRow}>
      <div>
        <strong>{deployment.server_name || 'Unknown'}</strong>
        <div className={styles.serverIp}>{deployment.server_ip}</div>
      </div>
      <div>
        <code>{deployment.container_name}</code>
        <div className={styles.containerId}>{deployment.container_id}</div>
      </div>
      <div>
        {stats ? getStatusBadge(stats.status) : <span className={styles.loading}>...</span>}
        {stats && stats.cpu && (
          <div className={styles.statsRow}>
            CPU: {stats.cpu} | Mem: {stats.memoryPercent}
          </div>
        )}
      </div>
      <div>
        {deployment.port_mappings && deployment.port_mappings.map((p, i) => (
          <span key={i} className={styles.portBadge}>{p.host}:{p.container}</span>
        ))}
      </div>
      <div className={styles.deployedAt}>
        {new Date(deployment.deployed_at).toLocaleString()}
      </div>
      <div>
        <Button variant="danger" size="small" onClick={onRemove}>
          <TrashIcon size={14} />
        </Button>
      </div>
    </div>
  );
};

export default AppDetail;
