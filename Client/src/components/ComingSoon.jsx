import React from 'react';
import Layout from '../components/Layout';
import styles from './ComingSoon.module.css';

const ComingSoon = ({ title, icon }) => {
  return (
    <Layout>
      <div className={styles.container}>
        <span className={styles.icon}>{icon}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>This feature is coming soon!</p>
      </div>
    </Layout>
  );
};

export default ComingSoon;
