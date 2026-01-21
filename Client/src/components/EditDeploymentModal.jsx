import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import Modal from './Modal';
import Button from './Button';
import ConfirmModal from './ConfirmModal';
import { appsService } from '../api/apps';
import { generateDockerRun } from '../utils/dockerParser';
import { generateDockerComposeYaml } from '../utils/yamlParser';
import styles from './EditDeploymentModal.module.css';

const EditDeploymentModal = ({ isOpen, onClose, deployment, serverId, server }) => {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('config');
  const [copied, setCopied] = useState(null);
  const [portConflicts, setPortConflicts] = useState([]);
  const [checkingPorts, setCheckingPorts] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState({ isOpen: false, type: null, index: null });
  
  // Form state - initialized from deployment config or app defaults
  const [formData, setFormData] = useState({
    port_mappings: [],
    env_vars: [],
    volumes: [],
    restart_policy: 'unless-stopped',
    network_mode: '',
    command: '',
    custom_args: ''
  });

  // Fetch fresh deployment data when modal opens
  const { data: freshDeployment, isLoading: loadingDeployment } = useQuery({
    queryKey: ['deployment-detail', deployment?.app_id, deployment?.id],
    queryFn: () => appsService.getDeployment(deployment.app_id, deployment.id),
    enabled: isOpen && !!deployment?.app_id && !!deployment?.id,
    staleTime: 0, // Always fetch fresh
  });

  // Initialize form when fresh deployment data is loaded
  useEffect(() => {
    if (isOpen && freshDeployment) {
      // Parse JSON fields if they're strings
      const parseJson = (val) => {
        if (!val) return [];
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return []; }
        }
        return val;
      };

      // Use deployment-specific config if available, otherwise fall back to app defaults
      const appConfig = freshDeployment.app_config || {};
      
      setFormData({
        port_mappings: parseJson(freshDeployment.port_mappings)?.length > 0 
          ? parseJson(freshDeployment.port_mappings) 
          : parseJson(appConfig.ports) || [],
        env_vars: parseJson(freshDeployment.env_vars)?.length > 0 
          ? parseJson(freshDeployment.env_vars) 
          : parseJson(appConfig.env_vars) || [],
        volumes: parseJson(freshDeployment.volumes)?.length > 0 
          ? parseJson(freshDeployment.volumes) 
          : parseJson(appConfig.volumes) || [],
        restart_policy: freshDeployment.restart_policy || appConfig.restart_policy || 'unless-stopped',
        network_mode: freshDeployment.network_mode || appConfig.network_mode || '',
        command: freshDeployment.command || appConfig.command || '',
        custom_args: freshDeployment.custom_args || appConfig.custom_args || ''
      });
      setError('');
      setIsSaving(false);
      setActiveTab('config');
      setCopied(null);
      setPortConflicts([]);
    }
  }, [isOpen, freshDeployment]);

  // Check port availability when ports change
  const checkPortAvailability = async () => {
    if (!deployment?.app_id || !serverId || formData.port_mappings.length === 0) {
      setPortConflicts([]);
      return;
    }

    const hostPorts = formData.port_mappings
      .map(p => p.host)
      .filter(p => p && p.trim());
    
    if (hostPorts.length === 0) {
      setPortConflicts([]);
      return;
    }

    setCheckingPorts(true);
    try {
      // Pass deployment.id to exclude this deployment's own ports from conflict check
      const result = await appsService.checkPorts(deployment.app_id, serverId, formData.port_mappings, deployment.id);
      if (result.conflicts && result.conflicts.length > 0) {
        // Filter out conflicts for ports used by this same container (by container name, for running containers)
        const conflicts = result.conflicts.filter(c => {
          // If the port is in use by this container's name, it's okay
          return !c.details?.includes(deployment.container_name);
        });
        setPortConflicts(conflicts.map(c => c.port));
      } else {
        setPortConflicts([]);
      }
    } catch (err) {
      console.error('Port check failed:', err);
    }
    setCheckingPorts(false);
  };

  // Debounce port checking
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(checkPortAvailability, 500);
    return () => clearTimeout(timer);
  }, [formData.port_mappings, isOpen]);

  // Generate preview commands based on current form data
  const previewConfig = useMemo(() => {
    const dep = freshDeployment || deployment;
    if (!dep) return { dockerRun: '', yaml: '' };
    
    // Build config object for generators
    const config = {
      name: dep.container_name,
      image: dep.app_image || deployment?.app_image || '',
      tag: dep.app_tag || deployment?.app_tag || 'latest',
      ports: formData.port_mappings,
      env_vars: formData.env_vars,
      volumes: formData.volumes,
      restart_policy: formData.restart_policy,
      network_mode: formData.network_mode,
      command: formData.command,
      custom_args: formData.custom_args
    };
    
    return {
      dockerRun: generateDockerRun(config),
      yaml: generateDockerComposeYaml(config)
    };
  }, [deployment, freshDeployment, formData]);

  const handleCopy = (type, text) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const updateMutation = useMutation({
    mutationFn: (config) => appsService.updateDeployment(deployment.app_id, deployment.id, config),
    onSuccess: () => {
      setIsSaving(false);
      queryClient.invalidateQueries(['server-deployments', serverId]);
      queryClient.invalidateQueries(['app-deployments']);
      queryClient.invalidateQueries(['deployment-detail', deployment.app_id, deployment.id]);
      onClose();
    },
    onError: (err) => {
      setError(err.response?.data?.error || err.message || 'Failed to update deployment');
      setIsSaving(false);
    }
  });

  const handleSave = () => {
    setIsSaving(true);
    setError('');
    updateMutation.mutate(formData);
  };

  // Port mapping handlers
  const addPort = () => {
    setFormData(prev => ({
      ...prev,
      port_mappings: [...prev.port_mappings, { host: '', container: '' }]
    }));
  };

  const updatePort = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      port_mappings: prev.port_mappings.map((p, i) => 
        i === index ? { ...p, [field]: value } : p
      )
    }));
  };

  const removePort = (index) => {
    setConfirmRemove({ isOpen: true, type: 'port', index });
  };

  // Environment variable handlers
  const addEnvVar = () => {
    setFormData(prev => ({
      ...prev,
      env_vars: [...prev.env_vars, { key: '', value: '' }]
    }));
  };

  const updateEnvVar = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      env_vars: prev.env_vars.map((e, i) => 
        i === index ? { ...e, [field]: value } : e
      )
    }));
  };

  const removeEnvVar = (index) => {
    setConfirmRemove({ isOpen: true, type: 'env', index });
  };

  // Volume handlers
  const addVolume = () => {
    setFormData(prev => ({
      ...prev,
      volumes: [...prev.volumes, { host: '', container: '' }]
    }));
  };

  const updateVolume = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      volumes: prev.volumes.map((v, i) => 
        i === index ? { ...v, [field]: value } : v
      )
    }));
  };

  const removeVolume = (index) => {
    setConfirmRemove({ isOpen: true, type: 'volume', index });
  };

  const handleConfirmRemove = () => {
    const { type, index } = confirmRemove;
    if (type === 'port') {
      setFormData(prev => ({
        ...prev,
        port_mappings: prev.port_mappings.filter((_, i) => i !== index)
      }));
    } else if (type === 'env') {
      setFormData(prev => ({
        ...prev,
        env_vars: prev.env_vars.filter((_, i) => i !== index)
      }));
    } else if (type === 'volume') {
      setFormData(prev => ({
        ...prev,
        volumes: prev.volumes.filter((_, i) => i !== index)
      }));
    }
  };

  const getConfirmMessage = () => {
    switch (confirmRemove.type) {
      case 'port': return 'Are you sure you want to remove this port mapping?';
      case 'env': return 'Are you sure you want to remove this environment variable?';
      case 'volume': return 'Are you sure you want to remove this volume mount?';
      default: return 'Are you sure?';
    }
  };

  if (!deployment) return null;

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Deployment: ${deployment.container_name}`}
      size="large"
      footer={
        <div className={styles.modalFooter}>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSave} 
            disabled={isSaving || activeTab === 'preview' || portConflicts.length > 0}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      {loadingDeployment ? (
        <div className={styles.loading}>Loading deployment configuration...</div>
      ) : (
        <>
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'config' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Configuration
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'preview' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          👁️ Preview Commands
        </button>
      </div>

      {activeTab === 'config' && (
      <div className={styles.editForm}>
        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}

        <div className={styles.infoBox}>
          <strong>Note:</strong> Changes will take effect the next time the container is started.
          The container will be recreated with the new configuration.
        </div>

        {/* Port Mappings */}
        <div className={styles.configSection}>
          <h3>Port Mappings {checkingPorts && <span className={styles.checkingIndicator}>checking...</span>}</h3>
          <p className={styles.hint}>Map host ports to container ports. The host port is what you access from outside, the container port is where the app listens inside.</p>
          {portConflicts.length > 0 && (
            <div className={styles.portConflictWarning}>
              ⚠️ Port conflict detected: {portConflicts.join(', ')} already in use on this server
            </div>
          )}
          {formData.port_mappings.length > 0 && (
            <div className={styles.portLabels}>
              <span className={styles.portLabel}>Host Port (external)</span>
              <span className={styles.portLabelSpacer}></span>
              <span className={styles.portLabel}>Container Port (internal)</span>
            </div>
          )}
          {formData.port_mappings.map((port, index) => (
            <div key={index} className={styles.arrayRow}>
              <input
                type="text"
                value={port.host}
                onChange={(e) => updatePort(index, 'host', e.target.value)}
                placeholder="e.g., 8080"
                className={portConflicts.includes(port.host) ? styles.portConflict : ''}
              />
              <span className={styles.arrow}>→</span>
              <input
                type="text"
                value={port.container}
                onChange={(e) => updatePort(index, 'container', e.target.value)}
                placeholder="e.g., 80"
              />
              <button className={styles.removeBtn} onClick={() => removePort(index)}>×</button>
            </div>
          ))}
          <button className={styles.addBtn} onClick={addPort}>+ Add Port Mapping</button>
        </div>

        {/* Environment Variables */}
        <div className={styles.configSection}>
          <h3>Environment Variables</h3>
          <p className={styles.hint}>Set environment variables for the container</p>
          {formData.env_vars.map((env, index) => (
            <div key={index} className={styles.arrayRow}>
              <input
                type="text"
                value={env.key}
                onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                placeholder="Variable Name"
              />
              <span className={styles.equals}>=</span>
              <input
                type="text"
                value={env.value}
                onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                placeholder="Value"
              />
              <button className={styles.removeBtn} onClick={() => removeEnvVar(index)}>×</button>
            </div>
          ))}
          <button className={styles.addBtn} onClick={addEnvVar}>+ Add Environment Variable</button>
        </div>

        {/* Volume Mounts */}
        <div className={styles.configSection}>
          <h3>Volume Mounts</h3>
          <p className={styles.hint}>Mount host directories into the container</p>
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
                placeholder="Container Path (e.g., /app/data)"
              />
              <button className={styles.removeBtn} onClick={() => removeVolume(index)}>×</button>
            </div>
          ))}
          <button className={styles.addBtn} onClick={addVolume}>+ Add Volume Mount</button>
        </div>

        {/* Advanced Options */}
        <div className={styles.configSection}>
          <h3>Advanced Options</h3>
          
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Restart Policy</label>
              <select
                value={formData.restart_policy}
                onChange={(e) => setFormData(prev => ({ ...prev, restart_policy: e.target.value }))}
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
                onChange={(e) => setFormData(prev => ({ ...prev, network_mode: e.target.value }))}
                placeholder="bridge, host, or custom network"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Command Override</label>
            <input
              type="text"
              value={formData.command}
              onChange={(e) => setFormData(prev => ({ ...prev, command: e.target.value }))}
              placeholder="Override default container command"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Custom Docker Arguments</label>
            <input
              type="text"
              value={formData.custom_args}
              onChange={(e) => setFormData(prev => ({ ...prev, custom_args: e.target.value }))}
              placeholder="Additional docker run arguments (e.g., --cap-add=SYS_ADMIN)"
            />
          </div>
        </div>
      </div>
      )}

      {activeTab === 'preview' && (
        <div className={styles.previewContainer}>
          <div className={styles.infoBox}>
            <strong>Preview:</strong> These are the commands that will be used when the container is recreated.
          </div>

          {/* Docker Run Command */}
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <h3>Docker Run Command</h3>
              <button 
                className={styles.copyBtn}
                onClick={() => handleCopy('docker', previewConfig.dockerRun)}
              >
                {copied === 'docker' ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
            <pre className={styles.codeBlock}>{previewConfig.dockerRun}</pre>
          </div>

          {/* Docker Compose YAML */}
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <h3>Docker Compose YAML</h3>
              <button 
                className={styles.copyBtn}
                onClick={() => handleCopy('yaml', previewConfig.yaml)}
              >
                {copied === 'yaml' ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
            <pre className={styles.codeBlock}>{previewConfig.yaml}</pre>
          </div>
        </div>
      )}
        </>
      )}
    </Modal>

    {/* Confirm Remove Modal - outside parent modal */}
    <ConfirmModal
      isOpen={confirmRemove.isOpen}
      onClose={() => setConfirmRemove({ isOpen: false, type: null, index: null })}
      onConfirm={handleConfirmRemove}
      title="Remove Item"
      message={getConfirmMessage()}
      confirmText="Remove"
      variant="danger"
    />
    </>
  );
};

export default EditDeploymentModal;
