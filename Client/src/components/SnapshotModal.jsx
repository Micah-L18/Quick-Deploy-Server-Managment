import React from 'react';
import Modal from './Modal';
import SnapshotContent from './SnapshotContent';

/**
 * Modal wrapper for SnapshotContent
 * For standalone snapshot management (e.g., from AppDetail page)
 */
const SnapshotModal = ({ isOpen, onClose, deployment, server }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Volume Snapshots" size="large">
      <SnapshotContent 
        deployment={deployment} 
        server={server} 
        isVisible={isOpen}
        showFooter={true}
        onClose={onClose}
      />
    </Modal>
  );
};

export default SnapshotModal;
