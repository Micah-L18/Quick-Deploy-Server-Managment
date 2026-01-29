import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from './Sidebar';
import JobDetailsModal from './JobDetailsModal';
import styles from './Layout.module.css';

const Layout = ({ children }) => {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setSidebarCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');
    };

    // Listen for storage changes (from Sidebar component)
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom event for same-tab updates
    window.addEventListener('sidebarToggle', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebarToggle', handleStorageChange);
    };
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.container}>{children}</div>
      </main>
      <JobDetailsModal />
    </div>
  );
};

export default Layout;
