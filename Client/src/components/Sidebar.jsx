import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DashboardIcon, ServersIcon, AppsIcon, ConnectionsIcon, SettingsIcon, BookOpenIcon, HardDriveIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { systemService } from '../api/system';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
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

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed);
    // Dispatch custom event for Layout component to listen to
    window.dispatchEvent(new Event('sidebarToggle'));
  }, [collapsed]);

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

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

      <div className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''} ${collapsed ? styles.collapsed : ''}`}>
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
          <button 
            className={styles.collapseBtn}
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon size={18} /> : <ChevronLeftIcon size={18} />}
          </button>
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
                title={collapsed ? item.label : undefined}
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
          {updateAvailable && (
            <button
              className={styles.updateNotification}
              onClick={(e) => {
                e.preventDefault();
                navigate('/settings');
                handleNavClick();
              }}
              title={collapsed ? 'Update Available' : undefined}
            >
              <span className={styles.updateDot}></span>
              <span>Update Available</span>
            </button>
          )}
          <NavLink 
            to="/docs" 
            className={styles.docsBtn} 
            onClick={handleNavClick}
            title={collapsed ? 'Documentation' : undefined}
          >
            <BookOpenIcon size={18} />
            <span className={styles.docsBtnLabel}>Docs</span>
            {version && <span className={styles.versionBadge}>v{version}</span>}
          </NavLink>
          {user && (
            <div className={styles.userCard}>
              <div className={styles.userInfo}>
                <div className={styles.userName}>{user.name}</div>
                <div className={styles.userEmail}>{user.email}</div>
              </div>
              <NavLink to="/settings" className={styles.settingsBtn} onClick={handleNavClick} title="Settings">
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
