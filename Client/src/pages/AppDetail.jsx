import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import Button from '../components/Button';
import { appsService } from '../api/apps';
import { AppsIcon, AlertIcon, RefreshIcon } from '../components/Icons';
import styles from './AppDetail.module.css';

const AppDetail = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', id],
    queryFn: () => appsService.getApp(id),
    refetchInterval: 5000,
  });

  if (appLoading) {
    return (
      <Layout>
        <div className={styles.loading}>Loading app details...</div>
      </Layout>
    );
  }

  if (!app) {
    return (
      <Layout>
        <div className={styles.error}>
          <AlertIcon size={60} />
          <h2>App Not Found</h2>
          <p>The app you're looking for doesn't exist.</p>
          <Link to="/apps">
            <Button>Back to Apps</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <div>
          <Link to="/apps" className={styles.backLink}>
            ← Back to Apps
          </Link>
          <h1 className={styles.pageTitle}>
            <AppsIcon size={32} />
            {app.name}
          </h1>
        </div>
        <div className={styles.headerActions}>
          <Button
            onClick={() => queryClient.invalidateQueries(['app', id])}
            variant="outline"
          >
            <RefreshIcon size={18} /> Refresh
          </Button>
        </div>
      </div>

      <div className={styles.appInfo}>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>App Name</span>
            <span>{app.name}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Description</span>
            <span>{app.description || 'No description provided'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Created</span>
            <span>{new Date(app.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'overview' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'deployments' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('deployments')}
        >
          Deployments
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'environment' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('environment')}
        >
          Environment
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'settings' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>App Overview</h2>
            <div className={styles.overviewGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Status</div>
                <div className={styles.statValue}>Active</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Deployments</div>
                <div className={styles.statValue}>0</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Last Deployment</div>
                <div className={styles.statValue}>Never</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deployments' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Deployments</h2>
            <div className={styles.emptyState}>
              <p>No deployments yet</p>
              <Button variant="primary">
                <AppsIcon size={16} /> Create Deployment
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'environment' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Environment Variables</h2>
            <div className={styles.emptyState}>
              <p>No environment variables configured</p>
              <Button variant="primary">
                Add Variable
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>App Settings</h2>
            <div className={styles.settingsForm}>
              <div className={styles.formGroup}>
                <label>App Name</label>
                <input type="text" value={app.name} disabled />
              </div>
              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea value={app.description || ''} disabled rows={3} />
              </div>
              <div className={styles.dangerZone}>
                <h3>Danger Zone</h3>
                <p>Once you delete an app, there is no going back.</p>
                <Button variant="danger">
                  Delete App
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default AppDetail;
