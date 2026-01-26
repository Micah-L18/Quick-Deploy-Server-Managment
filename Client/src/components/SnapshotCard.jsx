import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import Modal from './Modal';
import { 
  TrashIcon, 
  DownloadIcon, 
  RefreshIcon, 
  AlertIcon,
  ServerIcon,
  BoxIcon,
  EyeIcon,
  HardDriveIcon
} from './Icons';
import styles from './SnapshotCard.module.css';

// Helper function to get full icon URL
const getIconUrl = (iconUrl) => {
  if (!iconUrl) return null;
  if (iconUrl.startsWith('http')) return iconUrl;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';
  return `${backendUrl}${iconUrl}`;
};

const SnapshotCard = ({ snapshot, onDelete, onRestore }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [iconError, setIconError] = useState(false);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return date.toLocaleDateString();
  };

  const formatFullDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const isOrphaned = !snapshot.app_name || snapshot.app_name === null;
  const volumeCount = snapshot.volume_paths ? JSON.parse(snapshot.volume_paths).length : 0;
  const volumePaths = snapshot.volume_paths ? JSON.parse(snapshot.volume_paths) : [];

  // Parse app config if available
  let appConfig = null;
  let appIcon = null;
  if (snapshot.app_config) {
    try {
      appConfig = typeof snapshot.app_config === 'string' 
        ? JSON.parse(snapshot.app_config) 
        : snapshot.app_config;
      appIcon = appConfig.icon_url || appConfig.icon;
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Parse deployment config if available
  let deploymentConfig = null;
  if (snapshot.deployment_config) {
    try {
      deploymentConfig = typeof snapshot.deployment_config === 'string'
        ? JSON.parse(snapshot.deployment_config)
        : snapshot.deployment_config;
    } catch (e) {
      // Ignore parse errors
    }
  }

  return (
    <>
      <div className={`${styles.card} ${isOrphaned ? styles.orphaned : ''}`}>
        {/* Icon */}
        <div className={styles.appIcon}>
          {appIcon && !iconError ? (
            <img 
              src={getIconUrl(appIcon)} 
              alt="" 
              className={styles.icon} 
              onError={() => setIconError(true)}
            />
          ) : (
            <BoxIcon size={24} />
          )}
        </div>

        {/* Info */}
        <div className={styles.info}>
          <div className={styles.titleRow}>
            <h3 className={styles.appName}>
              {snapshot.app_name || 'Unknown App'}
              {isOrphaned && (
                <span className={styles.orphanedBadge}>
                  <AlertIcon size={12} />
                  Orphaned
                </span>
              )}
            </h3>
          </div>
          <div className={styles.metadata}>
            <span className={styles.metaItem}>
              <ServerIcon size={14} />
              {snapshot.server_name ? (
                <Link to={`/servers/${snapshot.server_id}`} className={styles.link}>
                  {snapshot.server_name}
                </Link>
              ) : (
                snapshot.server_ip || 'Unknown Server'
              )}
            </span>
            <span className={styles.metaItem}>
              {formatBytes(snapshot.size_bytes || 0)}
            </span>
            <span className={styles.metaItem}>
              {volumeCount} volume{volumeCount !== 1 ? 's' : ''}
            </span>
            <span className={styles.metaItem}>
              {formatDate(snapshot.created_at)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <Button
            variant="outline"
            size="small"
            onClick={() => setShowDetails(true)}
            title="View Details"
          >
            <EyeIcon size={14} />
          </Button>
          {!isOrphaned && onRestore && (
            <Button
              variant="outline"
              size="small"
              onClick={() => onRestore(snapshot)}
              title="Restore"
            >
              <RefreshIcon size={14} />
            </Button>
          )}
          <a
            href={`/api/snapshots/${snapshot.id}/download`}
            download
            className={styles.downloadLink}
          >
            <Button variant="outline" size="small" title="Download">
              <DownloadIcon size={14} />
            </Button>
          </a>
          <Button
            variant="danger"
            size="small"
            onClick={() => onDelete(snapshot)}
            title="Delete"
          >
            <TrashIcon size={14} />
          </Button>
        </div>
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title="Snapshot Details"
        size="large"
      >
        <div className={styles.detailsModal}>
          {/* Header */}
          <div className={styles.detailsHeader}>
            <div className={styles.detailsIcon}>
              {appIcon ? (
                <img src={getIconUrl(appIcon)} alt="" className={styles.icon} />
              ) : (
                <BoxIcon size={32} />
              )}
            </div>
            <div className={styles.detailsTitle}>
              <h2>{snapshot.app_name || 'Unknown App'}</h2>
              {isOrphaned && (
                <span className={styles.orphanedBadge}>
                  <AlertIcon size={12} />
                  Orphaned
                </span>
              )}
              <span className={`${styles.statusBadgeInline} ${styles[snapshot.status]}`}>
                {snapshot.status}
              </span>
            </div>
          </div>

          {/* Info Grid */}
          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Server</span>
              <span className={styles.detailValue}>
                {snapshot.server_name || snapshot.server_ip || 'Unknown'}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Server IP</span>
              <span className={styles.detailValue}>
                {snapshot.server_ip || 'N/A'}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Container</span>
              <span className={styles.detailValue}>
                {snapshot.container_name || deploymentConfig?.container_name || 'N/A'}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Total Size</span>
              <span className={styles.detailValue}>{formatBytes(snapshot.size_bytes || 0)}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Created</span>
              <span className={styles.detailValue}>{formatFullDate(snapshot.created_at)}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Volumes Backed Up</span>
              <span className={styles.detailValue}>{volumeCount}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Snapshot ID</span>
              <span className={styles.detailValue}>
                <code className={styles.codeSmall}>{snapshot.id}</code>
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Archive File</span>
              <span className={styles.detailValue}>
                <code className={styles.codeSmall}>{snapshot.archive_filename || 'N/A'}</code>
              </span>
            </div>
            {snapshot.deployment_id && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Deployment ID</span>
                <span className={styles.detailValue}>
                  <code className={styles.codeSmall}>{snapshot.deployment_id}</code>
                </span>
              </div>
            )}
          </div>

          {/* Volume Paths */}
          {volumePaths.length > 0 && (
            <div className={styles.detailsSection}>
              <h4><HardDriveIcon size={16} /> Volume Paths</h4>
              <ul className={styles.volumeList}>
                {volumePaths.map((path, idx) => (
                  <li key={idx}>{path}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes */}
          {snapshot.notes && (
            <div className={styles.detailsSection}>
              <h4>Notes</h4>
              <p className={styles.notesContent}>{snapshot.notes}</p>
            </div>
          )}

          {/* App Config - Show for all snapshots that have it */}
          {appConfig && (
            <div className={styles.detailsSection}>
              <h4>App Configuration</h4>
              {isOrphaned && (
                <p className={styles.configNote}>
                  This snapshot contains stored configuration that can be used to recreate the app.
                </p>
              )}
              <div className={styles.configGrid}>
                {appConfig.name && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>App Name</span>
                    <code>{appConfig.name}</code>
                  </div>
                )}
                {appConfig.image && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Docker Image</span>
                    <code>{appConfig.image}</code>
                  </div>
                )}
                {appConfig.ports && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Ports</span>
                    <code>{typeof appConfig.ports === 'object' ? JSON.stringify(appConfig.ports) : appConfig.ports}</code>
                  </div>
                )}
                {appConfig.volumes && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Volumes</span>
                    <code>{typeof appConfig.volumes === 'object' ? JSON.stringify(appConfig.volumes) : appConfig.volumes}</code>
                  </div>
                )}
                {appConfig.environment && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Environment</span>
                    <code>{typeof appConfig.environment === 'object' ? JSON.stringify(appConfig.environment) : appConfig.environment}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deployment Config */}
          {deploymentConfig && (
            <div className={styles.detailsSection}>
              <h4>Deployment Configuration</h4>
              <div className={styles.configGrid}>
                {deploymentConfig.container_name && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Container Name</span>
                    <code>{deploymentConfig.container_name}</code>
                  </div>
                )}
                {deploymentConfig.port_mappings && deploymentConfig.port_mappings.length > 0 && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Port Mappings</span>
                    <code>
                      {Array.isArray(deploymentConfig.port_mappings) 
                        ? deploymentConfig.port_mappings.map(p => `${p.host}:${p.container}`).join(', ')
                        : String(deploymentConfig.port_mappings)}
                    </code>
                  </div>
                )}
                {deploymentConfig.volume_overrides && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Volume Overrides</span>
                    <code>{typeof deploymentConfig.volume_overrides === 'object' ? JSON.stringify(deploymentConfig.volume_overrides) : deploymentConfig.volume_overrides}</code>
                  </div>
                )}
                {deploymentConfig.env_overrides && (
                  <div className={styles.configItem}>
                    <span className={styles.configLabel}>Environment Overrides</span>
                    <code>{typeof deploymentConfig.env_overrides === 'object' ? JSON.stringify(deploymentConfig.env_overrides) : deploymentConfig.env_overrides}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={styles.detailsActions}>
            {!isOrphaned && onRestore && (
              <Button
                variant="primary"
                onClick={() => {
                  setShowDetails(false);
                  onRestore(snapshot);
                }}
              >
                <RefreshIcon size={16} /> Restore Snapshot
              </Button>
            )}
            <a
              href={`/api/snapshots/${snapshot.id}/download`}
              download
              className={styles.downloadLink}
            >
              <Button variant="outline">
                <DownloadIcon size={16} /> Download
              </Button>
            </a>
            <Button
              variant="danger"
              onClick={() => {
                setShowDetails(false);
                onDelete(snapshot);
              }}
            >
              <TrashIcon size={16} /> Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SnapshotCard;
