import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ServerSettingsModal from '../components/ServerSettingsModal';
import { SERVER_ICONS } from '../components/IconSelector';
import { serversService } from '../api/servers';
import { getRegionFlag } from '../utils/formatters';
import { RefreshIcon, PlusIcon, ServersIcon, EyeIcon, EyeOffIcon, SettingsIcon } from '../components/Icons';
import styles from './Servers.module.css';

const Servers = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  const [modalMessage, setModalMessage] = useState({ title: '', content: '' });
  const [newServerData, setNewServerData] = useState(null);
  const [hiddenIPs, setHiddenIPs] = useState({});
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
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

  const checkAllMutation = useMutation({
    mutationFn: serversService.checkAllStatus,
    onSuccess: () => {
      queryClient.invalidateQueries(['servers']);
    },
  });

  const updateServerMutation = useMutation({
    mutationFn: ({ id, data }) => serversService.updateServer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['servers']);
      setShowSettingsModal(false);
      setSelectedServer(null);
    },
  });

  const handleAddServer = (e) => {
    e.preventDefault();
    // Username defaults to 'nobase' on backend if not provided
    addServerMutation.mutate(formData);
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

  const handleOpenSettings = (server) => {
    setSelectedServer(server);
    setShowSettingsModal(true);
  };

  const handleSaveSettings = (updates) => {
    if (selectedServer) {
      updateServerMutation.mutate({ id: selectedServer.id, data: updates });
    }
  };

  // Helper to get server display name
  const getServerDisplayName = (server) => {
    return server.displayName || server.name || server.ip;
  };

  // Helper to render server icon
  const renderServerIcon = (server) => {
    if (server.icon && SERVER_ICONS[server.icon]) {
      return (
        <div 
          className={styles.serverIcon}
          style={{ color: server.color || 'var(--primary-gradient)' }}
          dangerouslySetInnerHTML={{ __html: SERVER_ICONS[server.icon].svg }}
        />
      );
    }
    return null;
  };

  // Extract available tags and colors from all servers
  const availableTags = [...new Set(servers?.flatMap(s => s.tags || []) || [])].sort();
  const availableColors = [...new Set(servers?.map(s => s.color).filter(Boolean) || [])];

  // Check if any filters are active
  const hasActiveFilters = selectedTags.length > 0 || selectedColors.length > 0 || selectedStatus !== 'all';

  const filteredServers = servers?.filter((server) => {
    // Search filter
    const matchesSearch = 
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (server.displayName && server.displayName.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Tag filter - server must have ALL selected tags
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.every(tag => server.tags?.includes(tag));
    
    // Color filter - server must have ONE of the selected colors
    const matchesColors = selectedColors.length === 0 || 
      selectedColors.includes(server.color);
    
    // Status filter
    const matchesStatus = selectedStatus === 'all' || server.status === selectedStatus;
    
    return matchesSearch && matchesTags && matchesColors && matchesStatus;
  });

  const handleToggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleToggleColor = (color) => {
    setSelectedColors(prev => 
      prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
    );
  };

  const clearAllFilters = () => {
    setSelectedTags([]);
    setSelectedColors([]);
    setSelectedStatus('all');
  };

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
          {(availableTags.length > 0 || availableColors.length > 0) && (
            <Button 
              variant={showFilters ? 'primary' : 'outline'} 
              onClick={() => setShowFilters(!showFilters)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              Filters {hasActiveFilters && `(${selectedTags.length + selectedColors.length + (selectedStatus !== 'all' ? 1 : 0)})`}
            </Button>
          )}
          <Button onClick={() => setShowAddModal(true)}>
            <PlusIcon size={18} /> Add Server
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className={styles.filterBar}>
          <div className={styles.filterSection}>
            <span className={styles.filterLabel}>Status:</span>
            <div className={styles.filterOptions}>
              <button
                className={`${styles.statusFilterBtn} ${selectedStatus === 'all' ? styles.selected : ''}`}
                onClick={() => setSelectedStatus('all')}
              >
                All
              </button>
              <button
                className={`${styles.statusFilterBtn} ${styles.online} ${selectedStatus === 'online' ? styles.selected : ''}`}
                onClick={() => setSelectedStatus('online')}
              >
                Online
              </button>
              <button
                className={`${styles.statusFilterBtn} ${styles.offline} ${selectedStatus === 'offline' ? styles.selected : ''}`}
                onClick={() => setSelectedStatus('offline')}
              >
                Offline
              </button>
              <button
                className={`${styles.statusFilterBtn} ${styles.pending} ${selectedStatus === 'pending' ? styles.selected : ''}`}
                onClick={() => setSelectedStatus('pending')}
              >
                Pending
              </button>
            </div>
          </div>
          {availableColors.length > 0 && (
            <div className={styles.filterSection}>
              <span className={styles.filterLabel}>Colors:</span>
              <div className={styles.filterOptions}>
                {availableColors.map(color => (
                  <button
                    key={color}
                    className={`${styles.colorFilterBtn} ${selectedColors.includes(color) ? styles.selected : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleToggleColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
          {availableTags.length > 0 && (
            <div className={styles.filterSection}>
              <span className={styles.filterLabel}>Tags:</span>
              <div className={styles.filterOptions}>
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    className={`${styles.tagFilterBtn} ${selectedTags.includes(tag) ? styles.selected : ''}`}
                    onClick={() => handleToggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasActiveFilters && (
            <button className={styles.clearFiltersBtn} onClick={clearAllFilters}>
              Clear all
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className={styles.emptyState}>Loading servers...</div>
      ) : (
        <div className={styles.serversGrid}>
          {/* Add Server Card */}
          <button 
            className={styles.addServerCard}
            onClick={() => setShowAddModal(true)}
          >
            <div className={styles.addServerIcon}>
              <PlusIcon size={48} />
            </div>
            <span className={styles.addServerText}>Add Server</span>
          </button>

          {filteredServers?.map((server) => (
            <div 
              key={server.id} 
              className={styles.serverCard}
              style={{ 
                borderLeftColor: server.color || 'transparent',
                borderLeftWidth: server.color ? '4px' : '0'
              }}
            >
              <div className={styles.serverHeader}>
                <div className={styles.serverInfo}>
                  <div className={styles.serverNameRow}>
                    {renderServerIcon(server)}
                    <div className={styles.serverName}>
                      {getServerDisplayName(server)}
                      <span className={styles.regionBadge}>
                        {getRegionFlag(server.region)} {server.region}
                      </span>
                    </div>
                  </div>
                  <span className={`${styles.statusBadge} ${styles[server.status || 'pending']}`}>
                    <span className={styles.statusDot}></span>
                    {server.status || 'pending'}
                  </span>
                </div>
                <button
                  className={styles.settingsBtn}
                  onClick={() => handleOpenSettings(server)}
                  title="Server Settings"
                >
                  <SettingsIcon size={18} />
                </button>
              </div>

              {/* Tags Display */}
              {server.tags && server.tags.length > 0 && (
                <div className={styles.tagsRow}>
                  {server.tags.slice(0, 3).map(tag => (
                    <span key={tag} className={styles.serverTag}>{tag}</span>
                  ))}
                  {server.tags.length > 3 && (
                    <span className={styles.tagMore}>+{server.tags.length - 3}</span>
                  )}
                </div>
              )}

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

              {/* Metrics Section - Always show for online servers */}
              {server.status === 'online' && (
                <div className={styles.metricsSection}>
                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>CPU</span>
                    {serverMetrics[server.id]?.cpu?.usage !== undefined && serverMetrics[server.id]?.cpu?.usage !== null ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <div className={styles.metricBar}></div>
                        <span className={styles.metricValue}>N/A</span>
                      </>
                    )}
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>Memory</span>
                    {serverMetrics[server.id]?.memory?.percentage !== undefined && serverMetrics[server.id]?.memory?.percentage !== null ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <div className={styles.metricBar}></div>
                        <span className={styles.metricValue}>N/A</span>
                      </>
                    )}
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>Disk</span>
                    {serverMetrics[server.id]?.disk?.percentage !== undefined && serverMetrics[server.id]?.disk?.percentage !== null ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <div className={styles.metricBar}></div>
                        <span className={styles.metricValue}>N/A</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.serverActions}>
                <Link to={`/servers/${server.id}`} className={styles.actionBtn}>
                  <ServersIcon size={16} /> View Details
                </Link>
              </div>
            </div>
          ))}
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

      {/* Server Settings Modal */}
      <ServerSettingsModal
        isOpen={showSettingsModal}
        onClose={() => {
          setShowSettingsModal(false);
          setSelectedServer(null);
        }}
        server={selectedServer}
        onSave={handleSaveSettings}
        isLoading={updateServerMutation.isPending}
      />
    </Layout>
  );
};

export default Servers;
