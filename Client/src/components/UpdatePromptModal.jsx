import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { useBackgroundJobs } from '../contexts/BackgroundJobsContext';
import { CheckCircleIcon, RefreshIcon, SettingsIcon } from './Icons';
import styles from './UpdatePromptModal.module.css';

/**
 * Modal that appears when a system update completes
 * Prompts user to restart now or later
 */
const UpdatePromptModal = () => {
  const { 
    showUpdateModal, 
    systemUpdate, 
    restartServer, 
    dismissUpdateModal 
  } = useBackgroundJobs();

  if (!showUpdateModal) return null;

  const handleRestartNow = async () => {
    await restartServer();
  };

  const handleRestartLater = () => {
    dismissUpdateModal();
  };

  return (
    <Modal
      isOpen={showUpdateModal}
      title="Update Complete"
      onClose={handleRestartLater}
      footer={
        <div className={styles.actions}>
          <Button variant="outline" onClick={handleRestartLater}>
            <SettingsIcon size={16} />
            Restart Later
          </Button>
          <Button variant="primary" onClick={handleRestartNow}>
            <RefreshIcon size={16} />
            Restart Now
          </Button>
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.successIcon}>
          <CheckCircleIcon size={48} />
        </div>
        
        <p className={styles.message}>
          NoBase has been updated successfully!
        </p>

        {(systemUpdate.newVersion || systemUpdate.newCommit) && (
          <div className={styles.versionInfo}>
            {systemUpdate.newVersion && (
              <div className={styles.versionItem}>
                <span className={styles.versionLabel}>New Version:</span>
                <span className={styles.versionValue}>v{systemUpdate.newVersion}</span>
              </div>
            )}
            {systemUpdate.newCommit && (
              <div className={styles.versionItem}>
                <span className={styles.versionLabel}>Commit:</span>
                <code className={styles.commitHash}>{systemUpdate.newCommit}</code>
              </div>
            )}
          </div>
        )}

        <p className={styles.restartNote}>
          A server restart is required to apply the changes.
          You can restart now or continue working and restart later from the Settings page.
        </p>
      </div>
    </Modal>
  );
};

export default UpdatePromptModal;
