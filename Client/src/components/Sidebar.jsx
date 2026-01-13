import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DashboardIcon, ServersIcon, AppsIcon, ConnectionsIcon, SettingsIcon } from './Icons';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const { user } = useAuth();

  const navItems = [
    { path: '/', icon: DashboardIcon, label: 'Dashboard' },
    { path: '/servers', icon: ServersIcon, label: 'Servers' },
    { path: '/apps', icon: AppsIcon, label: 'Apps' },
    { path: '/connections', icon: ConnectionsIcon, label: 'Connections' },
  ];

  return (
    <div className={styles.sidebar}>
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
          <span>NeoBase</span>
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
        {user && (
          <>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
            <NavLink to="/settings" className={styles.settingsBtn}>
              <SettingsIcon size={20} />
            </NavLink>
          </>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
