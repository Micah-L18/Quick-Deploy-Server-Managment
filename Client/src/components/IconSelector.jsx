import React, { useState, useEffect } from 'react';
import IconUploader from './IconUploader';
import { uploadsService } from '../api/uploads';
import styles from './IconSelector.module.css';

// Helper to get full icon URL
const getIconUrl = (iconUrl) => {
  if (!iconUrl) return null;
  if (iconUrl.startsWith('http')) return iconUrl;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3044';
  return `${backendUrl}${iconUrl}`;
};

// Custom SVG icons for server types
const SERVER_ICONS = {
  web: {
    name: 'Web Server',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>`
  },
  database: {
    name: 'Database',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>`
  },
  game: {
    name: 'Game Server',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="6" y1="12" x2="10" y2="12"/>
      <line x1="8" y1="10" x2="8" y2="14"/>
      <circle cx="15" cy="13" r="1"/>
      <circle cx="18" cy="11" r="1"/>
      <rect x="2" y="6" width="20" height="12" rx="2"/>
    </svg>`
  },
  storage: {
    name: 'Storage',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1"/>
      <rect x="2" y="10" width="20" height="5" rx="1"/>
      <rect x="2" y="17" width="20" height="5" rx="1"/>
      <circle cx="6" cy="5.5" r="1"/>
      <circle cx="6" cy="12.5" r="1"/>
      <circle cx="6" cy="19.5" r="1"/>
    </svg>`
  },
  api: {
    name: 'API Server',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 17l6-6-6-6"/>
      <path d="M12 19h8"/>
    </svg>`
  },
  cloud: {
    name: 'Cloud',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>`
  },
  container: {
    name: 'Container',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>`
  },
  server: {
    name: 'Server',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
      <line x1="6" y1="6" x2="6.01" y2="6"/>
      <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>`
  },
  monitor: {
    name: 'Monitoring',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>`
  },
  mail: {
    name: 'Mail Server',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>`
  },
  shield: {
    name: 'Security',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>`
  },
  code: {
    name: 'Development',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>`
  }
};

const IconSelector = ({ value, iconUrl, onChange, label = 'Icon', showCustomUpload = false }) => {
  const [showSelector, setShowSelector] = useState(false);
  const [uploadedIcons, setUploadedIcons] = useState([]);

  // Debug logging
  console.log('[IconSelector] Props:', { value, iconUrl, showCustomUpload });

  // Fetch uploaded icons when selector opens
  useEffect(() => {
    if (showSelector && showCustomUpload) {
      uploadsService.listIcons().then(icons => {
        console.log('[IconSelector] Fetched uploaded icons:', icons);
        setUploadedIcons(icons);
      }).catch(console.error);
    }
  }, [showSelector, showCustomUpload]);

  const handleIconSelect = (iconKey) => {
    console.log('[IconSelector] Selected predefined icon:', iconKey);
    onChange({ icon: iconKey, iconUrl: null });
    setShowSelector(false);
  };

  const handleUploadedIconSelect = (iconUrl) => {
    console.log('[IconSelector] Selected custom icon:', iconUrl);
    onChange({ icon: 'custom', iconUrl });
    setShowSelector(false);
  };

  const handleClear = () => {
    console.log('[IconSelector] Cleared icon');
    onChange({ icon: null, iconUrl: null });
    setShowSelector(false);
  };

  const handleCustomIconChange = (data) => {
    console.log('[IconSelector] Custom icon changed:', data);
    onChange(data);
  };

  // If iconUrl is provided, it's a custom icon
  const isCustomIcon = iconUrl && iconUrl.startsWith('/uploads/');
  const selectedIcon = value && !isCustomIcon ? SERVER_ICONS[value] : null;

  console.log('[IconSelector] Computed:', { isCustomIcon, selectedIcon: selectedIcon?.name });

  return (
    <div className={styles.iconSelectorContainer}>
      <label className={styles.label}>{label}</label>
      <div className={styles.iconDisplay} onClick={() => setShowSelector(!showSelector)}>
        <div className={styles.iconPreview}>
          {isCustomIcon ? (
            <img src={getIconUrl(iconUrl)} alt="Custom icon" className={styles.customIcon} />
          ) : selectedIcon ? (
            <div 
              className={styles.iconSvg} 
              dangerouslySetInnerHTML={{ __html: selectedIcon.svg }}
            />
          ) : (
            <span className={styles.noIcon}>?</span>
          )}
        </div>
        <span className={styles.iconName}>
          {isCustomIcon ? 'Custom Icon' : selectedIcon ? selectedIcon.name : 'Select icon...'}
        </span>
        <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {showSelector && (
        <div className={styles.selectorPopup}>
          <div className={styles.iconGrid}>
            {Object.entries(SERVER_ICONS).map(([key, icon]) => (
              <button
                key={key}
                className={`${styles.iconOption} ${value === key && !isCustomIcon ? styles.selected : ''}`}
                onClick={() => handleIconSelect(key)}
                title={icon.name}
              >
                <div 
                  className={styles.iconOptionSvg} 
                  dangerouslySetInnerHTML={{ __html: icon.svg }}
                />
                <span className={styles.iconOptionName}>{icon.name}</span>
              </button>
            ))}
          </div>
          
          {showCustomUpload && uploadedIcons.length > 0 && (
            <div className={styles.customSection}>
              <h4 className={styles.sectionTitle}>Uploaded Icons</h4>
              <div className={styles.iconGrid}>
                {uploadedIcons.map((url) => {
                  const isSelected = iconUrl === url;
                  console.log('[IconSelector] Custom icon option:', { url, iconUrl, isSelected });
                  return (
                    <button
                      key={url}
                      className={`${styles.iconOption} ${isSelected ? styles.selected : ''}`}
                      onClick={() => handleUploadedIconSelect(url)}
                      title="Custom uploaded icon"
                    >
                      <img 
                        src={getIconUrl(url)} 
                        alt="Custom icon"
                        className={styles.uploadedIconPreview}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {showCustomUpload && (
            <div className={styles.customSection}>
              <h4 className={styles.sectionTitle}>Upload New Icon</h4>
              <IconUploader
                currentIcon={value}
                currentIconUrl={iconUrl}
                onIconChange={handleCustomIconChange}
              />
            </div>
          )}
          
          <button className={styles.clearButton} onClick={handleClear}>
            Clear Icon
          </button>
        </div>
      )}
    </div>
  );
};

// Export icons for use elsewhere
export { SERVER_ICONS };
export default IconSelector;
