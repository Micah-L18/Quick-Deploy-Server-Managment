import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import SnapshotModal from '../components/SnapshotModal';
import IconSelector from '../components/IconSelector';
import { appsService } from '../api/apps';
import { serversService } from '../api/servers';
import { AppsIcon, AlertIcon, RefreshIcon, TrashIcon, PlayIcon, CheckCircleIcon, XCircleIcon, RocketIcon, DockerIcon, ClipboardIcon, SettingsIcon, GlobeAltIcon, FileIcon, LayersIcon, HardDriveIcon, XIcon } from '../components/Icons';
import { parseDockerRun, generateDockerRun } from '../utils/dockerParser';
import { parseDockerComposeYaml, generateDockerComposeYaml } from '../utils/yamlParser';
import styles from './AppDetail.module.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';

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
    use_custom_registry: false,
    web_ui_port: '',
    icon: '',
    icon_url: ''
  });
  const [hasChanges, setHasChanges] = useState(false);
  
  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importType, setImportType] = useState('docker-run'); // 'docker-run' or 'yaml'
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  
  // YAML editing state
  const [yamlText, setYamlText] = useState('');
  const [yamlError, setYamlError] = useState('');
  const [yamlHasChanges, setYamlHasChanges] = useState(false);
  
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

  // Fetch deployments for this app
  const { data: deployments = [] } = useQuery({
    queryKey: ['app-deployments', id],
    queryFn: () => appsService.getDeployments(id),
    enabled: !!id,
  });

  // Snapshot modal state
  const [snapshotModal, setSnapshotModal] = useState({ isOpen: false, deployment: null, server: null });

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
        use_custom_registry: !!(app.registry_url || app.registry_username),
        web_ui_port: app.web_ui_port || '',
        icon: app.icon || '',
        icon_url: app.icon_url || ''
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
    // Reset YAML changes indicator since form is the source of truth now
    setYamlHasChanges(false);
  };

  const handleSaveConfig = () => {
    updateMutation.mutate(formData);
  };

  // Import handlers
  const handleImport = () => {
    setImportError('');
    
    if (!importText.trim()) {
      setImportError('Please enter a command or YAML to import');
      return;
    }
    
    try {
      if (importType === 'docker-run') {
        const parsed = parseDockerRun(importText);
        
        // Apply parsed data to form
        setFormData(prev => ({
          ...prev,
          name: parsed.name || prev.name,
          image: parsed.image || prev.image,
          tag: parsed.tag || prev.tag,
          ports: parsed.ports.length > 0 ? parsed.ports : prev.ports,
          env_vars: parsed.env_vars.length > 0 ? parsed.env_vars : prev.env_vars,
          volumes: parsed.volumes.length > 0 ? parsed.volumes : prev.volumes,
          restart_policy: parsed.restart_policy || prev.restart_policy,
          network_mode: parsed.network_mode || prev.network_mode,
          command: parsed.command || prev.command,
          custom_args: parsed.custom_args || prev.custom_args,
        }));
        
        setHasChanges(true);
        setShowImportModal(false);
        setImportText('');
      } else {
        // YAML import
        const result = parseDockerComposeYaml(importText);
        
        if (!result.success) {
          setImportError(result.error);
          return;
        }
        
        const parsed = result.config;
        
        // Apply parsed data to form
        setFormData(prev => ({
          ...prev,
          name: parsed.name || prev.name,
          image: parsed.image || prev.image,
          tag: parsed.tag || prev.tag,
          ports: parsed.ports.length > 0 ? parsed.ports : prev.ports,
          env_vars: parsed.env_vars.length > 0 ? parsed.env_vars : prev.env_vars,
          volumes: parsed.volumes.length > 0 ? parsed.volumes : prev.volumes,
          restart_policy: parsed.restart_policy || prev.restart_policy,
          network_mode: parsed.network_mode || prev.network_mode,
          command: parsed.command || prev.command,
        }));
        
        setHasChanges(true);
        setShowImportModal(false);
        setImportText('');
      }
    } catch (error) {
      setImportError(`Failed to parse: ${error.message}`);
    }
  };

  // YAML editing handlers
  const handleYamlChange = (newYaml) => {
    setYamlText(newYaml);
    setYamlHasChanges(true);
    setYamlError('');
  };

  const handleApplyYaml = () => {
    setYamlError('');
    
    try {
      const result = parseDockerComposeYaml(yamlText);
      
      if (!result.success) {
        setYamlError(result.error);
        return;
      }
      
      const parsed = result.config;
      
      // Check if form has unsaved changes
      if (hasChanges) {
        if (!window.confirm('You have unsaved form changes. Applying YAML will overwrite them. Continue?')) {
          return;
        }
      }
      
      // Apply parsed YAML to form
      setFormData(prev => ({
        ...prev,
        name: parsed.name || prev.name,
        image: parsed.image || '',
        tag: parsed.tag || 'latest',
        ports: parsed.ports || [],
        env_vars: parsed.env_vars || [],
        volumes: parsed.volumes || [],
        restart_policy: parsed.restart_policy || 'unless-stopped',
        network_mode: parsed.network_mode || '',
        command: parsed.command || '',
      }));
      
      setHasChanges(true);
      setYamlHasChanges(false);
    } catch (error) {
      setYamlError(`Invalid YAML: ${error.message}`);
    }
  };

  // Generate YAML when switching to YAML tab (regenerate from form data)
  useEffect(() => {
    if (activeTab === 'yaml') {
      // Always regenerate YAML from form data when switching to YAML tab
      // unless the user has made manual edits
      if (!yamlHasChanges) {
        const generatedYaml = generateDockerComposeYaml(formData);
        setYamlText(generatedYaml);
      }
    }
  }, [activeTab]); // Only trigger on tab change
  
  // Also update YAML when form data changes and we're on config tab
  useEffect(() => {
    // Reset YAML changes flag when form data changes from config tab
    if (activeTab === 'config' && hasChanges) {
      setYamlHasChanges(false);
    }
  }, [formData, activeTab, hasChanges]);

  // Generate docker run command for display
  const generateDockerRunCommand = () => {
    return generateDockerRun({
      ...formData,
      name: formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    });
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
              <DockerIcon size={16} /> {app.image}:{app.tag || 'latest'}
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
          <SettingsIcon size={16} /> Config
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'yaml' ? styles.activeTab : ''}`}
          onClick={() => {
            // Reset YAML changes so it regenerates from form
            if (activeTab !== 'yaml') {
              setYamlHasChanges(false);
              const generatedYaml = generateDockerComposeYaml(formData);
              setYamlText(generatedYaml);
            }
            setActiveTab('yaml');
          }}
        >
          <FileIcon size={16} style={{ marginRight: '6px', display: 'inline-block' }} />
          YAML
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'deployments' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('deployments')}
        >
          <LayersIcon size={16} /> Deployments
          {deployments.length > 0 && (
            <span className={styles.tabBadge}>{deployments.length}</span>
          )}
        </button>
      </div>

      {/* Config Tab */}
      {activeTab === 'config' && (
        <div className={styles.tabContent}>
          {/* Import Section */}
          <div className={styles.importSection}>
            <div className={styles.importHeader}>
              <h3>📥 Quick Import</h3>
              <p>Import configuration from a docker run command or docker-compose YAML</p>
            </div>
            <div className={styles.importActions}>
              <Button
                variant="outline"
                onClick={() => {
                  setImportType('docker-run');
                  setImportText('');
                  setImportError('');
                  setShowImportModal(true);
                }}
              >
                Import from docker run
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setImportType('yaml');
                  setImportText('');
                  setImportError('');
                  setShowImportModal(true);
                }}
              >
                Import from YAML
              </Button>
            </div>
          </div>

          <div className={styles.configGrid}>
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
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <IconSelector
                    value={formData.icon}
                    iconUrl={formData.icon_url}
                    onChange={(data) => {
                      setFormData(prev => ({
                        ...prev,
                        icon: data.icon || '',
                        icon_url: data.iconUrl || ''
                      }));
                      setHasChanges(true);
                    }}
                    label="App Icon"
                    showCustomUpload={true}
                  />
                  {hasChanges && (formData.icon !== app?.icon || formData.icon_url !== app?.icon_url) && (
                    <Button
                      variant="primary"
                      size="small"
                      onClick={handleSaveConfig}
                      style={{ marginTop: '8px' }}
                    >
                      Save Icon
                    </Button>
                  )}
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
                <button className={styles.removeBtn} onClick={() => removePort(index)}>
                  <XIcon size={16} />
                </button>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addPort}>+ Add Port Mapping</button>
            
            {/* Web UI Configuration */}
            <div className={styles.webUiConfig}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={!!formData.web_ui_port}
                  onChange={(e) => {
                    if (e.target.checked) {
                      // Default to first port with a host value
                      const firstPort = formData.ports.find(p => p.host);
                      handleFormChange('web_ui_port', firstPort?.host || '');
                    } else {
                      handleFormChange('web_ui_port', '');
                    }
                  }}
                />
                <span>This container has a Web UI</span>
              </label>
              {formData.web_ui_port && formData.ports.filter(p => p.host).length > 0 && (
                <div className={styles.webUiPortSelect}>
                  <label>Web UI Port:</label>
                  <select
                    value={formData.web_ui_port}
                    onChange={(e) => handleFormChange('web_ui_port', e.target.value)}
                  >
                    {formData.ports.filter(p => p.host).map((port, idx) => (
                      <option key={idx} value={port.host}>
                        {port.host} → {port.container}
                      </option>
                    ))}
                  </select>
                  <span className={styles.hint}>Quick link will open http://server-ip:{formData.web_ui_port}</span>
                </div>
              )}
            </div>
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
                <button className={styles.removeBtn} onClick={() => removeEnvVar(index)}>
                  <XIcon size={16} />
                </button>
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
                <button className={styles.removeBtn} onClick={() => removeVolume(index)}>
                  <XIcon size={16} />
                </button>
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

          <div className={styles.deleteSection}>
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
              <div className={styles.yamlActions}>
                {yamlHasChanges && (
                  <span className={styles.yamlUnsaved}>Unsaved YAML changes</span>
                )}
                <Button
                  variant="outline"
                  size="small"
                  onClick={() => {
                    const generatedYaml = generateDockerComposeYaml(formData);
                    setYamlText(generatedYaml);
                    setYamlHasChanges(false);
                    setYamlError('');
                  }}
                  disabled={!yamlHasChanges}
                >
                  Reset to Form
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleApplyYaml}
                  disabled={!yamlHasChanges}
                >
                  Apply YAML to Form
                </Button>
                <Button
                  variant="outline"
                  size="small"
                  onClick={() => {
                    navigator.clipboard.writeText(yamlText);
                  }}
                >
                  <ClipboardIcon size={14} /> Copy
                </Button>
              </div>
            </div>
            {yamlError && (
              <div className={styles.yamlError}>
                <AlertIcon size={16} /> {yamlError}
              </div>
            )}
            <textarea
              className={styles.yamlEditor}
              value={yamlText}
              onChange={(e) => handleYamlChange(e.target.value)}
              spellCheck={false}
              placeholder="# Docker Compose YAML will appear here..."
            />
            <div className={styles.yamlHint}>
              <p>Edit the YAML above and click "Apply YAML to Form" to update the configuration. Changes are bidirectional - form edits update YAML, YAML edits can update the form.</p>
            </div>
          </div>
          
          <div className={styles.dockerRunSection}>
            <div className={styles.yamlHeader}>
              <h3>Docker Run Command</h3>
              <Button
                variant="outline"
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(generateDockerRunCommand());
                }}
              >
                <ClipboardIcon size={14} /> Copy
              </Button>
            </div>
            <pre className={styles.dockerRunCode}>{generateDockerRunCommand()}</pre>
          </div>
        </div>
      )}

      {/* Deployments Tab */}
      {activeTab === 'deployments' && (
        <div className={styles.tabContent}>
          <div className={styles.deploymentsSection}>
            <div className={styles.deploymentsHeader}>
              <h3>Active Deployments</h3>
              <p>Manage your running container instances across servers</p>
            </div>
            
            {deployments.length === 0 ? (
              <div className={styles.noDeployments}>
                <LayersIcon size={48} color="var(--text-secondary)" />
                <p>No active deployments</p>
                <p className={styles.noDeploymentsHint}>Deploy this app to a server to see it here</p>
              </div>
            ) : (
              <div className={styles.deploymentsTable}>
                <div className={styles.tableHeader}>
                  <div>Server</div>
                  <div>Container</div>
                  <div>Status</div>
                  <div>Ports</div>
                  <div>Deployed</div>
                  <div>Actions</div>
                </div>
                {deployments.map(deployment => (
                  <DeploymentRow
                    key={deployment.id}
                    deployment={deployment}
                    appId={id}
                    webUiPort={formData.web_ui_port}
                    onRemove={() => handleRemoveDeployment(deployment)}
                    onSnapshot={() => {
                      // Find the server for this deployment
                      const server = servers.find(s => s.id === deployment.server_id);
                      setSnapshotModal({ isOpen: true, deployment, server });
                    }}
                  />
                ))}
              </div>
            )}
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
        title={<><RocketIcon size={20} /> Deploy Application</>}
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
                  <strong><AlertIcon size={18} style={{ marginRight: '8px', display: 'inline-block' }} />Docker Not Available</strong>
                  <p>{dockerStatus.message || 'Docker is not installed on this server.'}</p>
                  <p>Please install Docker on the server before deploying.</p>
                  <Link to={`/servers/${selectedServer}?tab=services`} className={styles.dockerInstallLink}>
                    <Button variant="secondary" size="small">Go to Services Tab →</Button>
                  </Link>
                </div>
              )}

              {selectedServer && !checkingDocker && dockerStatus && dockerStatus.installed && !dockerStatus.running && (
                <div className={styles.dockerWarning}>
                  <strong><AlertIcon size={18} style={{ marginRight: '8px', display: 'inline-block' }} />Docker Not Running</strong>
                  <p>Docker is installed but the daemon is not running. Please start Docker on the server.</p>
                </div>
              )}

              {selectedServer && !checkingDocker && dockerStatus && dockerStatus.installed && dockerStatus.running && (
                <div className={styles.dockerSuccess}>
                  <CheckCircleIcon size={20} />
                  <strong>Docker Ready</strong>
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
                        <span className={styles.portConflict}><AlertIcon size={12} style={{ marginRight: '4px', display: 'inline-block' }} />In use</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {portConflicts && portConflicts.length > 0 && (
                <div className={styles.conflictWarning}>
                  <strong><AlertIcon size={18} style={{ marginRight: '8px', display: 'inline-block' }} />Port Conflict Detected</strong>
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
                {!isDeploying && deployOutput && <span className={styles.doneIndicator}><CheckCircleIcon size={16} /> COMPLETE</span>}
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

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title={importType === 'docker-run' ? '📥 Import from Docker Run' : '📥 Import from YAML'}
      >
        <div className={styles.importModal}>
          <div className={styles.importTypeToggle}>
            <button
              className={`${styles.importTypeBtn} ${importType === 'docker-run' ? styles.active : ''}`}
              onClick={() => {
                setImportType('docker-run');
                setImportError('');
              }}
            >
              docker run
            </button>
            <button
              className={`${styles.importTypeBtn} ${importType === 'yaml' ? styles.active : ''}`}
              onClick={() => {
                setImportType('yaml');
                setImportError('');
              }}
            >
              YAML
            </button>
          </div>
          
          <div className={styles.importInstructions}>
            {importType === 'docker-run' ? (
              <p>Paste a <code>docker run</code> command below. Supported flags: <code>-p</code>, <code>-e</code>, <code>-v</code>, <code>--name</code>, <code>--restart</code>, <code>--network</code>. Other flags will be added to Custom Args.</p>
            ) : (
              <p>Paste docker-compose YAML below. The first service will be imported.</p>
            )}
          </div>
          
          <textarea
            className={styles.importTextarea}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={importType === 'docker-run' 
              ? 'docker run -d -p 8080:80 --name myapp -e ENV=prod nginx:latest'
              : "version: '3.8'\nservices:\n  myapp:\n    image: nginx:latest\n    ports:\n      - \"8080:80\""
            }
            rows={importType === 'yaml' ? 12 : 6}
            spellCheck={false}
          />
          
          {importError && (
            <div className={styles.importError}>
              <AlertIcon size={16} /> {importError}
            </div>
          )}
          
          <div className={styles.importModalActions}>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImport}>
              Import Configuration
            </Button>
          </div>
        </div>
      </Modal>

      {/* Snapshot Modal */}
      <SnapshotModal
        isOpen={snapshotModal.isOpen}
        onClose={() => setSnapshotModal({ isOpen: false, deployment: null, server: null })}
        deployment={snapshotModal.deployment}
        server={snapshotModal.server}
      />
    </Layout>
  );
};

// Deployment row component with stats fetching
const DeploymentRow = ({ deployment, appId, onRemove, onSnapshot, webUiPort }) => {
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
        {(() => {
          const portMappings = typeof deployment.port_mappings === 'string' 
            ? JSON.parse(deployment.port_mappings || '[]') 
            : (deployment.port_mappings || []);
          return portMappings.map((p, i) => (
            <span key={i} className={styles.portBadge}>{p.host}:{p.container}</span>
          ));
        })()}
      </div>
      <div className={styles.deployedAt}>
        {new Date(deployment.deployed_at).toLocaleString()}
      </div>
      <div className={styles.deploymentActions}>
        {(() => {
          // Find the correct external port for the Web UI
          if (!webUiPort || stats?.status !== 'running' || !deployment.server_ip) return null;
          
          const portMappings = typeof deployment.port_mappings === 'string' 
            ? JSON.parse(deployment.port_mappings || '[]') 
            : (deployment.port_mappings || []);
          
          // Try to find the external (host) port
          // webUiPort might be the host port or container port, so check both
          let externalPort = webUiPort;
          
          // First check if webUiPort matches a host port directly
          const hostMatch = portMappings.find(p => String(p.host) === String(webUiPort));
          if (hostMatch) {
            externalPort = hostMatch.host;
          } else {
            // If webUiPort matches a container port, get the corresponding host port
            const containerMatch = portMappings.find(p => String(p.container) === String(webUiPort));
            if (containerMatch) {
              externalPort = containerMatch.host;
            }
          }
          
          return (
            <a
              href={`http://${deployment.server_ip}:${externalPort}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="primary" size="small">
                <GlobeAltIcon size={14} /> Open UI
              </Button>
            </a>
          );
        })()}
        <Button variant="secondary" size="small" onClick={onSnapshot} title="Manage Snapshots">
          <HardDriveIcon size={14} />
        </Button>
        <Button variant="danger" size="small" onClick={onRemove}>
          <TrashIcon size={14} />
        </Button>
      </div>
    </div>
  );
};

export default AppDetail;
