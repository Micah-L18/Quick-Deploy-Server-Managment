import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { serversService } from '../api/servers';
import { appsService } from '../api/apps';
import { activitiesService } from '../api/activities';
import { formatDate } from '../utils/formatters';
import { ServersIcon, AppsIcon, PlusIcon, CheckIcon, XIcon, AlertIcon } from '../components/Icons';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  const { data: servers, isLoading: serversLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: serversService.getServers,
    refetchInterval: 60000,
  });

  const { data: apps, isLoading: appsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: appsService.getApps,
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesService.getActivities(10),
    refetchInterval: 30000,
  });

  const totalServers = servers?.length || 0;
  const onlineServers =
    servers?.filter((s) => s.status === 'online').length || 0;
  const offlineServers = totalServers - onlineServers;
  const totalApps = apps?.length || 0;

  const quickActions = [
    {
      icon: ServersIcon,
      title: 'Add Server',
      description: 'Connect a new server',
      to: '/servers',
    },
    {
      icon: AppsIcon,
      title: 'Create App',
      description: 'Launch a new application',
      to: '/apps',
    },
  ];

  return (
    <Layout>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageSubtitle}>
          Welcome back! Here's what's happening with your servers
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Servers</span>
            <span className={styles.statIcon}>
              <ServersIcon size={32} />
            </span>
          </div>
          <div className={styles.statValue}>{totalServers}</div>
          <div className={styles.statChange}>
            Manage your infrastructure
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Online</span>
            <span className={styles.statIcon}>
              <CheckIcon size={32} />
            </span>
          </div>
          <div className={styles.statValue}>{onlineServers}</div>
          <div className={`${styles.statChange} ${styles.positive}`}>
            {totalServers > 0
              ? `${Math.round((onlineServers / totalServers) * 100)}% uptime`
              : 'No servers yet'}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Offline</span>
            <span className={styles.statIcon}>
              <XIcon size={32} />
            </span>
          </div>
          <div className={styles.statValue}>{offlineServers}</div>
          <div className={styles.statChange}>
            {offlineServers > 0 ? 'Needs attention' : 'All systems operational'}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Apps</span>
            <span className={styles.statIcon}>
              <AppsIcon size={32} />
            </span>
          </div>
          <div className={styles.statValue}>{totalApps}</div>
          <div className={styles.statChange}>
            Active applications
          </div>
        </div>
      </div>

      <h2 className={styles.pageTitle}>Quick Actions</h2>
      <div className={styles.actionsGrid}>
        {quickActions.map((action) => {
          const IconComponent = action.icon;
          return (
            <Link
              key={action.title}
              to={action.to}
              className={styles.actionCard}
            >
              <span className={styles.actionIcon}>
                <IconComponent size={48} />
              </span>
              <div className={styles.actionTitle}>{action.title}</div>
              <div className={styles.actionDescription}>
                {action.description}
              </div>
            </Link>
          );
        })}
      </div>

      <div className={styles.activitySection}>
        <Card title="Recent Activity">
          {activitiesLoading ? (
            <div className={styles.loading}>Loading activities...</div>
          ) : activities && activities.length > 0 ? (
            <div className={styles.activityList}>
              {activities.map((activity) => (
                <div key={activity.id} className={styles.activityItem}>
                  <div
                    className={`${styles.activityIcon} ${styles[activity.type]}`}
                  >
                    {activity.type === 'success' ? (
                      <CheckIcon size={20} />
                    ) : (
                      <AlertIcon size={20} />
                    )}
                  </div>
                  <div className={styles.activityDetails}>
                    <div className={styles.activityMessage}>
                      {activity.message}
                    </div>
                    <div className={styles.activityTime}>
                      {formatDate(activity.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.loading}>No recent activities</div>
          )}
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
