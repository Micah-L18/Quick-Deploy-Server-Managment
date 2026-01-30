import React, { useState, useRef } from 'react';
import { uploadsService } from '../api/uploads';
import { showError, showSuccess } from '../utils/toast';
import styles from './IconUploader.module.css';

// Helper to get full icon URL
const getIconUrl = (iconUrl) => {
  if (!iconUrl) return null;
  if (iconUrl.startsWith('http')) return iconUrl;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';
  return `${backendUrl}${iconUrl}`;
};

const IconUploader = ({ currentIcon, currentIconUrl, onIconChange }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(currentIconUrl || null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      showError('Image must be less than 5MB');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Upload to server
      const result = await uploadsService.uploadIcon(file, (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        setUploadProgress(percentCompleted);
      });

      // Update preview
      setPreviewUrl(result.iconUrl);

      // Notify parent component
      onIconChange({
        icon: 'custom',
        iconUrl: result.iconUrl
      });

    } catch (error) {
      console.error('Icon upload failed:', error);
      showError(`Failed to upload icon: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveIcon = async () => {
    if (!previewUrl) return;

    const confirmed = window.confirm('Remove this custom icon?');
    if (!confirmed) return;

    try {
      await uploadsService.deleteIcon(previewUrl);
      setPreviewUrl(null);
      
      // Notify parent to clear icon
      onIconChange({
        icon: null,
        iconUrl: null
      });
    } catch (error) {
      console.error('Icon removal failed:', error);
      showError(`Failed to remove icon: ${error.message}`);
    }
  };

  return (
    <div className={styles.iconUploader}>
      <div className={styles.preview}>
        {previewUrl ? (
          <img src={getIconUrl(previewUrl)} alt="Icon preview" className={styles.previewImage} />
        ) : (
          <div className={styles.placeholder}>
            <span>No custom icon</span>
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        
        <button
          type="button"
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? `Uploading ${uploadProgress}%` : 'Upload Icon'}
        </button>

        {previewUrl && (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={handleRemoveIcon}
            disabled={isUploading}
          >
            Remove
          </button>
        )}
      </div>

      <div className={styles.hint}>
        Max 5MB. PNG, JPG, GIF, WebP, or SVG
      </div>
    </div>
  );
};

export default IconUploader;
