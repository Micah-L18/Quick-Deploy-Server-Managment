import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import EditDeploymentModal from '../components/EditDeploymentModal';
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
  RefreshIcon,
  ContainerIcon,
  PlugIcon,
  AlertIcon,
  HardDriveIcon,
  BookOpenIcon,
  DatabaseIcon,
  GlobeIcon,
  GamepadIcon,
  CodeIcon,
  ActivityIcon,
  FilmIcon,
  ToolIcon,
  LayersIcon,
  EditIcon,
  DockerIcon,
  GlobeAltIcon
} from '../components/Icons';
import styles from './Apps.module.css';

// Helper function to get category icon
const getCategoryIcon = (categoryId, size = 14) => {
  const icons = {
    'databases': <DatabaseIcon size={size} />,
    'web-servers': <GlobeIcon size={size} />,
    'game-servers': <GamepadIcon size={size} />,
    'development': <CodeIcon size={size} />,
    'monitoring': <ActivityIcon size={size} />,
    'media': <FilmIcon size={size} />,
    'utilities': <ToolIcon size={size} />,
  };
  return icons[categoryId] || <LayersIcon size={size} />;
};

const Apps = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('deployed');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedDeployments, setExpandedDeployments] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null, data: null });
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  // Mobile detection
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        // Find the host port that maps to the app's web_ui_port (container port)
        let effectiveWebUiPort = null;
        if (d.web_ui_port && portMappings && portMappings.length > 0) {
          const webUiMapping = portMappings.find(
            p => String(p.container) === String(d.web_ui_port)
          );
          effectiveWebUiPort = webUiMapping?.host || null;
        }
        return { ...d, port_mappings: portMappings || [], web_ui_port: effectiveWebUiPort };
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
    mutationFn: ({ appId, deploymentId, force }) => appsService.removeDeployment(appId, deploymentId, force),
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
    setConfirmModal({
      isOpen: true,
      type: 'deleteApp',
      data: { id, name }
    });
  };

  const handleRemoveDeployment = (deployment, forceRemove = false) => {
    const isOrphaned = !deployment.server_id || !deployment.server_name;
    setConfirmModal({
      isOpen: true,
      type: 'removeDeployment',
      data: { deployment, isOrphaned, forceRemove }
    });
  };

  const handleConfirmAction = () => {
    if (confirmModal.type === 'deleteApp') {
      deleteAppMutation.mutate(confirmModal.data.id);
    } else if (confirmModal.type === 'removeDeployment') {
      const { deployment, isOrphaned, forceRemove } = confirmModal.data;
      removeDeploymentMutation.mutate({ 
        appId: deployment.app_id, 
        deploymentId: deployment.id,
        force: isOrphaned || forceRemove
      });
    }
  };

  const getConfirmModalProps = () => {
    if (confirmModal.type === 'deleteApp') {
      return {
        title: 'Delete App',
        message: `Are you sure you want to delete "${confirmModal.data?.name}"?`,
        confirmText: 'Delete',
      };
    } else if (confirmModal.type === 'removeDeployment') {
      const { deployment, isOrphaned, forceRemove } = confirmModal.data || {};
      return {
        title: isOrphaned || forceRemove ? 'Remove Record' : 'Remove Deployment',
        message: isOrphaned || forceRemove
          ? `Remove orphaned deployment record "${deployment?.container_name}" from the database?`
          : `Stop and remove container "${deployment?.container_name}"?`,
        confirmText: 'Remove',
      };
    }
    return {};
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
            <>
              {/* Desktop Table View */}
              {!isMobile && (
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
                    const isOrphaned = !deployment.server_id || !deployment.server_name;
                    return (
                      <React.Fragment key={deployment.id}>
                        <div className={`${styles.tableRow} ${isOrphaned ? styles.orphanedRow : ''}`}>
                          <div className={styles.appCell}>
                            <Link to={`/apps/${deployment.app_id}`} className={styles.appLink}>
                              <strong>{deployment.app_name}</strong>
                              <span className={styles.appImage}>
                                <DockerIcon size={12} /> {deployment.app_image}:{deployment.app_tag || 'latest'}
                              </span>
                            </Link>
                          </div>
                          <div className={styles.containerCell}>
                            <div className={styles.containerName}>{deployment.container_name}</div>
                            <div className={styles.containerId}>{deployment.container_id?.substring(0, 12)}</div>
                          </div>
                          <div className={styles.serverCell}>
                            {isOrphaned ? (
                              <span className={styles.orphanedServer}>
                                <AlertIcon size={14} />
                                Server Deleted
                              </span>
                            ) : (
                              <>
                                <Link to={`/servers/${deployment.server_id}`} className={styles.serverLink}>
                                  {deployment.server_name}
                                </Link>
                                <span className={styles.serverIp}>{deployment.server_ip}</span>
                              </>
                            )}
                          </div>
                          <div>
                            <span className={`${styles.statusBadge} ${
                              isOrphaned ? styles.statusOrphaned :
                              deployment.status === 'running' ? styles.statusRunning : styles.statusStopped
                            }`}>
                              {isOrphaned ? '⚠ Orphaned' : deployment.status === 'running' ? '● Running' : '○ Stopped'}
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
                                {deployment.web_ui_port && deployment.status === 'running' && deployment.server_ip && (
                                  <a
                                    href={`http://${deployment.server_ip}:${deployment.web_ui_port}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.webUiLink}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GlobeAltIcon size={12} /> Open
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className={styles.noPorts}>No ports</span>
                            )}
                          </div>
                          <div className={styles.dateCell}>
                            {new Date(deployment.deployed_at).toLocaleString()}
                          </div>
                          <div className={styles.actionsCell}>
                            {isOrphaned ? (
                              // Orphaned deployment - only show remove button
                              <Button
                                variant="danger"
                                size="small"
                                onClick={() => handleRemoveDeployment(deployment, true)}
                                disabled={removeDeploymentMutation.isPending}
                              >
                                <TrashIcon size={14} /> Remove Record
                              </Button>
                            ) : (
                              // Normal deployment - show all controls
                              <>
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
                                {deployment.status !== 'running' && (
                                  <Button
                                    variant="outline"
                                    size="small"
                                    onClick={() => setEditingDeployment(deployment)}
                                  >
                                    <EditIcon size={14} /> Edit
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="small"
                                  onClick={() => handleRemoveDeployment(deployment)}
                                  disabled={removeDeploymentMutation.isPending}
                                >
                                  <TrashIcon size={14} /> Remove
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {isExpanded && deployment.status === 'running' && !isOrphaned && (
                          <DeploymentStatsRow deployment={deployment} />
                        )}
                        {isLogsExpanded && (
                          <DeploymentLogsRow deployment={deployment} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* Mobile Card View */}
              {isMobile && (
                <div className={styles.deploymentsCards}>
                  {filteredDeployments.map((deployment) => {
                    const isExpanded = expandedDeployments[deployment.id];
                    const isLogsExpanded = expandedLogs[deployment.id];
                    const isOrphaned = !deployment.server_id || !deployment.server_name;
                    return (
                      <div key={deployment.id} className={`${styles.deploymentCard} ${isOrphaned ? styles.orphanedCard : ''}`}>
                        <div className={styles.deploymentCardHeader}>
                          <Link to={`/apps/${deployment.app_id}`} className={styles.deploymentCardTitle}>
                            {deployment.app_name}
                          </Link>
                          <span className={`${styles.statusBadge} ${
                            isOrphaned ? styles.statusOrphaned :
                            deployment.status === 'running' ? styles.statusRunning : styles.statusStopped
                          }`}>
                            {isOrphaned ? '⚠ Orphaned' : deployment.status === 'running' ? '● Running' : '○ Stopped'}
                          </span>
                        </div>
                        
                        <div className={styles.deploymentCardMeta}>
                          <div className={styles.deploymentCardRow}>
                            <span className={styles.deploymentCardLabel}>Image:</span>
                            <span className={styles.deploymentCardValue}><DockerIcon size={12} /> {deployment.app_image}:{deployment.app_tag || 'latest'}</span>
                          </div>
                          <div className={styles.deploymentCardRow}>
                            <span className={styles.deploymentCardLabel}>Container:</span>
                            <span className={styles.deploymentCardValue}>{deployment.container_name}</span>
                          </div>
                          <div className={styles.deploymentCardRow}>
                            <span className={styles.deploymentCardLabel}>Server:</span>
                            {isOrphaned ? (
                              <span className={styles.orphanedServer}>
                                <AlertIcon size={14} />
                                Server Deleted
                              </span>
                            ) : (
                              <Link to={`/servers/${deployment.server_id}`} className={styles.serverLink}>
                                {deployment.server_name}
                              </Link>
                            )}
                          </div>
                          {deployment.port_mappings && deployment.port_mappings.length > 0 && (
                            <div className={styles.deploymentCardRow}>
                              <span className={styles.deploymentCardLabel}>Ports:</span>
                              <div className={styles.portBadges}>
                                {deployment.port_mappings.map((port, idx) => (
                                  <span key={idx} className={styles.portBadge}>
                                    {port.host}→{port.container}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className={styles.deploymentCardActions}>
                          {isOrphaned ? (
                            <Button
                              variant="danger"
                              size="small"
                              onClick={() => handleRemoveDeployment(deployment, true)}
                              disabled={removeDeploymentMutation.isPending}
                            >
                              <TrashIcon size={14} /> Remove Record
                            </Button>
                          ) : (
                            <>
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
                          {deployment.status !== 'running' && (
                            <Button
                              variant="outline"
                              size="small"
                              onClick={() => setEditingDeployment(deployment)}
                            >
                              <EditIcon size={14} />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => handleRemoveDeployment(deployment)}
                            disabled={removeDeploymentMutation.isPending}
                          >
                            <TrashIcon size={14} />
                          </Button>
                            </>
                          )}
                        </div>

                        {isExpanded && deployment.status === 'running' && !isOrphaned && (
                          <DeploymentStatsRow deployment={deployment} />
                        )}
                        {isLogsExpanded && !isOrphaned && (
                          <DeploymentLogsRow deployment={deployment} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
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
          ) : (
            <div className={styles.appsGrid}>
              {/* Create App Card - Always First */}
              <div 
                className={styles.addAppCard}
                onClick={() => setShowAddModal(true)}
              >
                <div className={styles.addAppIcon}>
                  <PlusIcon size={32} />
                </div>
                <span className={styles.addAppText}>Create App</span>
              </div>

              {filteredApps?.map((app) => (
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
              {/* Category Filter - Desktop: buttons, Mobile: dropdown */}
              {!isMobile ? (
                <div className={styles.categoryFilter}>
                  <button
                    className={`${styles.categoryBtn} ${selectedCategory === 'all' ? styles.categoryActive : ''}`}
                    onClick={() => setSelectedCategory('all')}
                  >
                    <LayersIcon size={14} /> All Templates
                  </button>
                  {templatesData.categories?.map(cat => (
                    <button
                      key={cat.id}
                      className={`${styles.categoryBtn} ${selectedCategory === cat.id ? styles.categoryActive : ''}`}
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      {getCategoryIcon(cat.id)} {cat.name} ({cat.count})
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.categoryDropdownWrapper}>
                  <button 
                    className={styles.categoryDropdownTrigger}
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  >
                    <span className={styles.categoryDropdownLabel}>
                      {selectedCategory === 'all' ? <LayersIcon size={14} /> : getCategoryIcon(selectedCategory)}
                      {selectedCategory === 'all' 
                        ? 'All Templates' 
                        : templatesData.categories?.find(c => c.id === selectedCategory)?.name || selectedCategory
                      }
                    </span>
                    {showCategoryDropdown ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
                  </button>
                  {showCategoryDropdown && (
                    <div className={styles.categoryDropdownMenu}>
                      <button
                        className={`${styles.categoryDropdownItem} ${selectedCategory === 'all' ? styles.categoryDropdownActive : ''}`}
                        onClick={() => { setSelectedCategory('all'); setShowCategoryDropdown(false); }}
                      >
                        <LayersIcon size={14} /> All Templates
                      </button>
                      {templatesData.categories?.map(cat => (
                        <button
                          key={cat.id}
                          className={`${styles.categoryDropdownItem} ${selectedCategory === cat.id ? styles.categoryDropdownActive : ''}`}
                          onClick={() => { setSelectedCategory(cat.id); setShowCategoryDropdown(false); }}
                        >
                          {getCategoryIcon(cat.id)} {cat.name} ({cat.count})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                        {template.logo_url ? (
                          <img 
                            src={template.logo_url} 
                            alt={template.name}
                            className={styles.templateLogo}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span 
                          className={styles.templateIcon}
                          style={{ display: template.logo_url ? 'none' : 'flex' }}
                        >
                          <ContainerIcon size={24} />
                        </span>
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
                            <PlugIcon size={12} /> {template.ports.length} port{template.ports.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {template.env_vars?.filter(e => e.required).length > 0 && (
                          <span className={styles.templateBadge}>
                            <AlertIcon size={12} /> {template.env_vars.filter(e => e.required).length} required env
                          </span>
                        )}
                        {template.volumes?.length > 0 && (
                          <span className={styles.templateBadge}>
                            <HardDriveIcon size={12} /> {template.volumes.length} volume{template.volumes.length > 1 ? 's' : ''}
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
                            <BookOpenIcon size={14} /> Docs
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

      <EditDeploymentModal
        isOpen={!!editingDeployment}
        onClose={() => setEditingDeployment(null)}
        deployment={editingDeployment}
        serverId={editingDeployment?.server_id}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, type: null, data: null })}
        onConfirm={handleConfirmAction}
        variant="danger"
        {...getConfirmModalProps()}
      />
    </Layout>
  );
};

export default Apps;
