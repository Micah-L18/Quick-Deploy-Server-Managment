import React from 'react';
import Modal from './Modal';
import Button from './Button';
import styles from './AlertModal.module.css';

const AlertModal = ({ isOpen, onClose, title, message, type = 'info', confirmText = 'OK' }) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
      <div className={styles.alertContent}>
        <div className={`${styles.iconWrapper} ${styles[type]}`}>
          <span className={styles.icon}>{getIcon()}</span>
        </div>
        <p className={styles.message}>{message}</p>
        <div className={styles.buttonWrapper}>
          <Button variant="primary" onClick={onClose}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AlertModal;
