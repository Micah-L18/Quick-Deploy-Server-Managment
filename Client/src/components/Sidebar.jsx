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
        <div className={styles.logo}>NeoBase ye</div>
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
