# Multi-Server SSH Manager

A modern web-based application for managing SSH connections to multiple servers with real-time metrics, terminal access, and file browsing.

## Features

- **Server Management**: Add, monitor, and manage multiple SSH servers
- **Real-time Metrics**: CPU, Memory, and Disk usage with historical data visualization
- **Integrated Terminal**: Full SSH terminal access directly in the browser
- **File Browser**: Navigate and view server files through the web interface
- **Auto-monitoring**: Background metrics collection every 30 seconds
- **Secure Authentication**: User authentication with session management
- **Modern UI**: React-based interface with responsive design

## Project Structure

```
neo-multi/
├── backend/          # Express API server
│   ├── server.js     # Main server file
│   ├── servers.db    # SQLite database
│   └── ssh_keys/     # Generated SSH keys
├── client/           # React frontend
│   └── src/          # React components and pages
└── package.json      # Root package with dev scripts
```

## Installation

1. Install all dependencies:
```bash
npm run install:all
```

Or install individually:
```bash
npm install           # Root dependencies
cd backend && npm install
cd ../client && npm install
```

## Usage

### Development Mode

Run both frontend and backend with hot-reload:
```bash
npm run dev
```

This starts:
- Backend API server on http://localhost:3044
- React dev server on http://localhost:3000

### Production Mode

```bash
npm start
```

### Individual Services

```bash
npm run dev:backend   # Backend only (port 3044)
npm run dev:client    # Frontend only (port 3000)
```

## Production Deployment with PM2

For production deployments with automatic restarts and self-updates, use PM2:

### Setup

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Build the frontend:
```bash
npm run build
```

3. Start with PM2:
```bash
npm run pm2:start
# or directly: pm2 start ecosystem.config.js
```

4. Enable auto-start on system boot:
```bash
pm2 startup
pm2 save
```

### PM2 Commands

```bash
npm run pm2:start     # Start services
npm run pm2:stop      # Stop services
npm run pm2:restart   # Restart services
npm run pm2:logs      # View logs
pm2 status            # Check status
pm2 monit             # Real-time monitoring
```

### Self-Update Feature

The Settings page includes a built-in update system that:
1. Checks GitHub for newer commits
2. Pulls the latest code via `git pull`
3. Installs updated dependencies
4. Rebuilds the frontend
5. Restarts the server (requires PM2)

Navigate to **Settings → System Update** to:
- View current version and git commit
- Check for available updates
- View changelog of incoming changes
- Trigger one-click updates
- Restart the server after updates

> **Note**: Self-updates require the server to be running under PM2 for automatic restart capability.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/check` - Check authentication status

### Servers
- `GET /api/servers` - Get all servers
- `POST /api/servers` - Add a new server
- `GET /api/servers/:id` - Get server details
- `DELETE /api/servers/:id` - Delete a server
- `GET /api/servers/:id/status` - Check connection status
- `GET /api/servers/status/all` - Check all servers status

### System (Self-Update)
- `GET /api/system/version` - Get current version and check for updates
- `GET /api/system/status` - Get system status (uptime, memory, PM2 status)
- `GET /api/system/changelog` - Get list of commits available in update
- `POST /api/system/update` - Trigger system update (git pull + npm install + build)
- `POST /api/system/restart` - Restart the server (requires PM2)

### Metrics
- `GET /api/servers/:id/metrics` - Get current server metrics
- `GET /api/servers/:id/metrics/history?hours=24` - Get historical metrics

### Files
- `GET /api/servers/:id/files?path=/` - List files and directories

### Terminal
- WebSocket connection on `/` - Real-time SSH terminal sessions

## Technologies

### Backend
- Node.js + Express
- Socket.IO for WebSocket communication
- SQLite for data persistence
- SSH2 for server connections
- bcryptjs for authentication

### Frontend
- React 19
- React Router v7
- TanStack Query (React Query)
- Recharts for data visualization
- xterm.js for terminal emulation
- Vanilla JavaScript (Frontend)
- ssh2 library (SSH connections)
- JSON file storage

## Port

The server runs on port **3044**
