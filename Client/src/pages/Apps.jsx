import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { appsService } from '../api/apps';
import { AppsIcon, PlusIcon, TrashIcon, EyeIcon } from '../components/Icons';
import styles from './Apps.module.css';

const Apps = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: appsService.getApps,
  });

  const createAppMutation = useMutation({
    mutationFn: appsService.createApp,
    onSuccess: () => {
      queryClient.invalidateQueries(['apps']);
      setShowAddModal(false);
      setFormData({ name: '', description: '' });
    },
  });

  const deleteAppMutation = useMutation({
    mutationFn: appsService.deleteApp,
    onSuccess: () => {
      queryClient.invalidateQueries(['apps']);
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

  const filteredApps = apps?.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>My Apps</h1>
        <div className={styles.headerActions}>
          <input
            type="text"
            placeholder="Search apps..."
            className={styles.searchBox}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button onClick={() => setShowAddModal(true)}>
            <PlusIcon size={18} /> Create App
          </Button>
        </div>
      </div>

      {isLoading ? (
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
