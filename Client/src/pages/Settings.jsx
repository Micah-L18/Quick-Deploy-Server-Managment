import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { SettingsIcon } from '../components/Icons';
import styles from './Settings.module.css';

const Settings = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState({
    autoRefresh: true,
    notifications: true,
  });

  useEffect(() => {
    // Load preferences from localStorage
    const stored = localStorage.getItem('neobase_preferences');
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
    localStorage.setItem('neobase_preferences', JSON.stringify(newPreferences));
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
                onClick={() => alert('Password change feature coming soon!')}
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

      {/* Danger Zone */}
      <div className={`${styles.settingsSection} ${styles.dangerZone}`}>
        <h2 className={styles.sectionTitle}>Danger Zone</h2>
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
                onClick={() =>
                  alert('Account deletion feature coming soon!')
                }
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
