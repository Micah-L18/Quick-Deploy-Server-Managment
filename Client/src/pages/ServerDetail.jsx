import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Terminal from '../components/Terminal';
import FileBrowser from '../components/FileBrowser';
import ServicesManager from '../components/ServicesManager';
import ColorPicker from '../components/ColorPicker';
import IconSelector, { SERVER_ICONS } from '../components/IconSelector';
import EditDeploymentModal from '../components/EditDeploymentModal';
import ConfirmModal from '../components/ConfirmModal';
import { serversService } from '../api/servers';
import { appsService } from '../api/apps';
import { getRegionFlag } from '../utils/formatters';
import { RefreshIcon, ServersIcon, AlertIcon, EyeIcon, EyeOffIcon, AppsIcon, PlayIcon, StopCircleIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, EditIcon, DockerIcon, GlobeAltIcon, XIcon, CheckCircleIcon, SettingsIcon } from '../components/Icons';
import styles from './ServerDetail.module.css';

const ServerDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [metricsError, setMetricsError] = useState(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'metrics');
  const [timeRange, setTimeRange] = useState(24); // hours
  const [ipVisible, setIpVisible] = useState(false);
  const [expandedDeployments, setExpandedDeployments] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, deployment: null });
  const [selectedMetricCard, setSelectedMetricCard] = useState('cpu'); // 'cpu', 'memory', 'disk', 'gpu'
  const deleteServerRef = useRef(null);

  // Sync activeTab with URL search params when they change
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // Handle scrollTo query param for scrolling to delete section
  useEffect(() => {
    const scrollTo = searchParams.get('scrollTo');
    if (scrollTo === 'delete' && activeTab === 'settings') {
      // Longer delay to ensure content is rendered after tab switch
      const timer = setTimeout(() => {
        if (deleteServerRef.current) {
          deleteServerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchParams, activeTab]);

  // Detect mobile viewport
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // If on terminal tab and switching to mobile, go to metrics
      if (mobile && activeTab === 'terminal') {
        setActiveTab('metrics');
      }
      // Force 1 hour time range on mobile
      if (mobile && timeRange !== 1) {
        setTimeRange(1);
      }
    };
    window.addEventListener('resize', handleResize);
    // Also set on initial load
    if (isMobile && timeRange !== 1) {
      setTimeRange(1);
    }
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab, isMobile, timeRange]);

  const { data: server, isLoading: serverLoading } = useQuery({
    queryKey: ['server', id],
    queryFn: () => serversService.getServer(id),
    refetchInterval: 5000,
  });

  const { data: metrics, isLoading: metricsLoading, error: metricsQueryError } = useQuery({
    queryKey: ['server-metrics', id],
    queryFn: () => serversService.getMetrics(id),
    enabled: !!server && server.status === 'online',
    refetchInterval: 5000,
    retry: 1,
    onError: (error) => {
      setMetricsError(error.response?.data?.error || error.message);
    },
  });

  const { data: metricsHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['server-metrics-history', id, timeRange],
    queryFn: () => serversService.getMetricsHistory(id, timeRange),
    enabled: !!server && server.status === 'online',
    refetchInterval: 5000,
    retry: 1,
  });

  const { data: deployments = [], isLoading: deploymentsLoading } = useQuery({
    queryKey: ['server-deployments', id],
    queryFn: async () => {
      // Fetch all apps and filter their deployments for this server
      const apps = await appsService.getApps();
      const serverDeployments = [];
      
      for (const app of apps) {
        const appDeployments = await appsService.getDeployments(app.id);
        const serverSpecificDeployments = appDeployments
          .filter(d => d.server_id === id)
          .map(d => {
            // Parse port_mappings if it's a string
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
            if (app.web_ui_port && portMappings && portMappings.length > 0) {
              const webUiMapping = portMappings.find(
                p => String(p.container) === String(app.web_ui_port)
              );
              effectiveWebUiPort = webUiMapping?.host || null;
            }
            return { 
              ...d, 
              port_mappings: portMappings || [], 
              app_name: app.name, 
              app_id: app.id, 
              app_image: app.image, 
              app_tag: app.tag,
              web_ui_port: effectiveWebUiPort  // Host port that maps to web UI container port
            };
          });
        serverDeployments.push(...serverSpecificDeployments);
      }
      
      return serverDeployments;
    },
    refetchInterval: 10000,
  });

  const removeDeploymentMutation = useMutation({
    mutationFn: ({ appId, deploymentId }) => appsService.removeDeployment(appId, deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['server-deployments', id]);
    },
  });

  const startDeploymentMutation = useMutation({
    mutationFn: ({ appId, deploymentId }) => appsService.startDeployment(appId, deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['server-deployments', id]);
    },
  });

  const stopDeploymentMutation = useMutation({
    mutationFn: ({ appId, deploymentId }) => appsService.stopDeployment(appId, deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['server-deployments', id]);
    },
  });

  const navigate = useNavigate();
  const [deleteWarning, setDeleteWarning] = useState(null);
  
  const deleteServerMutation = useMutation({
    mutationFn: ({ serverId, force }) => serversService.deleteServer(serverId, force),
    onSuccess: () => {
      navigate('/servers');
    },
    onError: (error) => {
      if (error.response?.status === 409) {
        // Server has active deployments
        const errorData = error.response.data;
        setDeleteWarning(`This server has ${errorData.deployments?.length || 0} active deployment(s). Deleting will stop and remove all containers.`);
      }
    },
  });

  const handleRemoveDeployment = (deployment) => {
    setConfirmModal({ isOpen: true, deployment });
  };

  const handleConfirmRemoveDeployment = () => {
    if (confirmModal.deployment) {
      removeDeploymentMutation.mutate({ 
        appId: confirmModal.deployment.app_id, 
        deploymentId: confirmModal.deployment.id 
      });
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
                <span className={styles.statLabel}>Storage I/O</span>
                <span className={styles.statValue}>{stats.blockIO || 'N/A'}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Container Status</span>
                <span className={styles.statValue}>{stats.status}</span>
              </div>
              {/* GPU stats - only shown if container is using GPU */}
              {stats.gpu && (
                <>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>GPU Memory</span>
                    <span className={styles.statValue}>{stats.gpu.memory_used} MB</span>
                  </div>
                  {stats.gpu.name && (
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>GPU</span>
                      <span className={styles.statValue} title={stats.gpu.name}>
                        {stats.gpu.name.length > 20 ? stats.gpu.name.substring(0, 20) + '...' : stats.gpu.name}
                      </span>
                    </div>
                  )}
                </>
              )}
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
    const logsContentRef = useRef(null);
    const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
      queryKey: ['deployment-logs', deployment.app_id, deployment.id],
      queryFn: () => appsService.getDeploymentLogs(deployment.app_id, deployment.id, 100),
      enabled: true,
    });

    // Auto-scroll to bottom when logs load
    useEffect(() => {
      if (logsContentRef.current && logsData?.logs) {
        logsContentRef.current.scrollTop = logsContentRef.current.scrollHeight;
      }
    }, [logsData]);

    return (
      <div className={styles.logsRow}>
        <div className={styles.logsHeader}>
          <span className={styles.logsTitle}>Container Logs</span>
          <Button variant="outline" size="small" onClick={() => refetchLogs()}>
            <RefreshIcon size={12} /> Refresh
          </Button>
        </div>
        <div className={styles.logsContent} ref={logsContentRef}>
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

  const checkStatusMutation = useMutation({
    mutationFn: serversService.checkStatus,
    onSuccess: () => {
      queryClient.invalidateQueries(['server', id]);
      queryClient.invalidateQueries(['server-metrics', id]);
    },
  });

  const handleRefreshMetrics = () => {
    setMetricsError(null);
    queryClient.invalidateQueries(['server-metrics', id]);
  };

  const handleCopyCommand = () => {
    if (server?.setupCommand) {
      navigator.clipboard.writeText(server.setupCommand.trim());
    }
  };

  if (serverLoading) {
    return (
      <Layout>
        <div className={styles.loading}>Loading server details...</div>
      </Layout>
    );
  }

  if (!server) {
    return (
      <Layout>
        <div className={styles.error}>
          <AlertIcon size={60} />
          <h2>Server Not Found</h2>
          <p>The server you're looking for doesn't exist.</p>
          <Link to="/servers">
            <Button>Back to Servers</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <div>
          <Link to="/servers" className={styles.backLink}>
            ← Back to Servers
          </Link>
          <h1 className={styles.pageTitle}>
            {server.name}
            <span className={styles.regionBadge}>
              {getRegionFlag(server.region)} {server.region}
            </span>
          </h1>
        </div>
        <div className={styles.headerActions}>
          <Button
            onClick={() => checkStatusMutation.mutate(id)}
            variant="outline"
            disabled={checkStatusMutation.isPending}
          >
            <RefreshIcon size={18} /> Check Status
          </Button>
        </div>
      </div>

      <div className={styles.serverInfo}>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Status</span>
            <span className={`${styles.statusBadge} ${styles[server.status || 'pending']}`}>
              <span className={styles.statusDot}></span>
              {server.status || 'pending'}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>IP Address</span>
            <div className={styles.ipContainer}>
              <span className={styles.ipAddress}>
                {ipVisible ? server.ip : '•••.•••.•••.•••'}
              </span>
              <button 
                className={styles.ipToggleBtn}
                onClick={() => setIpVisible(!ipVisible)}
                title={ipVisible ? 'Hide IP' : 'Show IP'}
              >
                {ipVisible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Username</span>
            <span>{server.username}</span>
          </div>
          {server.last_checked && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Last Checked</span>
              <span>{new Date(server.last_checked).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* System Info Card */}
        {server.status === 'online' && metrics?.os && (
          <div className={styles.infoCard}>
            <h3 className={styles.infoCardTitle}>System Info</h3>
            <div className={styles.infoContent}>
              {metrics.hostname && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Hostname</span>
                  <span className={styles.infoValue}>{metrics.hostname}</span>
                </div>
              )}
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>OS</span>
                <span className={styles.infoValue}>{metrics.os}</span>
              </div>
              {metrics.uptime && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Uptime</span>
                  <span className={styles.infoValue}>{metrics.uptime}</span>
                </div>
              )}
              {metrics.totalRam && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Total RAM</span>
                  <span className={styles.infoValue}>{metrics.totalRam}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'metrics' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          System Metrics
        </button>
        {!isMobile && (
          <button
            className={`${styles.tab} ${activeTab === 'terminal' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('terminal')}
          >
            Terminal
          </button>
        )}
        <button
          className={`${styles.tab} ${activeTab === 'files' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'services' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('services')}
        >
          Services
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'apps' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('apps')}
        >
          <AppsIcon size={16} /> Apps {deployments.length > 0 && `(${deployments.length})`}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'settings' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Server Settings
        </button>
      </div>

      {activeTab === 'metrics' && (
        <>
          {server.status === 'online' ? (
            <>
              <div className={styles.metricsHeader}>
                <h2 className={styles.sectionTitle}>
                  <ServersIcon size={24} /> Current Metrics
                </h2>
                <div className={styles.headerActions}>
                  <select
                    className={styles.timeRangeSelect}
                    value={timeRange}
                    onChange={(e) => setTimeRange(Number(e.target.value))}
                    disabled={isMobile}
                  >
                    <option value={1}>Last Hour</option>
                    {!isMobile && (
                      <>
                        <option value={6}>Last 6 Hours</option>
                        <option value={24}>Last 24 Hours</option>
                        <option value={168}>Last Week</option>
                      </>
                    )}
                  </select>
                  <Button
                    onClick={handleRefreshMetrics}
                    variant="outline"
                    size="small"
                    disabled={metricsLoading}
                  >
                    <RefreshIcon size={16} /> {metricsLoading ? 'Loading...' : 'Refresh'}
                  </Button>
                </div>
              </div>

              {metricsError || metricsQueryError ? (
                <div className={styles.metricsError}>
                  <AlertIcon size={40} />
                  <p>Failed to load metrics: {metricsError || metricsQueryError.message}</p>
                  <Button onClick={handleRefreshMetrics} size="small">
                    Try Again
                  </Button>
                </div>
              ) : metricsLoading ? (
                <div className={styles.metricsLoading}>Loading metrics...</div>
              ) : metrics ? (
                <div className={styles.metricsGrid}>
              {metrics.cpu && (
                <div 
                  className={`${styles.metricCard} ${styles.selectableCard} ${selectedMetricCard === 'cpu' ? styles.selectedCard : ''}`}
                  onClick={() => setSelectedMetricCard('cpu')}
                >
                  <h3 className={styles.metricTitle}>CPU</h3>
                  <div className={styles.metricContent}>
                    {metrics.cpu.usage !== undefined && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Usage</span>
                        <span className={styles.metricValue}>{metrics.cpu.usage}%</span>
                      </div>
                    )}
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Cores</span>
                      <span className={styles.metricValue}>{metrics.cpu.cores}</span>
                    </div>
                    {metrics.cpu.model && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Model</span>
                        <span className={styles.metricValue}>{metrics.cpu.model}</span>
                      </div>
                    )}
                    {metrics.cpu.temperature != null && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Temperature</span>
                        <span className={styles.metricValue}>{metrics.cpu.temperature}°C</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {metrics.memory && (
                <div 
                  className={`${styles.metricCard} ${styles.selectableCard} ${selectedMetricCard === 'memory' ? styles.selectedCard : ''}`}
                  onClick={() => setSelectedMetricCard('memory')}
                >
                  <h3 className={styles.metricTitle}>Memory</h3>
                  <div className={styles.metricContent}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${metrics.memory.percentage}%` }}
                      ></div>
                    </div>
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Used</span>
                      <span className={styles.metricValue}>
                        {metrics.memory.used} MB / {metrics.memory.total} MB
                      </span>
                    </div>
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Free</span>
                      <span className={styles.metricValue}>{metrics.memory.free} MB</span>
                    </div>
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Usage</span>
                      <span className={styles.metricValue}>{metrics.memory.percentage}%</span>
                    </div>
                  </div>
                </div>
              )}

              {metrics.disk && (
                <div 
                  className={`${styles.metricCard} ${styles.selectableCard} ${selectedMetricCard === 'disk' ? styles.selectedCard : ''}`}
                  onClick={() => setSelectedMetricCard('disk')}
                >
                  <h3 className={styles.metricTitle}>Disk (Root)</h3>
                  <div className={styles.metricContent}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${metrics.disk.percentage}%` }}
                      ></div>
                    </div>
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Used</span>
                      <span className={styles.metricValue}>
                        {metrics.disk.used} / {metrics.disk.total}
                      </span>
                    </div>
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Available</span>
                      <span className={styles.metricValue}>{metrics.disk.available}</span>
                    </div>
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Usage</span>
                      <span className={styles.metricValue}>{metrics.disk.percentage}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* GPU Metrics Card - only shown if GPU is detected */}
              {metrics.gpu && (
                <div 
                  className={`${styles.metricCard} ${styles.selectableCard} ${selectedMetricCard === 'gpu' ? styles.selectedCard : ''}`}
                  onClick={() => setSelectedMetricCard('gpu')}
                >
                  <h3 className={styles.metricTitle}>
                    GPU{metrics.gpu.count > 1 ? ` (${metrics.gpu.count}x)` : ''}
                  </h3>
                  <div className={styles.metricContent}>
                    {/* GPU Utilization Progress Bar */}
                    {metrics.gpu.utilization != null && (
                      <div className={styles.progressBar}>
                        <div
                          className={`${styles.progressFill} ${styles.gpuFill}`}
                          style={{ width: `${metrics.gpu.utilization}%` }}
                        ></div>
                      </div>
                    )}
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>Model</span>
                      <span className={styles.metricValue} title={metrics.gpu.name}>
                        {metrics.gpu.name?.length > 30 
                          ? metrics.gpu.name.substring(0, 30) + '...' 
                          : metrics.gpu.name}
                      </span>
                    </div>
                    {metrics.gpu.utilization != null && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>GPU Usage</span>
                        <span className={styles.metricValue}>{metrics.gpu.utilization}%</span>
                      </div>
                    )}
                    {metrics.gpu.memory_total != null && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>VRAM</span>
                        <span className={styles.metricValue}>
                          {metrics.gpu.memory_used} MB / {metrics.gpu.memory_total} MB
                          {metrics.gpu.memory_percentage != null && ` (${metrics.gpu.memory_percentage}%)`}
                        </span>
                      </div>
                    )}
                    {metrics.gpu.temperature != null && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Temperature</span>
                        <span className={styles.metricValue}>{metrics.gpu.temperature}°C</span>
                      </div>
                    )}
                    {metrics.gpu.vendor && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Vendor</span>
                        <span className={styles.metricValue} style={{ textTransform: 'capitalize' }}>
                          {metrics.gpu.vendor}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}

              {/* Historical Graphs */}
              {metricsHistory && metricsHistory.length > 0 && (
                <>
                  <h2 className={styles.sectionTitle} style={{ marginTop: '48px', marginBottom: '24px' }}>
                    Historical Trends
                  </h2>
                  
                  <div className={styles.chartsGrid}>
                    {/* CPU Charts - shown when CPU card is selected */}
                    {selectedMetricCard === 'cpu' && (
                      <>
                        {/* CPU Usage Chart */}
                        {metricsHistory.some(m => m.cpu_usage != null) && (
                          <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>CPU Usage</h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={metricsHistory.filter(m => m.cpu_usage != null).map(m => ({
                                time: new Date(m.timestamp).toLocaleTimeString(),
                                'CPU %': m.cpu_usage,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis 
                                  dataKey="time" 
                                  stroke="var(--text-medium)"
                                  tick={{ fontSize: 12 }}
                                />
                                <YAxis 
                                  stroke="var(--text-medium)" 
                                  tick={{ fontSize: 12 }}
                                  domain={[0, 100]}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'var(--card-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                  }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="CPU %" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* CPU Temperature Chart - only shown if CPU temp data exists in history */}
                        {metricsHistory.some(m => m.cpu_temperature !== null && m.cpu_temperature !== undefined) && (
                          <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>CPU Temperature</h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={metricsHistory.filter(m => m.cpu_temperature !== null && m.cpu_temperature !== undefined).map(m => ({
                                time: new Date(m.timestamp).toLocaleTimeString(),
                                'CPU °C': m.cpu_temperature,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis 
                                  dataKey="time" 
                                  stroke="var(--text-medium)"
                                  tick={{ fontSize: 12 }}
                                />
                                <YAxis 
                                  stroke="var(--text-medium)" 
                                  tick={{ fontSize: 12 }}
                                  domain={[0, 100]}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'var(--card-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                  }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="CPU °C" stroke="#f97316" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </>
                    )}

                    {/* Memory Charts - shown when Memory card is selected */}
                    {selectedMetricCard === 'memory' && (
                      <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>Memory Usage</h3>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={metricsHistory.map(m => ({
                            time: new Date(m.timestamp).toLocaleTimeString(),
                            'Usage %': m.memory_percentage,
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis 
                              dataKey="time" 
                              stroke="var(--text-medium)"
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis 
                              stroke="var(--text-medium)" 
                              tick={{ fontSize: 12 }}
                              domain={[0, 100]}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'var(--card-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                              }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="Usage %" stroke="#f59e0b" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Disk Charts - shown when Disk card is selected */}
                    {selectedMetricCard === 'disk' && (
                      <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>Disk Usage</h3>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={metricsHistory.map(m => ({
                            time: new Date(m.timestamp).toLocaleTimeString(),
                            'Usage %': m.disk_percentage,
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis 
                              dataKey="time" 
                              stroke="var(--text-medium)"
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis 
                              stroke="var(--text-medium)" 
                              tick={{ fontSize: 12 }}
                              domain={[0, 100]}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'var(--card-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                              }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="Usage %" stroke="#ef4444" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* GPU Charts - shown when GPU card is selected */}
                    {selectedMetricCard === 'gpu' && (
                      <>
                        {/* GPU Usage Chart - only shown if GPU data exists in history */}
                        {metricsHistory.some(m => m.gpu_utilization !== null && m.gpu_utilization !== undefined) && (
                          <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>GPU Usage</h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={metricsHistory.filter(m => m.gpu_utilization !== null && m.gpu_utilization !== undefined).map(m => ({
                                time: new Date(m.timestamp).toLocaleTimeString(),
                                'GPU %': m.gpu_utilization,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis 
                                  dataKey="time" 
                                  stroke="var(--text-medium)"
                                  tick={{ fontSize: 12 }}
                                />
                                <YAxis 
                                  stroke="var(--text-medium)" 
                                  tick={{ fontSize: 12 }}
                                  domain={[0, 100]}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'var(--card-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                  }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="GPU %" stroke="#10b981" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* GPU Memory Chart - only shown if GPU memory data exists in history */}
                        {metricsHistory.some(m => m.gpu_memory_percentage !== null && m.gpu_memory_percentage !== undefined) && (
                          <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>GPU Memory</h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={metricsHistory.filter(m => m.gpu_memory_percentage !== null && m.gpu_memory_percentage !== undefined).map(m => ({
                                time: new Date(m.timestamp).toLocaleTimeString(),
                                'VRAM %': m.gpu_memory_percentage,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis 
                                  dataKey="time" 
                                  stroke="var(--text-medium)"
                                  tick={{ fontSize: 12 }}
                                />
                                <YAxis 
                                  stroke="var(--text-medium)" 
                                  tick={{ fontSize: 12 }}
                                  domain={[0, 100]}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'var(--card-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                  }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="VRAM %" stroke="#06b6d4" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* GPU Temperature Chart - only shown if GPU temp data exists in history */}
                        {metricsHistory.some(m => m.gpu_temperature !== null && m.gpu_temperature !== undefined) && (
                          <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>GPU Temperature</h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={metricsHistory.filter(m => m.gpu_temperature !== null && m.gpu_temperature !== undefined).map(m => ({
                                time: new Date(m.timestamp).toLocaleTimeString(),
                                'GPU °C': m.gpu_temperature,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis 
                                  dataKey="time" 
                                  stroke="var(--text-medium)"
                                  tick={{ fontSize: 12 }}
                                />
                                <YAxis 
                                  stroke="var(--text-medium)" 
                                  tick={{ fontSize: 12 }}
                                  domain={[0, 100]}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'var(--card-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                  }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="GPU °C" stroke="#ec4899" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className={styles.offlineNotice}>
              <AlertIcon size={48} />
              <h3>Server Offline</h3>
              <p>
                Metrics are only available when the server is online. 
                Click "Check Status" to update the server status.
              </p>
            </div>
          )}
        </>
      )}

      {/* Keep terminal mounted but hidden to maintain connection - desktop only */}
      {server.status === 'online' && !isMobile && (
        <div style={{ display: activeTab === 'terminal' ? 'block' : 'none', width: '100%', height: 'calc(100vh - 300px)', marginTop: '16px' }}>
          <Terminal serverId={id} isVisible={activeTab === 'terminal'} />
        </div>
      )}

      {activeTab === 'terminal' && server.status !== 'online' && !isMobile && (
        <div className={styles.offlineNotice}>
          <AlertIcon size={48} />
          <h3>Server Offline</h3>
          <p>
            Terminal access is only available when the server is online. 
            Click "Check Status" to update the server status.
          </p>
        </div>
      )}

      {activeTab === 'files' && server.status === 'online' && (
        <FileBrowser serverId={id} />
      )}

      {activeTab === 'files' && server.status !== 'online' && (
        <div className={styles.offlineNotice}>
          <AlertIcon size={48} />
          <h3>Server Offline</h3>
          <p>
            File browsing is only available when the server is online. 
            Click "Check Status" to update the server status.
          </p>
        </div>
      )}

      {activeTab === 'services' && server.status === 'online' && (
        <ServicesManager serverId={id} />
      )}

      {activeTab === 'services' && server.status !== 'online' && (
        <div className={styles.offlineNotice}>
          <AlertIcon size={48} />
          <h3>Server Offline</h3>
          <p>
            Service management is only available when the server is online. 
            Click "Check Status" to update the server status.
          </p>
        </div>
      )}

      {activeTab === 'apps' && (
        <div className={styles.appsContent}>
          <div className={styles.appsHeader}>
            <h2 className={styles.sectionTitle}>
              <AppsIcon size={24} /> Deployed Apps
            </h2>
            <Link to="/apps">
              <Button variant="outline" size="small">
                Browse All Apps
              </Button>
            </Link>
          </div>

          {deploymentsLoading ? (
            <div className={styles.loading}>Loading deployments...</div>
          ) : deployments.length === 0 ? (
            <div className={styles.emptyState}>
              <AppsIcon size={60} />
              <h3>No Apps Deployed</h3>
              <p>This server doesn't have any Docker containers running yet.</p>
              <Link to="/apps">
                <Button variant="primary">
                  Deploy an App
                </Button>
              </Link>
            </div>
          ) : (
            <div className={styles.deploymentsTable}>
              <div className={styles.tableHeader}>
                <div>App</div>
                <div>Container</div>
                <div>Status</div>
                <div>Ports</div>
                <div>Deployed</div>
                <div>Actions</div>
              </div>
              {deployments.map((deployment) => {
                const isExpanded = expandedDeployments[deployment.id];
                const isLogsExpanded = expandedLogs[deployment.id];
                return (
                  <React.Fragment key={deployment.id}>
                    <div className={styles.tableRow}>
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
                        <div className={styles.containerId}>{deployment.container_id}</div>
                      </div>
                      <div>
                        <span className={`${styles.statusBadge} ${
                          deployment.status === 'running' ? styles.statusRunning :
                          ['snapshotting', 'restoring', 'migrating'].includes(deployment.status) ? styles.statusPending :
                          styles.statusStopped
                        }`}>
                          {deployment.status === 'running' ? '● Running' : 
                           deployment.status === 'snapshotting' ? '◐ Snapshotting' :
                           deployment.status === 'restoring' ? '◐ Restoring' :
                           deployment.status === 'migrating' ? '◐ Migrating' :
                           '○ Stopped'}
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
                            {deployment.web_ui_port && deployment.status === 'running' && (
                              <a
                                href={`http://${server.ip}:${deployment.web_ui_port}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.webUiLink}
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
                        {['snapshotting', 'restoring', 'migrating'].includes(deployment.status) ? (
                          <Button
                            variant="outline"
                            size="small"
                            disabled
                          >
                            {deployment.status === 'snapshotting' ? 'Snapshotting...' : 
                             deployment.status === 'restoring' ? 'Restoring...' : 'Migrating...'}
                          </Button>
                        ) : deployment.status === 'running' ? (
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
                          onClick={() => setEditingDeployment(deployment)}
                        >
                          <SettingsIcon size={14} /> Config
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
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <ServerSettingsTab 
          server={server}
          onUpdate={() => queryClient.invalidateQueries(['server', id])}
          onDelete={(serverId, force) => deleteServerMutation.mutate({ serverId, force })}
          isDeleting={deleteServerMutation.isPending}
          deleteWarning={deleteWarning}
          deleteServerRef={deleteServerRef}
        />
      )}

      {/* Edit Deployment Modal */}
      <EditDeploymentModal
        isOpen={!!editingDeployment}
        onClose={() => setEditingDeployment(null)}
        deployment={editingDeployment}
        serverId={id}
        server={server}
      />

      {/* Remove Deployment Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, deployment: null })}
        onConfirm={handleConfirmRemoveDeployment}
        title="Remove Deployment"
        message={`Stop and remove container "${confirmModal.deployment?.container_name}"?`}
        confirmText="Remove"
        variant="danger"
      />
    </Layout>
  );
};

// Server Settings Tab Component
const ServerSettingsTab = ({ server, onUpdate, onDelete, isDeleting, deleteWarning, deleteServerRef }) => {
  const [formData, setFormData] = useState({
    displayName: '',
    name: '',
    region: '',
    color: null,
    icon: null,
    tags: []
  });
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteConfirmIp, setDeleteConfirmIp] = useState('');

  useEffect(() => {
    if (server) {
      console.log('[ServerSettingsTab] Server data received:', { icon: server.icon, iconUrl: server.iconUrl });
      setFormData({
        displayName: server.displayName || '',
        name: server.name || '',
        region: server.region || '',
        color: server.color || null,
        icon: server.icon || null,
        iconUrl: server.iconUrl || null,
        tags: server.tags || []
      });
    }
  }, [server]);

  // Check if form has changes
  const hasChanges = React.useMemo(() => {
    if (!server) return false;
    
    return (
      (formData.displayName || '') !== (server.displayName || '') ||
      (formData.name || '') !== (server.name || '') ||
      (formData.region || '') !== (server.region || '') ||
      formData.color !== server.color ||
      formData.icon !== server.icon ||
      formData.iconUrl !== server.iconUrl ||
      JSON.stringify(formData.tags || []) !== JSON.stringify(server.tags || [])
    );
  }, [formData, server]);

  const handleInputChange = (field, value) => {
    console.log('[ServerDetail] handleInputChange:', field, value);
    // Handle icon object that contains both icon and iconUrl
    if (field === 'icon' && typeof value === 'object') {
      console.log('[ServerDetail] Icon object received:', value);
      setFormData(prev => ({ 
        ...prev, 
        icon: value.icon || null, 
        iconUrl: value.iconUrl || null 
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    setSaveSuccess(false);
  };

  const handleAddTag = (e) => {
    e?.preventDefault();
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag) && formData.tags.length < 10) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
      setTagInput('');
      setSaveSuccess(false);
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        displayName: formData.displayName || null,
        name: formData.name || null,
        region: formData.region || null,
        color: formData.color,
        icon: formData.icon,
        icon_url: formData.iconUrl,
        tags: formData.tags
      };
      console.log('[ServerDetail] Saving with payload:', payload);
      
      const result = await serversService.updateServer(server.id, payload);
      console.log('[ServerDetail] Save result:', result);
      
      setSaveSuccess(true);
      onUpdate();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCommand = () => {
    if (server.setupCommand) {
      navigator.clipboard.writeText(server.setupCommand.trim());
    }
  };

  const regions = [
    { value: 'us-east', label: '🇺🇸 US East' },
    { value: 'us-west', label: '🇺🇸 US West' },
    { value: 'us-central', label: '🇺🇸 US Central' },
    { value: 'eu-west', label: '🇪🇺 EU West' },
    { value: 'eu-central', label: '🇪🇺 EU Central' },
    { value: 'ap-east', label: '🇯🇵 Asia Pacific East' },
    { value: 'ap-south', label: '🇮🇳 Asia Pacific South' },
    { value: 'sa-east', label: '🇧🇷 South America' },
    { value: 'af-south', label: '🇿🇦 Africa South' },
    { value: 'au-east', label: '🇦🇺 Australia' },
  ];

  return (
    <div className={styles.settingsContent}>
      {/* Customization Section */}
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsTitle}>Server Customization</h3>
        <p className={styles.settingsDescription}>
          Personalize how this server appears in the dashboard.
        </p>

        <div className={styles.settingsForm}>
          <div className={styles.settingsRow}>
            <div className={styles.settingsField}>
              <label className={styles.fieldLabel}>Display Name</label>
              <input
                type="text"
                className={styles.fieldInput}
                placeholder="Custom display name..."
                value={formData.displayName}
                onChange={(e) => handleInputChange('displayName', e.target.value)}
                maxLength={50}
              />
              <span className={styles.fieldHint}>Overrides the server name in the UI</span>
            </div>

            <div className={styles.settingsField}>
              <label className={styles.fieldLabel}>Server Name</label>
              <input
                type="text"
                className={styles.fieldInput}
                placeholder="Server name..."
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className={styles.settingsRow}>
            <div className={styles.settingsField}>
              <label className={styles.fieldLabel}>Region</label>
              <select
                className={styles.fieldSelect}
                value={formData.region}
                onChange={(e) => handleInputChange('region', e.target.value)}
              >
                <option value="">Select region...</option>
                {regions.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.settingsRow}>
            <div className={styles.settingsField}>
              <ColorPicker
                value={formData.color}
                onChange={(color) => handleInputChange('color', color)}
                label="Accent Color"
              />
            </div>

            <div className={styles.settingsField}>
              <IconSelector
                value={formData.icon}
                iconUrl={formData.iconUrl}
                onChange={(icon) => handleInputChange('icon', icon)}
                label="Server Icon"
                showCustomUpload={true}
              />
            </div>
          </div>

          <div className={styles.settingsField}>
            <label className={styles.fieldLabel}>Tags</label>
            <div className={styles.tagsInput}>
              {formData.tags.map(tag => (
                <span key={tag} className={styles.tagChip}>
                  {tag}
                  <button 
                    className={styles.tagRemove}
                    onClick={() => handleRemoveTag(tag)}
                    type="button"
                  >
                    <XIcon size={14} />
                  </button>
                </span>
              ))}
              {formData.tags.length < 10 && (
                <input
                  type="text"
                  className={styles.tagInputField}
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag(e)}
                  maxLength={20}
                />
              )}
            </div>
            <span className={styles.fieldHint}>Press Enter to add. Max 10 tags.</span>
          </div>

          <div className={styles.settingsActions}>
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            {saveSuccess && (
              <span className={styles.saveSuccess}><CheckCircleIcon size={16} /> Settings saved!</span>
            )}
            {hasChanges && !saveSuccess && (
              <span className={styles.unsavedChanges}>Unsaved changes</span>
            )}
          </div>
        </div>
      </div>

      {/* SSH Setup Section */}
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsTitle}>SSH Setup Command</h3>
        <p className={styles.settingsDescription}>
          Run this command on your server <strong>{server.ip}</strong> to set up SSH access.
          <strong style={{ display: 'block', marginTop: '8px', color: 'var(--warning-color)' }}>
            ⚠️ Make sure you are running as root (use <code style={{ background: 'var(--background)', padding: '2px 6px', borderRadius: '4px' }}>sudo su</code> first) before executing this command.
          </strong>
        </p>
        <div className={styles.codeBlock}>
          {server.setupCommand || 'No setup command available'}
        </div>
        <Button onClick={handleCopyCommand} disabled={!server.setupCommand}>
          Copy Command
        </Button>
      </div>

      {/* Delete Server Section */}
      <div 
        ref={deleteServerRef}
        className={`${styles.settingsSection} ${styles.deleteServerSection}`}
      >
        <h3 className={styles.settingsTitle}>Delete Server</h3>
        <p className={styles.settingsDescription}>
          This action cannot be undone. This will permanently delete the server 
          and all associated data from the management system.
        </p>
        
        {deleteWarning && (
          <div className={styles.deleteWarningBox}>
            <AlertIcon size={18} />
            <span>{deleteWarning}</span>
          </div>
        )}
        
        <p className={styles.settingsDescription}>
          To confirm, type <strong>{server.displayName || server.name || server.ip}</strong> and <strong>{server.ip}</strong> below:
        </p>
        
        <div className={styles.deleteForm}>
          <div className={styles.settingsField}>
            <label className={styles.fieldLabel}>Server Name</label>
            <input
              type="text"
              className={styles.fieldInput}
              placeholder={`Type "${server.displayName || server.name || server.ip}" to confirm`}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
          </div>
          
          <div className={styles.settingsField}>
            <label className={styles.fieldLabel}>Server IP</label>
            <input
              type="text"
              className={styles.fieldInput}
              placeholder={`Type "${server.ip}" to confirm`}
              value={deleteConfirmIp}
              onChange={(e) => setDeleteConfirmIp(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
          </div>
          
          <Button
            variant="danger"
            onClick={() => {
              const serverDisplayName = server.displayName || server.name || server.ip;
              if (deleteConfirmName === serverDisplayName && deleteConfirmIp === server.ip && onDelete) {
                onDelete(server.id, !!deleteWarning);
              }
            }}
            disabled={
              deleteConfirmName !== (server.displayName || server.name || server.ip) || 
              deleteConfirmIp !== server.ip || 
              isDeleting
            }
          >
            <TrashIcon size={16} />
            {isDeleting ? 'Deleting...' : deleteWarning ? 'Force Delete Server' : 'Delete Server'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ServerDetail;
