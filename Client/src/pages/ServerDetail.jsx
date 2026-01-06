import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Terminal from '../components/Terminal';
import FileBrowser from '../components/FileBrowser';
import { serversService } from '../api/servers';
import { getRegionFlag } from '../utils/formatters';
import { RefreshIcon, ServersIcon, AlertIcon, EyeIcon, EyeOffIcon } from '../components/Icons';
import styles from './ServerDetail.module.css';

const ServerDetail = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [metricsError, setMetricsError] = useState(null);
  const [activeTab, setActiveTab] = useState('metrics');
  const [timeRange, setTimeRange] = useState(24); // hours
  const [ipVisible, setIpVisible] = useState(false);

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
      navigator.clipboard.writeText(server.setupCommand);
      alert('Setup command copied to clipboard!');
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
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'metrics' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          System Metrics
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'terminal' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          Terminal
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'files' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
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
                  >
                    <option value={1}>Last Hour</option>
                    <option value={6}>Last 6 Hours</option>
                    <option value={24}>Last 24 Hours</option>
                    <option value={168}>Last Week</option>
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
                <div className={styles.metricCard}>
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
                  </div>
                </div>
              )}

              {metrics.memory && (
                <div className={styles.metricCard}>
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
                <div className={styles.metricCard}>
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

              {metrics.os && (
                <div className={styles.metricCard}>
                  <h3 className={styles.metricTitle}>System Info</h3>
                  <div className={styles.metricContent}>
                    {metrics.hostname && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Hostname</span>
                        <span className={styles.metricValue}>{metrics.hostname}</span>
                      </div>
                    )}
                    <div className={styles.metricDetail}>
                      <span className={styles.metricLabel}>OS</span>
                      <span className={styles.metricValue}>{metrics.os}</span>
                    </div>
                    {metrics.uptime && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Uptime</span>
                        <span className={styles.metricValue}>{metrics.uptime}</span>
                      </div>
                    )}
                    {metrics.totalRam && (
                      <div className={styles.metricDetail}>
                        <span className={styles.metricLabel}>Total RAM</span>
                        <span className={styles.metricValue}>{metrics.totalRam}</span>
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

                    {/* Memory Usage Chart */}
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

                    {/* Disk Usage Chart */}
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

      {/* Keep terminal mounted but hidden to maintain connection */}
      {server.status === 'online' && (
        <div style={{ display: activeTab === 'terminal' ? 'block' : 'none', width: '100%', height: 'calc(100vh - 300px)', marginTop: '16px' }}>
          <Terminal serverId={id} isVisible={activeTab === 'terminal'} />
        </div>
      )}

      {activeTab === 'terminal' && server.status !== 'online' && (
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

      {activeTab === 'settings' && (
        <div className={styles.settingsContent}>
          <div className={styles.settingsSection}>
            <h3 className={styles.settingsTitle}>SSH Setup Command</h3>
            <p className={styles.settingsDescription}>
              Run this command on your server <strong>{server.ip}</strong> to set up SSH access:
            </p>
            <div className={styles.codeBlock}>
              {server.setupCommand || 'No setup command available'}
            </div>
            <Button onClick={handleCopyCommand} disabled={!server.setupCommand}>
              Copy Command
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ServerDetail;
