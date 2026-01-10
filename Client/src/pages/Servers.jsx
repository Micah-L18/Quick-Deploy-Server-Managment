import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { serversService } from '../api/servers';
import { getRegionFlag } from '../utils/formatters';
import { RefreshIcon, PlusIcon, ServersIcon, TrashIcon, EyeIcon, EyeOffIcon } from '../components/Icons';
import styles from './Servers.module.css';

const Servers = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [newServerData, setNewServerData] = useState(null);
  const [hiddenIPs, setHiddenIPs] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    region: 'us-east',
    ip: '',
  });

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: serversService.getServers,
    refetchInterval: 30000,
  });

  // Fetch metrics for all online servers using useQueries
  const onlineServers = servers?.filter(s => s.status === 'online') || [];
  
  const metricsQueries = useQueries({
    queries: onlineServers.map(server => ({
      queryKey: ['server-metrics', server.id],
      queryFn: () => serversService.getMetrics(server.id),
      refetchInterval: 30000,
      retry: false,
      enabled: true,
    })),
  });

  // Create a map of server metrics
  const serverMetrics = {};
  onlineServers.forEach((server, index) => {
    if (metricsQueries[index]?.data) {
      serverMetrics[server.id] = metricsQueries[index].data;
    }
  });

  const addServerMutation = useMutation({
    mutationFn: serversService.addServer,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['servers']);
      setShowAddModal(false);
      setFormData({ name: '', region: 'us-east', ip: '' });
      // Show setup command modal
      setNewServerData(data);
      setShowSetupModal(true);
    },
  });

  const deleteServerMutation = useMutation({
    mutationFn: serversService.deleteServer,
    onSuccess: () => {
      queryClient.invalidateQueries(['servers']);
    },
  });

  const checkAllMutation = useMutation({
    mutationFn: serversService.checkAllStatus,
    onSuccess: () => {
      queryClient.invalidateQueries(['servers']);
    },
  });

  const handleAddServer = (e) => {
    e.preventDefault();
    addServerMutation.mutate({ ...formData, username: 'root' });
  };

  const handleDeleteServer = (id, name) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      deleteServerMutation.mutate(id);
    }
  };

  const toggleIPVisibility = (serverId) => {
    setHiddenIPs(prev => ({
      ...prev,
      [serverId]: !prev[serverId]
    }));
  };

  const handleRefreshAll = () => {
    checkAllMutation.mutate();
  };

  const filteredServers = servers?.filter(
    (server) =>
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.ip.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Servers</h1>
        <div className={styles.headerActions}>
          <input
            type="text"
            placeholder="Search servers..."
            className={styles.searchBox}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button onClick={handleRefreshAll} variant="outline">
            <RefreshIcon size={18} /> Refresh All
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <PlusIcon size={18} /> Add Server
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>Loading servers...</div>
      ) : filteredServers && filteredServers.length > 0 ? (
        <div className={styles.serversGrid}>
          {filteredServers.map((server) => (
            <div key={server.id} className={styles.serverCard}>
              <div className={styles.serverHeader}>
                <div className={styles.serverInfo}>
                  <div className={styles.serverName}>
                    {server.name}
                    <span className={styles.regionBadge}>
                      {getRegionFlag(server.region)} {server.region}
                    </span>
                  </div>
                  <span className={`${styles.statusBadge} ${styles[server.status || 'pending']}`}>
                    <span className={styles.statusDot}></span>
                    {server.status || 'pending'}
                  </span>
                </div>
              </div>

              <div className={styles.serverDetails}>
                <div className={styles.serverDetail}>
                  <strong>IP:</strong>
                  <span className={styles.ipAddress}>
                    {hiddenIPs[server.id] ? server.ip : '•••.•••.•••.•••'}
                  </span>
                  <button 
                    className={styles.ipToggleBtn}
                    onClick={() => toggleIPVisibility(server.id)}
                    title={hiddenIPs[server.id] ? 'Hide IP' : 'Show IP'}
                  >
                    {hiddenIPs[server.id] ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
                <div className={styles.serverDetail}>
                  <strong>Username:</strong> {server.username}
                </div>
                {server.last_checked && (
                  <div className={styles.serverDetail}>
                    <strong>Last checked:</strong>{' '}
                    {new Date(server.last_checked).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Metrics Section */}
              {server.status === 'online' && serverMetrics[server.id] && (
                <div className={styles.metricsSection}>
                  {serverMetrics[server.id].cpu?.usage !== undefined && serverMetrics[server.id].cpu?.usage !== null && (
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>CPU</span>
                      <div className={styles.metricBar}>
                        <div 
                          className={styles.metricFill} 
                          style={{ 
                            width: `${serverMetrics[server.id].cpu.usage}%`,
                            backgroundColor: serverMetrics[server.id].cpu.usage > 80 ? '#ef4444' : serverMetrics[server.id].cpu.usage > 60 ? '#f59e0b' : '#10b981'
                          }}
                        ></div>
                      </div>
                      <span className={styles.metricValue}>{serverMetrics[server.id].cpu.usage}%</span>
                    </div>
                  )}
                  {serverMetrics[server.id].memory?.percentage !== undefined && serverMetrics[server.id].memory?.percentage !== null && (
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>Memory</span>
                      <div className={styles.metricBar}>
                        <div 
                          className={styles.metricFill} 
                          style={{ 
                            width: `${serverMetrics[server.id].memory.percentage}%`,
                            backgroundColor: serverMetrics[server.id].memory.percentage > 80 ? '#ef4444' : serverMetrics[server.id].memory.percentage > 60 ? '#f59e0b' : '#10b981'
                          }}
                        ></div>
                      </div>
                      <span className={styles.metricValue}>{serverMetrics[server.id].memory.percentage}%</span>
                    </div>
                  )}
                  {serverMetrics[server.id].disk?.percentage !== undefined && serverMetrics[server.id].disk?.percentage !== null && (
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>Disk</span>
                      <div className={styles.metricBar}>
                        <div 
                          className={styles.metricFill} 
                          style={{ 
                            width: `${serverMetrics[server.id].disk.percentage}%`,
                            backgroundColor: serverMetrics[server.id].disk.percentage > 80 ? '#ef4444' : serverMetrics[server.id].disk.percentage > 60 ? '#f59e0b' : '#10b981'
                          }}
                        ></div>
                      </div>
                      <span className={styles.metricValue}>{serverMetrics[server.id].disk.percentage}%</span>
                    </div>
                  )}
                </div>
              )}

              <div className={styles.serverActions}>
                <Link to={`/servers/${server.id}`} className={styles.actionBtn}>
                  <ServersIcon size={16} /> View Details
                </Link>
                <button
                  className={`${styles.actionBtn} ${styles.danger}`}
                  onClick={() => handleDeleteServer(server.id, server.name)}
                  disabled={deleteServerMutation.isPending}
                >
                  <TrashIcon size={16} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <ServersIcon size={80} />
          </span>
          <h3 className={styles.emptyTitle}>No servers yet</h3>
          <p className={styles.emptyText}>
            Get started by adding your first server
          </p>
          <Button onClick={() => setShowAddModal(true)}>
            <PlusIcon size={18} /> Add Server
          </Button>
        </div>
      )}

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Server"
      >
        <form onSubmit={handleAddServer}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Server Name</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Region</label>
              <select
                className={styles.formSelect}
                value={formData.region}
                onChange={(e) =>
                  setFormData({ ...formData, region: e.target.value })
                }
              >
                <option value="us-east">🇺🇸 US East</option>
                <option value="us-west">🇺🇸 US West</option>
                <option value="eu-west">🇪🇺 EU West</option>
                <option value="eu-central">🇪🇺 EU Central</option>
                <option value="asia-southeast">🌏 Asia Southeast</option>
                <option value="asia-east">🌏 Asia East</option>
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>IP Address / Hostname</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.ip}
                onChange={(e) =>
                  setFormData({ ...formData, ip: e.target.value })
                }
                required
                placeholder="192.168.1.100"
              />
              <p className={styles.formHint}>SSH connection will use root user</p>
            </div>
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
              disabled={addServerMutation.isPending}
            >
              {addServerMutation.isPending ? 'Adding...' : 'Add Server'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Setup Command Modal */}
      <Modal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        title="🔑 SSH Key Setup Required"
      >
        <div className={styles.setupModal}>
          <p className={styles.setupDescription}>
            <strong>Important:</strong> You must run this command on your server <strong>{newServerData?.ip}</strong> to enable SSH key authentication:
          </p>
          
          <div className={styles.setupInstructions}>
            <ol>
              <li>SSH into your server using password: <code>ssh root@{newServerData?.ip}</code></li>
              <li>Run this command on the server:</li>
            </ol>
          </div>
          
          <div className={styles.codeBlock}>
            {newServerData?.setupCommand || 'No setup command available'}
          </div>
          
          <Button 
            onClick={() => {
              navigator.clipboard.writeText((newServerData?.setupCommand || '').trim());
            }}
            style={{ marginTop: '1rem', width: '100%' }}
          >
            📋 Copy Setup Command
          </Button>
          
          <p className={styles.setupNote}>
            After running the command, click "Check Status" on the server to verify the connection.
          </p>
          
          <div className={styles.modalFooter}>
            <Button onClick={() => setShowSetupModal(false)} variant="outline">
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default Servers;
