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
