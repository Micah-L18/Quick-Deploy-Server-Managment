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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [modalMessage, setModalMessage] = useState({ title: '', content: '' });
  const [serverToDelete, setServerToDelete] = useState(null);
  const [deleteWarning, setDeleteWarning] = useState(null);
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
    onError: (error) => {
      if (error.response?.status === 409) {
        const errorData = error.response.data;
        setModalMessage({
          title: '⚠️ Duplicate Server',
          content: `${errorData.error}\n\nExisting server: ${errorData.existingServer?.name || 'Unnamed'} (${errorData.existingServer?.ip})`
        });
        setShowErrorModal(true);
      }
    },
  });

  const deleteServerMutation = useMutation({
    mutationFn: ({ id, force }) => serversService.deleteServer(id, force),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['servers']);
      setShowDeleteModal(false);
      setServerToDelete(null);
      setDeleteWarning(null);
      if (data.containersRemoved > 0) {
        setModalMessage({
          title: '✅ Server Deleted',
          content: `Server deleted successfully. ${data.containersRemoved} container(s) stopped and removed.`
        });
        setShowSuccessModal(true);
      }
    },
    onError: (error) => {
      if (error.response?.status === 409) {
        // Server has active deployments
        const errorData = error.response.data;
        setDeleteWarning(errorData);
      }
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
    setServerToDelete({ id, name });
    setDeleteWarning(null);
    setShowDeleteModal(true);
  };

  const confirmDelete = (force = false) => {
    if (serverToDelete) {
      deleteServerMutation.mutate({ id: serverToDelete.id, force });
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setServerToDelete(null);
          setDeleteWarning(null);
        }}
        title={deleteWarning ? '⚠️ Warning: Active Deployments' : '🗑️ Delete Server'}
      >
        <div className={styles.deleteModal}>
          {!deleteWarning ? (
            <>
              <p>Are you sure you want to delete <strong>{serverToDelete?.name}</strong>?</p>
              <p className={styles.deleteNote}>This will check for active deployments before deletion.</p>
              <div className={styles.modalFooter}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setServerToDelete(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => confirmDelete(false)}
                  disabled={deleteServerMutation.isPending}
                >
                  {deleteServerMutation.isPending ? 'Checking...' : 'Delete Server'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.warningText}>
                This server has <strong>{deleteWarning.deployments?.length || 0}</strong> active deployment(s):
              </p>
              <ul className={styles.deploymentList}>
                {deleteWarning.deployments?.map((deployment, idx) => (
                  <li key={idx}>
                    <strong>{deployment.appName}</strong> - Container: {deployment.containerName} ({deployment.status})
                  </li>
                ))}
              </ul>
              <p className={styles.warningText}>
                Deleting this server will stop and remove all Docker containers listed above.
              </p>
              <div className={styles.modalFooter}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setServerToDelete(null);
                    setDeleteWarning(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => confirmDelete(true)}
                  disabled={deleteServerMutation.isPending}
                >
                  {deleteServerMutation.isPending ? 'Deleting...' : 'Force Delete & Stop Containers'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Error Modal */}
      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title={modalMessage.title}
      >
        <div className={styles.messageModal}>
          <p style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>{modalMessage.content}</p>
          <div className={styles.modalFooter}>
            <Button onClick={() => setShowErrorModal(false)}>
              OK
            </Button>
          </div>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title={modalMessage.title}
      >
        <div className={styles.messageModal}>
          <p style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>{modalMessage.content}</p>
          <div className={styles.modalFooter}>
            <Button onClick={() => setShowSuccessModal(false)}>
              OK
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default Servers;
