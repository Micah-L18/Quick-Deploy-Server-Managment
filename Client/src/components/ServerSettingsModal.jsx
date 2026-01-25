import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import ColorPicker from './ColorPicker';
import IconSelector from './IconSelector';
import { XIcon } from './Icons';
import styles from './ServerSettingsModal.module.css';

const ServerSettingsModal = ({ isOpen, onClose, server, onSave, isLoading }) => {
  const [formData, setFormData] = useState({
    displayName: '',
    name: '',
    region: '',
    color: null,
    icon: null,
    icon_url: null,
    tags: []
  });
  const [tagInput, setTagInput] = useState('');

  // Initialize form data when server changes
  useEffect(() => {
    if (server) {
      setFormData({
        displayName: server.displayName || '',
        name: server.name || '',
        region: server.region || '',
        color: server.color || null,
        icon: server.icon || null,
        icon_url: server.icon_url || null,
        tags: server.tags || []
      });
    }
  }, [server]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag) && formData.tags.length < 10) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag(e);
    }
  };

  const handleSave = () => {
    onSave({
      displayName: formData.displayName || null,
      name: formData.name || null,
      region: formData.region || null,
      color: formData.color,
      icon: formData.icon,
      icon_url: formData.icon_url,
      tags: formData.tags
    });
  };

  const regions = [
    { value: 'us-east', label: '🇺🇸 US East' },
    { value: 'us-west', label: '🇺🇸 US West' },
    { value: 'us-central', label: '🇺🇸 US Central' },
    { value: 'eu-west', label: '🇪🇺 EU West' },
    { value: 'eu-central', label: '🇪🇺 EU Central' },
    { value: 'ap-east', label: '🇯🇵 Asia Pacific East' },
    { value: 'ap-south', label: '🇮🇳 Asia Pacific South' },
    { value: 'sa-east', label: '🇧🇷 South America' },
    { value: 'af-south', label: '🇿🇦 Africa South' },
    { value: 'au-east', label: '🇦🇺 Australia' },
  ];

  if (!server) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Server Settings"
      size="medium"
    >
      <div className={styles.settingsForm}>
        {/* Display Name */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Display Name</label>
          <input
            type="text"
            className={styles.input}
            placeholder="Custom display name..."
            value={formData.displayName}
            onChange={(e) => handleInputChange('displayName', e.target.value)}
            maxLength={50}
          />
          <span className={styles.hint}>
            Overrides the server name in the UI. Leave empty to use default name.
          </span>
        </div>

        {/* Server Name (hostname) */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Server Name</label>
          <input
            type="text"
            className={styles.input}
            placeholder="Server hostname..."
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            maxLength={100}
          />
        </div>

        {/* Region */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Region</label>
          <select
            className={styles.select}
            value={formData.region}
            onChange={(e) => handleInputChange('region', e.target.value)}
          >
            <option value="">Select region...</option>
            {regions.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Color Picker */}
        <div className={styles.formGroup}>
          <ColorPicker
            value={formData.color}
            onChange={(color) => handleInputChange('color', color)}
            label="Accent Color"
          />
        </div>

        {/* Icon Selector */}
        <div className={styles.formGroup}>
          <IconSelector
            value={formData.icon}
            iconUrl={formData.icon_url}
            onChange={(data) => {
              setFormData(prev => ({
                ...prev,
                icon: data.icon || null,
                icon_url: data.iconUrl || null
              }));
            }}
            label="Server Icon"
            showCustomUpload={true}
          />
        </div>

        {/* Tags */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Tags</label>
          <div className={styles.tagsContainer}>
            {formData.tags.map(tag => (
              <span key={tag} className={styles.tag}>
                {tag}
                <button 
                  className={styles.tagRemove}
                  onClick={() => handleRemoveTag(tag)}
                  type="button"
                >
                  <XIcon size={16} />
                </button>
              </span>
            ))}
            {formData.tags.length < 10 && (
              <input
                type="text"
                className={styles.tagInput}
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={20}
              />
            )}
          </div>
          <span className={styles.hint}>
            Press Enter to add. Max 10 tags, 20 characters each.
          </span>
        </div>

        {/* Preview */}
        <div className={styles.previewSection}>
          <label className={styles.label}>Preview</label>
          <div 
            className={styles.preview}
            style={{ 
              borderLeftColor: formData.color || 'var(--border-color)',
              borderLeftWidth: formData.color ? '4px' : '1px'
            }}
          >
            <div className={styles.previewIcon}>
              {formData.icon ? (
                <ServerIcon iconKey={formData.icon} color={formData.color} />
              ) : (
                <DefaultServerIcon />
              )}
            </div>
            <div className={styles.previewInfo}>
              <span className={styles.previewName}>
                {formData.displayName || formData.name || server.ip}
              </span>
              <span className={styles.previewIp}>{server.ip}</span>
            </div>
            {formData.tags.length > 0 && (
              <div className={styles.previewTags}>
                {formData.tags.slice(0, 3).map(tag => (
                  <span key={tag} className={styles.previewTag}>{tag}</span>
                ))}
                {formData.tags.length > 3 && (
                  <span className={styles.previewTagMore}>+{formData.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Helper component to render server icon
const ServerIcon = ({ iconKey, color }) => {
  const { SERVER_ICONS } = require('./IconSelector');
  const icon = SERVER_ICONS[iconKey];
  
  if (!icon) return <DefaultServerIcon />;
  
  return (
    <div 
      style={{ color: color || 'var(--primary-gradient)', width: 24, height: 24 }}
      dangerouslySetInnerHTML={{ __html: icon.svg }}
    />
  );
};

const DefaultServerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/>
    <line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>
);

export default ServerSettingsModal;
