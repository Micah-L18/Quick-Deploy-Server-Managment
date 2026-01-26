import React, { useState } from 'react';
import Layout from '../components/Layout';
import { 
  DashboardIcon, 
  ServersIcon, 
  AppsIcon, 
  HardDriveIcon, 
  SettingsIcon,
  BookOpenIcon,
  PlayIcon,
  StopCircleIcon,
  RefreshIcon,
  PlusIcon,
  TrashIcon,
  CodeIcon,
  FolderIcon,
  ActivityIcon,
  DatabaseIcon,
  GlobeIcon,
  DockerIcon,
  AlertIcon,
  RocketIcon,
  ClipboardIcon,
  KeyIcon,
  ClockIcon,
  SearchIcon,
  ToolIcon,
  DownloadIcon,
  EditIcon,
  GamepadIcon,
  FilmIcon,
  GitBranchIcon,
  ContainerIcon,
  UserIcon,
  PaletteIcon,
  LogOutIcon,
  LightbulbIcon,
  ImageIcon,
  MoreVerticalIcon,
  DocumentTextIcon
} from '../components/Icons';
import styles from './Docs.module.css';

const Docs = () => {
  const [activeSection, setActiveSection] = useState('getting-started');

  const sections = [
    { id: 'getting-started', title: 'Getting Started', icon: <BookOpenIcon size={18} /> },
    { id: 'dashboard', title: 'Dashboard', icon: <DashboardIcon size={18} /> },
    { id: 'servers', title: 'Servers', icon: <ServersIcon size={18} /> },
    { id: 'server-detail', title: 'Server Details', icon: <CodeIcon size={18} /> },
    { id: 'apps', title: 'Apps & Deployments', icon: <AppsIcon size={18} /> },
    { id: 'app-detail', title: 'App Configuration', icon: <DockerIcon size={18} /> },
    { id: 'storage', title: 'Storage', icon: <HardDriveIcon size={18} /> },
    { id: 'settings', title: 'Settings', icon: <SettingsIcon size={18} /> },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'getting-started': return <GettingStartedSection />;
      case 'dashboard': return <DashboardSection />;
      case 'servers': return <ServersSection />;
      case 'server-detail': return <ServerDetailSection />;
      case 'apps': return <AppsSection />;
      case 'app-detail': return <AppDetailSection />;
      case 'storage': return <StorageSection />;
      case 'settings': return <SettingsSection />;
      default: return <GettingStartedSection />;
    }
  };

  return (
    <Layout>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>
            <BookOpenIcon size={24} /> Documentation
          </h1>
        </div>
        <div className={styles.tabContainer}>
          {sections.map((section) => (
            <button
              key={section.id}
              className={`${styles.tab} ${activeSection === section.id ? styles.tabActive : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {section.icon}
              <span>{section.title}</span>
            </button>
          ))}
        </div>
        <div className={styles.content}>
          {renderContent()}
        </div>
      </div>
    </Layout>
  );
};

const GettingStartedSection = () => (
  <div className={styles.section}>
    <h1>Getting Started with NoBase</h1>
    <p className={styles.intro}>
      NoBase is a modern web-based server management platform that allows you to manage multiple servers, 
      deploy Docker containers, monitor system metrics, and perform file operations—all from a unified dashboard.
    </p>

    <div className={styles.card}>
      <h2><RocketIcon size={20} /> Quick Start Guide</h2>
      <ol className={styles.steps}>
        <li>
          <strong>Create an Account</strong>
          <p>The first user to register becomes the admin. Go to the login page and click "Register" to create your account.</p>
        </li>
        <li>
          <strong>Add Your First Server</strong>
          <p>Navigate to the Servers page and click "Add Server". Enter your server details and copy the SSH setup command.</p>
        </li>
        <li>
          <strong>Run the Setup Command</strong>
          <p>SSH into your server as root and paste the setup command. This installs the SSH key for secure, passwordless access.</p>
        </li>
        <li>
          <strong>Start Managing</strong>
          <p>Once connected, you can monitor metrics, use the terminal, manage files, install services, and deploy Docker apps!</p>
        </li>
      </ol>
    </div>

    <div className={styles.card}>
      <h2><ClipboardIcon size={20} /> Requirements</h2>
      <ul className={styles.list}>
        <li><strong>Target Servers:</strong> Linux-based servers (Ubuntu, Debian, CentOS, RHEL)</li>
        <li><strong>SSH Access:</strong> Root or sudo access to install the SSH key</li>
        <li><strong>Docker:</strong> Required for app deployments (can be installed via Services tab)</li>
        <li><strong>Browser:</strong> Modern browser with JavaScript enabled</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><KeyIcon size={20} /> Key Features</h2>
      <div className={styles.featureGrid}>
        <div className={styles.feature}>
          <ServersIcon size={24} />
          <h3>Multi-Server Management</h3>
          <p>Connect and manage unlimited servers from one dashboard</p>
        </div>
        <div className={styles.feature}>
          <ActivityIcon size={24} />
          <h3>Real-time Metrics</h3>
          <p>Monitor CPU, memory, disk, network, and GPU usage with historical charts</p>
        </div>
        <div className={styles.feature}>
          <DockerIcon size={24} />
          <h3>Docker Deployments</h3>
          <p>Deploy containerized apps with templates or custom configurations</p>
        </div>
        <div className={styles.feature}>
          <FolderIcon size={24} />
          <h3>File Management</h3>
          <p>Browse, edit, upload, and download files via SFTP</p>
        </div>
      </div>
    </div>
  </div>
);

const DashboardSection = () => (
  <div className={styles.section}>
    <h1><DashboardIcon size={28} /> Dashboard</h1>
    <p className={styles.intro}>
      The Dashboard provides an at-a-glance overview of your infrastructure health and recent activity.
    </p>

    <div className={styles.card}>
      <h2><ActivityIcon size={20} /> Statistics Cards</h2>
      <p>The top of the dashboard displays key metrics:</p>
      <ul className={styles.list}>
        <li><strong>Total Servers:</strong> The number of servers you've added to NoBase</li>
        <li><strong>Online Servers:</strong> Servers that are currently reachable with uptime percentage</li>
        <li><strong>Offline Servers:</strong> Servers that failed the last connection check</li>
        <li><strong>Total Apps:</strong> The number of app configurations you've created</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><PlayIcon size={20} /> Quick Actions</h2>
      <p>Shortcuts to common tasks:</p>
      <ul className={styles.list}>
        <li><strong>Add Server:</strong> Opens the add server dialog</li>
        <li><strong>Create App:</strong> Navigate to the apps page to create a new app configuration</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><ClockIcon size={20} /> Recent Activity</h2>
      <p>Shows the last 10 activities across all your servers and apps:</p>
      <ul className={styles.list}>
        <li><span className={styles.successBadge}>Success</span> Successful operations (deployments, connections, etc.)</li>
        <li><span className={styles.errorBadge}>Error</span> Failed operations that may need attention</li>
        <li><span className={styles.infoBadge}>Info</span> Informational events and status updates</li>
      </ul>
      <p className={styles.tip}><LightbulbIcon size={14} /> Activity auto-refreshes every 30 seconds</p>
    </div>
  </div>
);

const ServersSection = () => (
  <div className={styles.section}>
    <h1><ServersIcon size={28} /> Servers</h1>
    <p className={styles.intro}>
      The Servers page lets you manage all your connected servers, check their status, and organize them with tags and colors.
    </p>

    <div className={styles.card}>
      <h2><PlusIcon size={20} /> Adding a Server</h2>
      <ol className={styles.steps}>
        <li>Click the <strong>"Add Server"</strong> button</li>
        <li>Enter the server details:
          <ul>
            <li><strong>Server Name:</strong> A friendly name for identification</li>
            <li><strong>IP Address:</strong> The public IP or hostname of your server</li>
            <li><strong>Region:</strong> Select the geographic region for the flag icon</li>
            <li><strong>OS Type:</strong> Ubuntu/Debian, RHEL/CentOS, or Windows</li>
          </ul>
        </li>
        <li>Copy the generated <strong>SSH setup command</strong></li>
        <li>SSH into your server as root and paste the command</li>
        <li>Return to NoBase and the server should show as "Online"</li>
      </ol>
      <div className={styles.warning}>
        <AlertIcon size={16} />
        <span>The setup command must be run as root to install the SSH key properly</span>
      </div>
    </div>

    <div className={styles.card}>
      <h2><SettingsIcon size={20} /> Server Card Features</h2>
      <ul className={styles.list}>
        <li><strong>Status Indicator:</strong> Green (online), Red (offline), or Yellow (checking)</li>
        <li><strong>Region Flag:</strong> Visual indicator of server location</li>
        <li><strong>IP Address:</strong> Click the eye icon to show/hide the IP</li>
        <li><strong>Quick Metrics:</strong> CPU, Memory, and Disk usage bars (when online)</li>
        <li><strong>Tags:</strong> Organize servers with custom labels</li>
        <li><strong>Settings:</strong> Change name, icon, color, and tags</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><SearchIcon size={20} /> Filtering & Search</h2>
      <ul className={styles.list}>
        <li><strong>Search:</strong> Filter servers by name</li>
        <li><strong>Status Filter:</strong> Show all, online only, or offline only</li>
        <li><strong>Tag Filter:</strong> Filter by assigned tags</li>
        <li><strong>Color Filter:</strong> Filter by accent color</li>
      </ul>
    </div>
  </div>
);

const ServerDetailSection = () => (
  <div className={styles.section}>
    <h1><CodeIcon size={28} /> Server Details</h1>
    <p className={styles.intro}>
      Click on any server to access detailed management with multiple tabs for different functions.
    </p>

    <div className={styles.card}>
      <h2><ActivityIcon size={20} /> System Metrics Tab</h2>
      <p>Real-time and historical system resource monitoring:</p>
      <ul className={styles.list}>
        <li><strong>CPU:</strong> Usage percentage, core count, model, and temperature</li>
        <li><strong>Memory:</strong> Used/free/total with visual progress bar</li>
        <li><strong>Disk:</strong> Storage usage with available space</li>
        <li><strong>GPU:</strong> NVIDIA GPU stats (if detected) - utilization, VRAM, temperature</li>
        <li><strong>Network:</strong> Bandwidth usage (upload/download speeds in Mbps)</li>
        <li><strong>Ping:</strong> Server latency measurement with historical tracking</li>
      </ul>
      <p>Click any metric card to view its historical chart. Use the time range selector (1hr, 6hr, 24hr, 1 week) to adjust the view.</p>
    </div>

    <div className={styles.card}>
      <h2><CodeIcon size={20} /> Terminal Tab</h2>
      <p>Full SSH terminal access directly in your browser:</p>
      <ul className={styles.list}>
        <li>Execute any command as if you were SSH'd into the server</li>
        <li>Fullscreen mode for more space</li>
        <li>Automatic resize to fit your window</li>
        <li>Real-time input/output via WebSocket</li>
      </ul>
      <p className={styles.tip}><LightbulbIcon size={14} /> Terminal is only available on desktop browsers</p>
    </div>

    <div className={styles.card}>
      <h2><FolderIcon size={20} /> Files Tab</h2>
      <p>SFTP-based file browser for remote file management:</p>
      <ul className={styles.list}>
        <li><strong>Navigate:</strong> Click folders to browse, use breadcrumbs to go back</li>
        <li><strong>View/Edit:</strong> Click files to open in the built-in editor</li>
        <li><strong>Upload:</strong> Drag & drop files or use the upload button</li>
        <li><strong>Download:</strong> Download any file to your computer</li>
        <li><strong>Create:</strong> Make new files or folders</li>
        <li><strong>Delete:</strong> Remove files and folders</li>
        <li><strong>Search:</strong> Find files in the current directory or system-wide</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><ToolIcon size={20} /> Services Tab</h2>
      <p>Install and manage common services:</p>
      <div className={styles.servicesList}>
        <div className={styles.serviceItem}>
          <DockerIcon size={20} />
          <span><strong>Docker:</strong> Container runtime (required for apps)</span>
        </div>
        <div className={styles.serviceItem}>
          <GlobeIcon size={20} />
          <span><strong>Nginx:</strong> Web server and reverse proxy</span>
        </div>
        <div className={styles.serviceItem}>
          <ContainerIcon size={20} />
          <span><strong>Node.js:</strong> JavaScript runtime (v16, v18, v20, v22)</span>
        </div>
        <div className={styles.serviceItem}>
          <ContainerIcon size={20} />
          <span><strong>npm:</strong> Node package manager</span>
        </div>
        <div className={styles.serviceItem}>
          <GitBranchIcon size={20} />
          <span><strong>Git:</strong> Version control system</span>
        </div>
      </div>
      <p>For each service you can: Check status, Install, Start, Stop, and Restart.</p>
    </div>

    <div className={styles.card}>
      <h2><AppsIcon size={20} /> Apps Tab</h2>
      <p>View and manage Docker containers deployed on this server:</p>
      <ul className={styles.list}>
        <li>See all running and stopped containers</li>
        <li>Start/Stop containers with one click</li>
        <li>View container stats (CPU, memory usage)</li>
        <li>View container logs</li>
        <li>Edit deployment configuration (nickname, icon, ports, environment variables)</li>
        <li>Create and restore snapshots for backup</li>
        <li>Migrate or copy deployments to other servers</li>
        <li>Remove deployments</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><SettingsIcon size={20} /> Settings Tab</h2>
      <p>Customize server appearance and manage connection:</p>
      <ul className={styles.list}>
        <li><strong>Display Name:</strong> Override the server name shown in the UI</li>
        <li><strong>Region:</strong> Change the region flag</li>
        <li><strong>Accent Color:</strong> Customize the server card color</li>
        <li><strong>Icon:</strong> Choose a built-in icon or upload a custom one</li>
        <li><strong>Tags:</strong> Add up to 10 tags for organization</li>
        <li><strong>SSH Command:</strong> View the setup command again</li>
        <li><strong>Delete Server:</strong> Remove the server (requires typing name and IP)</li>
      </ul>
    </div>
  </div>
);

const AppsSection = () => (
  <div className={styles.section}>
    <h1><AppsIcon size={28} /> Apps & Deployments</h1>
    <p className={styles.intro}>
      The Apps page is your central hub for Docker container management. Create app configurations, deploy them to servers, and monitor running containers.
    </p>

    <div className={styles.card}>
      <h2><ContainerIcon size={20} /> Deployed Apps Tab</h2>
      <p>View all active deployments across all your servers:</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Column</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>App</td>
            <td>App name (or custom nickname), icon, and Docker image</td>
          </tr>
          <tr>
            <td>Container</td>
            <td>Container name and ID</td>
          </tr>
          <tr>
            <td>Server</td>
            <td>Which server it's deployed on</td>
          </tr>
          <tr>
            <td>Status</td>
            <td>Running, Stopped, or in-progress states</td>
          </tr>
          <tr>
            <td>Ports</td>
            <td>Port mappings and Web UI link</td>
          </tr>
          <tr>
            <td>Actions</td>
            <td>Start, Stop, Stats, Logs, Config, Remove</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className={styles.card}>
      <h2><SettingsIcon size={20} /> Deployment Actions</h2>
      <div className={styles.actionsList}>
        <div className={styles.actionItem}>
          <PlayIcon size={16} />
          <div>
            <strong>Start</strong>
            <p>Start a stopped container</p>
          </div>
        </div>
        <div className={styles.actionItem}>
          <StopCircleIcon size={16} />
          <div>
            <strong>Stop</strong>
            <p>Stop a running container</p>
          </div>
        </div>
        <div className={styles.actionItem}>
          <MoreVerticalIcon size={16} />
          <div>
            <strong>Stats</strong>
            <p>View CPU and memory usage (running containers only)</p>
          </div>
        </div>
        <div className={styles.actionItem}>
          <DocumentTextIcon size={16} />
          <div>
            <strong>Logs</strong>
            <p>View container logs (running containers only)</p>
          </div>
        </div>
        <div className={styles.actionItem}>
          <SettingsIcon size={16} />
          <div>
            <strong>Config</strong>
            <p>Edit deployment settings (nickname, icon, ports, env vars, etc.)</p>
          </div>
        </div>
        <div className={styles.actionItem}>
          <TrashIcon size={16} />
          <div>
            <strong>Remove</strong>
            <p>Stop and remove the container</p>
          </div>
        </div>
      </div>
    </div>

    <div className={styles.card}>
      <h2><BookOpenIcon size={20} /> Templates Tab</h2>
      <p>Pre-configured app templates for quick deployment:</p>
      <div className={styles.categoryGrid}>
        <div className={styles.category}>
          <DatabaseIcon size={20} />
          <span>Databases</span>
          <small>PostgreSQL, MySQL, MongoDB, Redis, MariaDB</small>
        </div>
        <div className={styles.category}>
          <GlobeIcon size={20} />
          <span>Web Servers</span>
          <small>Traefik, Caddy, Apache</small>
        </div>
        <div className={styles.category}>
          <GamepadIcon size={20} />
          <span>Game Servers</span>
          <small>Minecraft, Valheim, and more</small>
        </div>
        <div className={styles.category}>
          <ToolIcon size={20} />
          <span>Development</span>
          <small>GitLab, Portainer, code-server</small>
        </div>
        <div className={styles.category}>
          <ActivityIcon size={20} />
          <span>Monitoring</span>
          <small>Prometheus, Grafana, Uptime Kuma</small>
        </div>
        <div className={styles.category}>
          <FilmIcon size={20} />
          <span>Media</span>
          <small>Plex, Jellyfin, PhotoPrism</small>
        </div>
      </div>
      <p>Click "Use Template" to create an app with pre-filled configuration, then customize and deploy!</p>
    </div>

    <div className={styles.card}>
      <h2><DownloadIcon size={20} /> Snapshots & Migrations</h2>
      <p>Advanced deployment management features:</p>
      <ul className={styles.list}>
        <li><strong>Create Snapshot:</strong> Backup container volumes for restoration later</li>
        <li><strong>Restore Snapshot:</strong> Restore a previous backup</li>
        <li><strong>Download Snapshot:</strong> Download backup as a tar archive</li>
        <li><strong>Migrate/Copy:</strong> Move or copy a deployment to another server</li>
      </ul>
    </div>
  </div>
);

const AppDetailSection = () => (
  <div className={styles.section}>
    <h1><DockerIcon size={28} /> App Configuration</h1>
    <p className={styles.intro}>
      Each app has a detailed configuration page where you set up Docker settings before deployment.
    </p>

    <div className={styles.card}>
      <h2><SettingsIcon size={20} /> Config Tab</h2>
      <p>Configure all aspects of your Docker container:</p>
      
      <h3>Quick Import</h3>
      <ul className={styles.list}>
        <li><strong>Docker Run:</strong> Paste a <code>docker run</code> command to auto-fill settings</li>
        <li><strong>Docker Compose:</strong> Paste YAML to import configuration</li>
      </ul>

      <h3>Basic Information</h3>
      <ul className={styles.list}>
        <li><strong>App Name:</strong> Display name for the app template</li>
        <li><strong>Description:</strong> Optional description</li>
        <li><strong>Icon:</strong> Choose built-in or upload custom</li>
      </ul>
      <p className={styles.tip}><LightbulbIcon size={14} /> When deploying, you can set a unique nickname and icon for each deployment instance</p>

      <h3>Docker Image</h3>
      <ul className={styles.list}>
        <li><strong>Image:</strong> Docker image name (e.g., nginx, postgres)</li>
        <li><strong>Tag:</strong> Image version tag (default: latest)</li>
        <li><strong>Custom Registry:</strong> Use a private Docker registry</li>
      </ul>

      <h3>Port Mappings</h3>
      <p>Map container ports to host ports. Format: <code>HOST:CONTAINER</code></p>

      <h3>Environment Variables</h3>
      <p>Set environment variables as key-value pairs</p>

      <h3>Volumes</h3>
      <p>Mount host directories into the container</p>

      <h3>Advanced Options</h3>
      <ul className={styles.list}>
        <li><strong>Restart Policy:</strong> no, always, unless-stopped, on-failure</li>
        <li><strong>Network Mode:</strong> bridge, host, none, or custom</li>
        <li><strong>Custom Command:</strong> Override the container command</li>
        <li><strong>Docker Args:</strong> Additional docker run arguments</li>
        <li><strong>Web UI Port:</strong> Port for the quick-access link</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><EditIcon size={20} /> YAML Tab</h2>
      <p>Edit configuration as docker-compose style YAML:</p>
      <ul className={styles.list}>
        <li>View the current config as YAML</li>
        <li>Edit YAML directly</li>
        <li>Apply changes back to the Config tab</li>
        <li>Bi-directional sync between tabs</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><RocketIcon size={20} /> Deploying an App</h2>
      <ol className={styles.steps}>
        <li>Configure the app settings (or use a template)</li>
        <li>Click the <strong>"Deploy"</strong> button</li>
        <li>Select a target server (must be online with Docker installed)</li>
        <li>Review and customize port mappings - the modal shows host (external) and container (internal) ports clearly labeled</li>
        <li>Set a custom <strong>nickname</strong> for this deployment (optional) - useful for distinguishing multiple instances</li>
        <li>Choose a custom <strong>icon</strong> for the deployment - select from presets or upload your own</li>
        <li>Watch the real-time deployment progress in the terminal panel</li>
        <li>Once complete, the container will start automatically</li>
      </ol>
      <p className={styles.tip}><LightbulbIcon size={14} /> The deploy modal shows port conflicts in real-time - if a port is already in use, you'll be warned before deploying</p>
      <div className={styles.warning}>
        <AlertIcon size={16} />
        <span>Make sure Docker is installed on the target server before deploying</span>
      </div>
    </div>
  </div>
);

const StorageSection = () => (
  <div className={styles.section}>
    <h1><HardDriveIcon size={28} /> Storage</h1>
    <p className={styles.intro}>
      Monitor and manage storage usage for icons, snapshots, and other data.
    </p>

    <div className={styles.card}>
      <h2><ActivityIcon size={20} /> Overview Tab</h2>
      <p>Visual breakdown of storage usage:</p>
      <ul className={styles.list}>
        <li><strong>Disk Usage Bar:</strong> Overall storage percentage with color coding</li>
        <li><strong>Icons Storage:</strong> Space used by uploaded custom icons</li>
        <li><strong>Snapshots Storage:</strong> Space used by container volume backups</li>
        <li><strong>Other Storage:</strong> Database, configs, and other files</li>
      </ul>
      <div className={styles.warning}>
        <AlertIcon size={16} />
        <span>A warning appears when storage usage exceeds 80%</span>
      </div>
    </div>

    <div className={styles.card}>
      <h2><ImageIcon size={20} /> Icons Tab</h2>
      <p>Manage custom icons for servers and apps:</p>
      <ul className={styles.list}>
        <li><strong>Upload:</strong> Drag & drop or click to upload new icons</li>
        <li><strong>Preview:</strong> See all uploaded icons in a gallery</li>
        <li><strong>Rename:</strong> Change icon filenames</li>
        <li><strong>Delete:</strong> Remove unused icons to free space</li>
      </ul>
    </div>
  </div>
);

const SettingsSection = () => (
  <div className={styles.section}>
    <h1><SettingsIcon size={28} /> Settings</h1>
    <p className={styles.intro}>
      Configure your account, preferences, and manage system updates.
    </p>

    <div className={styles.card}>
      <h2><RefreshIcon size={20} /> System Updates</h2>
      <p>Keep NoBase up to date:</p>
      <ul className={styles.list}>
        <li><strong>Current Version:</strong> See your installed version and commit</li>
        <li><strong>Check for Updates:</strong> Query for available updates</li>
        <li><strong>View Changelog:</strong> See what's new in pending updates</li>
        <li><strong>Update Now:</strong> Apply updates with one click</li>
      </ul>
      <p className={styles.tip}><LightbulbIcon size={14} /> For auto-restart after updates, run NoBase with PM2</p>
    </div>

    <div className={styles.card}>
      <h2><UserIcon size={20} /> Account</h2>
      <ul className={styles.list}>
        <li><strong>Name:</strong> Your display name</li>
        <li><strong>Email:</strong> Your login email</li>
        <li><strong>Member Since:</strong> Account creation date</li>
        <li><strong>Password:</strong> Change password (coming soon)</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><PaletteIcon size={20} /> Preferences</h2>
      <ul className={styles.list}>
        <li><strong>Dark Mode:</strong> Toggle between light and dark themes</li>
        <li><strong>Auto-refresh:</strong> Enable/disable automatic server status polling</li>
        <li><strong>Notifications:</strong> Configure notification preferences</li>
      </ul>
    </div>

    <div className={styles.card}>
      <h2><LogOutIcon size={20} /> Account Actions</h2>
      <ul className={styles.list}>
        <li><strong>Logout:</strong> Sign out of your account</li>
        <li><strong>Delete Account:</strong> Permanently delete your account (coming soon)</li>
      </ul>
    </div>
  </div>
);

export default Docs;
