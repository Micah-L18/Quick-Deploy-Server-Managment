import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DashboardIcon, ServersIcon, AppsIcon, ConnectionsIcon, SettingsIcon, BookOpenIcon, HardDriveIcon } from './Icons';
import { systemService } from '../api/system';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [version, setVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const data = await systemService.getVersion();
        setVersion(data.currentVersion);
        setUpdateAvailable(data.updateAvailable || false);
      } catch (error) {
        console.error('Failed to fetch version:', error);
      }
    };
    fetchVersion();
  }, []);

  const navItems = [
    { path: '/', icon: DashboardIcon, label: 'Dashboard' },
    { path: '/servers', icon: ServersIcon, label: 'Servers' },
    { path: '/apps', icon: AppsIcon, label: 'Apps' },
    { path: '/storage', icon: HardDriveIcon, label: 'Storage' },
    // { path: '/connections', icon: ConnectionsIcon, label: 'Connections' },
  ];

  const handleNavClick = () => {
    // Close mobile menu when a nav item is clicked
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button 
        className={styles.hamburgerBtn}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open : ''}`}></span>
        <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open : ''}`}></span>
        <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open : ''}`}></span>
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} />
      )}

      <div className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32">
              <defs>
                <linearGradient id="sidebarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:'#00d4ff',stopOpacity:1}} />
                  <stop offset="100%" style={{stopColor:'#00a8cc',stopOpacity:1}} />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="30" fill="url(#sidebarGradient)"/>
              <ellipse cx="32" cy="20" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
              <ellipse cx="32" cy="32" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
              <ellipse cx="32" cy="44" rx="16" ry="5" fill="#ffffff" opacity="0.9"/>
              <rect x="16" y="20" width="2" height="24" fill="#ffffff" opacity="0.9"/>
              <rect x="46" y="20" width="2" height="24" fill="#ffffff" opacity="0.9"/>
              <circle cx="32" cy="20" r="2.5" fill="#ffffff"/>
              <circle cx="32" cy="32" r="2.5" fill="#ffffff"/>
              <circle cx="32" cy="44" r="2.5" fill="#ffffff"/>
              <path d="M 40 28 L 44 32 L 40 36 L 36 32 Z" fill="#ffffff" opacity="0.6"/>
            </svg>
            <span className={styles.logoText}>NoBase</span>
          </div>
        </div>

        <nav className={styles.sidebarNav}>
          {navItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.active : ''}`
                }
                end={item.path === '/'}
                onClick={handleNavClick}
              >
                <span className={styles.navIcon}>
                  <IconComponent size={20} />
                </span>
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <NavLink 
            to="/docs" 
            className={styles.docsBtn} 
            onClick={handleNavClick}
          >
            <BookOpenIcon size={18} />
            <span className={styles.docsBtnLabel}>Docs</span>
            {version && <span className={styles.versionBadge}>v{version}</span>}
          </NavLink>
          {updateAvailable && (
            <button
              className={styles.updateNotification}
              onClick={(e) => {
                e.preventDefault();
                navigate('/settings');
                handleNavClick();
              }}
            >
              <span className={styles.updateDot}></span>
              <span>Update Available</span>
            </button>
          )}
          {user && (
            <div className={styles.userCard}>
              <div className={styles.userInfo}>
                <div className={styles.userName}>{user.name}</div>
                <div className={styles.userEmail}>{user.email}</div>
              </div>
              <NavLink to="/settings" className={styles.settingsBtn} onClick={handleNavClick}>
                <SettingsIcon size={20} />
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
