import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { appsService } from '../api/apps';
import { templatesService } from '../api/templates';
import { 
  AppsIcon, 
  PlusIcon, 
  TrashIcon, 
  EyeIcon, 
  PlayIcon,
  StopCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshIcon
} from '../components/Icons';
import styles from './Apps.module.css';

const Apps = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('deployed');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedDeployments, setExpandedDeployments] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  // Apps query
  const { data: apps, isLoading: appsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: appsService.getApps,
  });

  // All deployments query
  const { data: deployments = [], isLoading: deploymentsLoading } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: async () => {
      const data = await appsService.getAllDeployments();
      // Parse port_mappings for each deployment
      return data.map(d => {
        let portMappings = d.port_mappings;
        if (typeof portMappings === 'string') {
          try {
            portMappings = JSON.parse(portMappings);
          } catch {
            portMappings = [];
          }
        }
        return { ...d, port_mappings: portMappings || [] };
      });
    },
    refetchInterval: 10000,
  });

  // Templates query
  const { data: templatesData, isLoading: templatesLoading, isFetching: templatesFetching, error: templatesError } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      console.log('Fetching templates...');
      const result = await templatesService.getTemplates();
      console.log('Templates result:', result);
      return result;
    },
    enabled: activeTab === 'templates',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  // Debug log
  console.log('Templates state:', { templatesData, templatesLoading, templatesFetching, templatesError, activeTab });

  const createAppMutation = useMutation({
    mutationFn: appsService.createApp,
    onSuccess: () => {
      queryClient.invalidateQueries(['apps']);
      setShowAddModal(false);
      setFormData({ name: '', description: '' });
    },
  });

  // Create app from template and navigate to it
  const createFromTemplateMutation = useMutation({
    mutationFn: async (template) => {
      // Create the app first
      const app = await appsService.createApp({
        name: template.name,
        description: template.description,
      });
      
      // Then update it with template config
      await appsService.updateApp(app.id, {
        image: template.image,
        tag: template.tag || 'latest',
        ports: template.ports || [],
        env_vars: (template.env_vars || []).map(e => ({ key: e.key, value: e.value || '' })),
        volumes: (template.volumes || []).map(v => ({ host: v.host, container: v.container })),
        restart_policy: template.restart_policy || 'unless-stopped',
        network_mode: template.network_mode || '',
        command: template.command || '',
      });
      
      return app;
    },
    onSuccess: (app) => {
      queryClient.invalidateQueries(['apps']);
      navigate(`/apps/${app.id}`);
    },
  });

  const handleUseTemplate = (template) => {
    createFromTemplateMutation.mutate(template);
  };

  const deleteAppMutation = useMutation({
    mutationFn: appsService.deleteApp,
    onSuccess: () => {
      queryClient.invalidateQueries(['apps']);
    },
  });

  const removeDeploymentMutation = useMutation({
    mutationFn: ({ appId, deploymentId }) => appsService.removeDeployment(appId, deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-deployments']);
    },
  });

  const startDeploymentMutation = useMutation({
    mutationFn: ({ appId, deploymentId }) => appsService.startDeployment(appId, deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-deployments']);
    },
  });

  const stopDeploymentMutation = useMutation({
    mutationFn: ({ appId, deploymentId }) => appsService.stopDeployment(appId, deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-deployments']);
    },
  });

  const handleCreateApp = (e) => {
    e.preventDefault();
    createAppMutation.mutate(formData);
  };

  const handleDeleteApp = (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteAppMutation.mutate(id);
    }
  };

  const handleRemoveDeployment = (deployment) => {
    if (window.confirm(`Stop and remove container "${deployment.container_name}"?`)) {
      removeDeploymentMutation.mutate({ appId: deployment.app_id, deploymentId: deployment.id });
    }
  };

  const toggleDeploymentStats = (deploymentId) => {
    setExpandedDeployments(prev => ({
      ...prev,
      [deploymentId]: !prev[deploymentId]
    }));
  };

  const toggleDeploymentLogs = (deploymentId) => {
    setExpandedLogs(prev => ({
      ...prev,
      [deploymentId]: !prev[deploymentId]
    }));
  };

  // Component for deployment stats section
  const DeploymentStatsRow = ({ deployment }) => {
    const { data: stats, isLoading: statsLoading } = useQuery({
      queryKey: ['deployment-stats', deployment.app_id, deployment.id],
      queryFn: () => appsService.getDeploymentStats(deployment.app_id, deployment.id),
      enabled: deployment.status === 'running',
      refetchInterval: 5000,
    });

    return (
      <div className={styles.statsRow}>
        <div className={styles.statsContent}>
          {statsLoading ? (
            <div className={styles.statsLoading}>Loading container stats...</div>
          ) : stats ? (
            <div className={styles.statsGrid}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>CPU Usage</span>
                <span className={styles.statValue}>{stats.cpu}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Memory Usage</span>
                <span className={styles.statValue}>{stats.memory}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Memory %</span>
                <span className={styles.statValue}>{stats.memoryPercent}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Container Status</span>
                <span className={styles.statValue}>{stats.status}</span>
              </div>
            </div>
          ) : (
            <div className={styles.statsError}>Failed to load stats</div>
          )}
        </div>
      </div>
    );
  };

  // Component for deployment logs section
  const DeploymentLogsRow = ({ deployment }) => {
    const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
      queryKey: ['deployment-logs', deployment.app_id, deployment.id],
      queryFn: () => appsService.getDeploymentLogs(deployment.app_id, deployment.id, 100),
      enabled: true,
    });

    return (
      <div className={styles.logsRow}>
        <div className={styles.logsHeader}>
          <span className={styles.logsTitle}>Container Logs</span>
          <Button variant="outline" size="small" onClick={() => refetchLogs()}>
            <RefreshIcon size={12} /> Refresh
          </Button>
        </div>
        <div className={styles.logsContent}>
          {logsLoading ? (
            <div className={styles.logsLoading}>Loading container logs...</div>
          ) : logsData?.error ? (
            <div className={styles.logsError}>{logsData.error}</div>
          ) : (
            <pre className={styles.logsOutput}>{logsData?.logs || 'No logs available'}</pre>
          )}
        </div>
      </div>
    );
  };

  const filteredApps = apps?.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDeployments = deployments?.filter(
    (d) =>
      d.app_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.container_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.server_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Apps</h1>
        <div className={styles.headerActions}>
          <input
            type="text"
            placeholder={activeTab === 'deployed' ? 'Search deployments...' : 'Search apps...'}
            className={styles.searchBox}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {activeTab === 'apps' && (
            <Button onClick={() => setShowAddModal(true)}>
              <PlusIcon size={18} /> Create App
            </Button>
          )}
        </div>
      </div>

      <div className={styles.tabContainer}>
        <button
          className={`${styles.tab} ${activeTab === 'deployed' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('deployed')}
        >
          Deployed Apps
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'apps' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('apps')}
        >
          My Apps
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'templates' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
      </div>

      {activeTab === 'deployed' && (
        <>
          {deploymentsLoading ? (
            <div className={styles.emptyState}>Loading deployments...</div>
          ) : filteredDeployments && filteredDeployments.length > 0 ? (
            <div className={styles.deploymentsTable}>
              <div className={styles.tableHeader}>
                <div>App</div>
                <div>Container</div>
                <div>Server</div>
                <div>Status</div>
                <div>Ports</div>
                <div>Deployed</div>
                <div>Actions</div>
              </div>
              {filteredDeployments.map((deployment) => {
                const isExpanded = expandedDeployments[deployment.id];
                const isLogsExpanded = expandedLogs[deployment.id];
                return (
                  <React.Fragment key={deployment.id}>
                    <div className={styles.tableRow}>
                      <div className={styles.appCell}>
                        <Link to={`/apps/${deployment.app_id}`} className={styles.appLink}>
                          <strong>{deployment.app_name}</strong>
                          <span className={styles.appImage}>
                            🐳 {deployment.app_image}:{deployment.app_tag || 'latest'}
                          </span>
                        </Link>
                      </div>
                      <div className={styles.containerCell}>
                        <div className={styles.containerName}>{deployment.container_name}</div>
                        <div className={styles.containerId}>{deployment.container_id?.substring(0, 12)}</div>
                      </div>
                      <div className={styles.serverCell}>
                        <Link to={`/servers/${deployment.server_id}`} className={styles.serverLink}>
                          {deployment.server_name}
                        </Link>
                        <span className={styles.serverIp}>{deployment.server_ip}</span>
                      </div>
                      <div>
                        <span className={`${styles.statusBadge} ${
                          deployment.status === 'running' ? styles.statusRunning : styles.statusStopped
                        }`}>
                          {deployment.status === 'running' ? '● Running' : '○ Stopped'}
                        </span>
                      </div>
                      <div className={styles.portsCell}>
                        {deployment.port_mappings && deployment.port_mappings.length > 0 ? (
                          <div className={styles.portBadges}>
                            {deployment.port_mappings.map((port, idx) => (
                              <span key={idx} className={styles.portBadge}>
                                {port.host}→{port.container}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className={styles.noPorts}>No ports</span>
                        )}
                      </div>
                      <div className={styles.dateCell}>
                        {new Date(deployment.deployed_at).toLocaleString()}
                      </div>
                      <div className={styles.actionsCell}>
                        {deployment.status === 'running' ? (
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => stopDeploymentMutation.mutate({ appId: deployment.app_id, deploymentId: deployment.id })}
                            disabled={stopDeploymentMutation.isPending}
                          >
                            <StopCircleIcon size={14} /> Stop
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => startDeploymentMutation.mutate({ appId: deployment.app_id, deploymentId: deployment.id })}
                            disabled={startDeploymentMutation.isPending}
                          >
                            <PlayIcon size={14} /> Start
                          </Button>
                        )}
                        {deployment.status === 'running' && (
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => toggleDeploymentStats(deployment.id)}
                          >
                            {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                            Stats
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="small"
                          onClick={() => toggleDeploymentLogs(deployment.id)}
                        >
                          {isLogsExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                          Logs
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          onClick={() => handleRemoveDeployment(deployment)}
                          disabled={removeDeploymentMutation.isPending}
                        >
                          <TrashIcon size={14} /> Remove
                        </Button>
                      </div>
                    </div>
                    {isExpanded && deployment.status === 'running' && (
                      <DeploymentStatsRow deployment={deployment} />
                    )}
                    {isLogsExpanded && (
                      <DeploymentLogsRow deployment={deployment} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <AppsIcon size={80} />
              </div>
              <h3 className={styles.emptyTitle}>No deployments yet</h3>
              <p className={styles.emptyText}>
                Deploy an app to a server to see it here
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === 'apps' && (
        <>
          {appsLoading ? (
            <div className={styles.emptyState}>Loading apps...</div>
          ) : filteredApps && filteredApps.length > 0 ? (
            <div className={styles.appsGrid}>
              {filteredApps.map((app) => (
                <div key={app.id} className={styles.appCard}>
                  <div className={styles.appHeader}>
                    <div className={styles.appIcon}>
                      <AppsIcon size={28} color="white" />
                    </div>
                    <div className={styles.appInfo}>
                      <div className={styles.appName}>{app.name}</div>
                    </div>
                  </div>

                  <div className={styles.appDescription}>
                    {app.description || 'No description provided'}
                  </div>

                  <div className={styles.appActions}>
                    <Link to={`/apps/${app.id}`} className={styles.actionBtn}>
                      <EyeIcon size={16} /> Open
                    </Link>
                    <button
                      className={`${styles.actionBtn} ${styles.danger}`}
                      onClick={() => handleDeleteApp(app.id, app.name)}
                      disabled={deleteAppMutation.isPending}
                    >
                      <TrashIcon size={16} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <AppsIcon size={80} />
              </div>
              <h3 className={styles.emptyTitle}>No apps yet</h3>
              <p className={styles.emptyText}>
                Create your first app to get started
              </p>
              <Button onClick={() => setShowAddModal(true)}>
                <PlusIcon size={18} /> Create App
              </Button>
            </div>
          )}
        </>
      )}

      {activeTab === 'templates' && (
        <>
          {templatesError ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <AppsIcon size={80} />
              </div>
              <h3 className={styles.emptyTitle}>Error Loading Templates</h3>
              <p className={styles.emptyText}>
                {templatesError.message || 'Failed to load templates'}
              </p>
            </div>
          ) : (templatesLoading || templatesFetching || !templatesData) ? (
            <div className={styles.emptyState}>Loading templates...</div>
          ) : templatesData?.templates?.length > 0 ? (
            <div className={styles.templatesContainer}>
              {/* Category Filter */}
              <div className={styles.categoryFilter}>
                <button
                  className={`${styles.categoryBtn} ${selectedCategory === 'all' ? styles.categoryActive : ''}`}
                  onClick={() => setSelectedCategory('all')}
                >
                  All Templates
                </button>
                {templatesData.categories?.map(cat => (
                  <button
                    key={cat.id}
                    className={`${styles.categoryBtn} ${selectedCategory === cat.id ? styles.categoryActive : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.icon} {cat.name} ({cat.count})
                  </button>
                ))}
              </div>

              {/* Templates Grid */}
              <div className={styles.templatesGrid}>
                {templatesData.templates
                  .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
                  .filter(t => 
                    searchQuery === '' || 
                    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    t.description.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(template => (
                    <div key={template.id} className={styles.templateCard}>
                      <div className={styles.templateHeader}>
                        <span className={styles.templateIcon}>{template.icon || '🐳'}</span>
                        <div className={styles.templateInfo}>
                          <h3 className={styles.templateName}>{template.name}</h3>
                          <span className={styles.templateImage}>
                            {template.image}:{template.tag || 'latest'}
                          </span>
                        </div>
                      </div>
                      <p className={styles.templateDescription}>{template.description}</p>
                      
                      {/* Quick info badges */}
                      <div className={styles.templateBadges}>
                        {template.ports?.length > 0 && (
                          <span className={styles.templateBadge}>
                            🔌 {template.ports.length} port{template.ports.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {template.env_vars?.filter(e => e.required).length > 0 && (
                          <span className={styles.templateBadge}>
                            ⚠️ {template.env_vars.filter(e => e.required).length} required env
                          </span>
                        )}
                        {template.volumes?.length > 0 && (
                          <span className={styles.templateBadge}>
                            💾 {template.volumes.length} volume{template.volumes.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {template.notes && (
                        <p className={styles.templateNotes}>{template.notes}</p>
                      )}

                      <div className={styles.templateActions}>
                        {template.documentation_url && (
                          <a 
                            href={template.documentation_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={styles.templateDocLink}
                          >
                            📖 Docs
                          </a>
                        )}
                        <Button
                          onClick={() => handleUseTemplate(template)}
                          disabled={createFromTemplateMutation.isPending}
                        >
                          {createFromTemplateMutation.isPending ? 'Creating...' : 'Use Template'}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <AppsIcon size={80} />
              </div>
              <h3 className={styles.emptyTitle}>No Templates Available</h3>
              <p className={styles.emptyText}>
                Templates could not be loaded. Check backend configuration.
              </p>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Create New App"
      >
        <form onSubmit={handleCreateApp}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>App Name</label>
            <input
              type="text"
              className={styles.formInput}
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              placeholder="My Awesome App"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Description</label>
            <textarea
              className={styles.formTextarea}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe your app..."
            />
          </div>

          <div className={styles.modalFooter}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createAppMutation.isPending}
            >
              {createAppMutation.isPending ? 'Creating...' : 'Create App'}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Apps;
