import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from './Sidebar';
import JobDetailsModal from './JobDetailsModal';
import styles from './Layout.module.css';

const Layout = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.mainContent}>
        <div className={styles.container}>{children}</div>
      </main>
      <JobDetailsModal />
    </div>
  );
};

export default Layout;
