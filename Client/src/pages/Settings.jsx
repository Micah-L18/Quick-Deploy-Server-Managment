import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { SettingsIcon, RefreshIcon, ServerIcon, CheckCircleIcon, AlertIcon, MoonIcon, SunIcon } from '../components/Icons';
import { systemService } from '../api/system';
import styles from './Settings.module.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';

const Settings = () => {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoMessage, setInfoMessage] = useState({ title: '', content: '' });
  const [preferences, setPreferences] = useState({
    autoRefresh: true,
    notifications: true,
  });
  
  // System update state
  const [updateLogs, setUpdateLogs] = useState([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const updateLogsRef = useRef(null);
  const socketRef = useRef(null);

  // Fetch version info
  const { data: versionInfo, isLoading: versionLoading, refetch: refetchVersion } = useQuery({
    queryKey: ['system-version'],
    queryFn: systemService.getVersion,
    staleTime: 60000, // 1 minute
  });

  // Fetch system status
  const { data: systemStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: systemService.getStatus,
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch changelog when update available
  const { data: changelog } = useQuery({
    queryKey: ['system-changelog'],
    queryFn: systemService.getChangelog,
    enabled: versionInfo?.updateAvailable,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: systemService.triggerUpdate,
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries(['system-version']);
        addUpdateLog('Update completed successfully!', 'success');
      }
      setIsUpdating(false);
    },
    onError: (error) => {
      addUpdateLog(`Update failed: ${error.message}`, 'error');
      setIsUpdating(false);
    }
  });

  // Restart mutation
  const restartMutation = useMutation({
    mutationFn: systemService.restartServer,
    onSuccess: () => {
      addUpdateLog('Server restart initiated. Please wait...', 'warning');
    }
  });

  // Socket.IO for update progress
  useEffect(() => {
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on('system-update-progress', ({ message, type }) => {
      addUpdateLog(message, type);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto-scroll update logs
  useEffect(() => {
    if (updateLogsRef.current) {
      updateLogsRef.current.scrollTop = updateLogsRef.current.scrollHeight;
    }
  }, [updateLogs]);

  const addUpdateLog = (message, type = 'info') => {
    setUpdateLogs(prev => [...prev, { message, type, timestamp: new Date().toISOString() }]);
  };

  const handleCheckForUpdates = () => {
    refetchVersion();
  };

  const handleStartUpdate = () => {
    if (!window.confirm('This will update the server to the latest version. Continue?')) {
      return;
    }
    setUpdateLogs([]);
    setIsUpdating(true);
    addUpdateLog('Starting update process...', 'info');
    updateMutation.mutate();
  };

  const handleRestartServer = () => {
    if (!window.confirm('This will restart the server. All active connections will be temporarily interrupted. Continue?')) {
      return;
    }
    restartMutation.mutate();
  };

  useEffect(() => {
    // Load preferences from localStorage
    const stored = localStorage.getItem('NoBase_preferences');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setPreferences(parsed);
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    }
  }, []);

  const handlePreferenceChange = (key, value) => {
    const newPreferences = {
      ...preferences,
      [key]: value,
    };
    setPreferences(newPreferences);
    localStorage.setItem('NoBase_preferences', JSON.stringify(newPreferences));
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
      navigate('/login');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          <SettingsIcon size={32} />
          Settings
        </h1>
      </div>

      {/* System Update Section */}
      <div className={styles.settingsSection}>
        <h2 className={styles.sectionTitle}>
          <ServerIcon size={20} />
          System Update
        </h2>
        
        {/* Version Info */}
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Current Version</div>
            <div className={styles.infoValue}>
              {versionLoading ? '...' : `v${versionInfo?.currentVersion || '?.?.?'}`}
            </div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Git Commit</div>
            <div className={styles.infoValue}>
              {versionLoading ? '...' : versionInfo?.currentCommit || 'N/A'}
            </div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Branch</div>
            <div className={styles.infoValue}>
              {versionLoading ? '...' : versionInfo?.currentBranch || 'N/A'}
            </div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Server Uptime</div>
            <div className={styles.infoValue}>
              {statusLoading ? '...' : systemStatus?.uptime || 'N/A'}
            </div>
          </div>
        </div>

        {/* Update Status */}
        {versionInfo?.updateAvailable && (
          <div className={styles.updateBanner}>
            <div className={styles.updateBannerIcon}>
              <AlertIcon size={24} />
            </div>
            <div className={styles.updateBannerContent}>
              <strong>Update Available!</strong>
              <span>{versionInfo.behindBy} commit{versionInfo.behindBy > 1 ? 's' : ''} behind</span>
              <button 
                className={styles.changelogToggle}
                onClick={() => setShowChangelog(!showChangelog)}
              >
                {showChangelog ? 'Hide changelog' : 'View changelog'}
              </button>
            </div>
          </div>
        )}

        {/* Changelog */}
        {showChangelog && changelog?.commits?.length > 0 && (
          <div className={styles.changelog}>
            <h4>Incoming Changes:</h4>
            <ul>
              {changelog.commits.map((commit, idx) => (
                <li key={idx}>
                  <code>{commit.hash}</code> {commit.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Update Logs */}
        {updateLogs.length > 0 && (
          <div className={styles.updateLogs} ref={updateLogsRef}>
            {updateLogs.map((log, idx) => (
              <div key={idx} className={`${styles.logEntry} ${styles[log.type]}`}>
                <span className={styles.logTime}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {log.message}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className={styles.updateActions}>
          <Button
            variant="outline"
            size="small"
            onClick={handleCheckForUpdates}
            disabled={versionLoading}
          >
            <RefreshIcon size={16} />
            Check for Updates
          </Button>
          
          {versionInfo?.updateAvailable && (
            <Button
              variant="primary"
              size="small"
              onClick={handleStartUpdate}
              disabled={isUpdating}
            >
              {isUpdating ? 'Updating...' : 'Update Now'}
            </Button>
          )}

          {updateMutation.isSuccess && (
            <Button
              variant="warning"
              size="small"
              onClick={handleRestartServer}
              disabled={restartMutation.isPending}
            >
              Restart Server
            </Button>
          )}
        </div>

        {/* PM2 Notice */}
        {systemStatus && !systemStatus.pm2Running && (
          <div className={styles.pm2Notice}>
            <AlertIcon size={16} />
            <span>
              <strong>Note:</strong> PM2 not detected. For automatic restarts after updates, 
              run the server with PM2: <code>npm run pm2:start</code>
            </span>
          </div>
        )}
      </div>

      {/* Account Information */}
      <div className={styles.settingsSection}>
        <h2 className={styles.sectionTitle}>Account Information</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Name</div>
            <div className={styles.infoValue}>{user?.name || 'N/A'}</div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Email</div>
            <div className={styles.infoValue}>{user?.email || 'N/A'}</div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Member Since</div>
            <div className={styles.infoValue}>
              {formatDate(user?.created_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className={styles.settingsSection}>
        <h2 className={styles.sectionTitle}>Security</h2>
        <div className={styles.settingsGrid}>
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>Password</div>
            <div className={`${styles.settingValue} ${styles.passwordValue}`}>
              ••••••••
            </div>
            <div className={styles.settingActions}>
              <Button
                variant="outline"
                size="small"
                onClick={() => {
                  setInfoMessage({ title: 'Coming Soon', content: 'Password change feature coming soon!' });
                  setShowInfoModal(true);
                }}
              >
                Change Password
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className={styles.settingsSection}>
        <h2 className={styles.sectionTitle}>Preferences</h2>
        <div className={styles.settingsGrid}>
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isDarkMode ? <MoonIcon size={20} /> : <SunIcon size={20} />}
                <span>Dark Mode</span>
              </div>
            </div>
            <p className={styles.settingDescription}>
              Toggle between light and dark theme
            </p>
            <div className={styles.settingActions}>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={isDarkMode}
                  onChange={toggleDarkMode}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>

          <div className={styles.settingItem}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={preferences.autoRefresh}
                onChange={(e) =>
                  handlePreferenceChange('autoRefresh', e.target.checked)
                }
              />
              Auto-refresh server status
            </label>
            <p className={styles.settingDescription}>
              Automatically refresh server statuses every 30 seconds
            </p>
          </div>

          <div className={styles.settingItem}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={preferences.notifications}
                onChange={(e) =>
                  handlePreferenceChange('notifications', e.target.checked)
                }
              />
              Enable notifications
            </label>
            <p className={styles.settingDescription}>
              Show notifications for server status changes
            </p>
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <h2 className={styles.sectionTitle}>Account Actions</h2>
        <div className={styles.settingsGrid}>
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>Logout</div>
            <p className={styles.settingDescription}>
              Sign out of your account
            </p>
            <div className={styles.settingActions}>
              <Button variant="outline" size="small" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>Delete Account</div>
            <p className={styles.settingDescription}>
              Permanently delete your account and all data
            </p>
            <div className={styles.settingActions}>
              <Button
                variant="danger"
                size="small"
                onClick={() => {
                  setInfoMessage({ title: 'Coming Soon', content: 'Account deletion feature coming soon!' });
                  setShowInfoModal(true);
                }}
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      <Modal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title={infoMessage.title}
      >
        <div style={{ padding: '1rem 0' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
            {infoMessage.content}
          </p>
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowInfoModal(false)}>
              OK
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default Settings;
