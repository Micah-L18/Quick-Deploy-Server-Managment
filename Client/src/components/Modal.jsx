import React, { useEffect } from 'react';
import styles from './Modal.module.css';
import Button from './Button';
import { XIcon } from './Icons';

const Modal = ({ isOpen, onClose, title, children, footer, size = 'default', variant = 'default' }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  const handleCloseClick = (e) => {
    e.stopPropagation();
    if (onClose) {
      onClose();
    }
  };

  const sizeClass = size === 'large' ? styles.modalLarge : size === 'xlarge' ? styles.modalXlarge : '';
  const modalClasses = `${styles.modal} ${sizeClass} ${variant === 'terminal' ? styles.modalTerminal : ''}`;

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={modalClasses}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          {onClose && (
            <button className={styles.closeBtn} onClick={handleCloseClick}>
              <XIcon size={20} />
            </button>
          )}
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer && <div className={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
