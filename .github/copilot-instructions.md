# Multi-Server SSH Manager - AI Coding Guide

## Architecture Overview

Full-stack monorepo with **separate frontend and backend** communicating via REST API + WebSocket:

- **Backend** (`Backend/`): Express server on port 3044 - SSH connections, SQLite database, metrics, snapshots, migrations
- **Frontend** (`Client/`): React SPA on port 3000 - React Router, TanStack Query, CSS Modules
- **Root**: Orchestration with `concurrently` to run both services

**Critical**: Backend is a pure API server (no `express.static` for frontend). React dev server proxies `/api` to localhost:3044.

## Development Commands

```bash
npm run install:all      # First time setup
npm run dev              # Both frontend + backend with hot-reload
npm run dev:backend      # Backend only (nodemon on :3044)
npm run dev:client       # Frontend only (react-scripts on :3000)
```

**Common mistake**: `npm start` runs production mode. Use `npm run dev` for development.

## Backend Structure (`Backend/`)

```
Backend/
├── server.js              # Entry point - mounts routes, Socket.IO, startup
├── config/index.js        # All configuration (PORT, DB, SSH, CORS, etc.)
├── database/
│   ├── connection.js      # Promise-based SQLite wrapper (run, get, all)
│   └── init.js            # Schema creation and migrations
├── models/                # Database operations (index.js re-exports all)
│   ├── ServerModel.js     # Server CRUD + toCamelCase conversion
│   ├── AppModel.js        # Apps and deployments
│   ├── SnapshotModel.js   # Backup snapshots
│   └── ...
├── middleware/
│   ├── auth.js            # requireAuth, optionalAuth, attachUser
│   ├── ownership.js       # checkServerOwnership, checkAppOwnership
│   └── errorHandler.js    # asyncHandler wrapper, errorHandler, notFoundHandler
├── routes/                # API route handlers (index.js re-exports all)
│   ├── servers.js         # /api/servers/*
│   ├── files.js           # /api/servers/:id/files/*
│   ├── metrics.js         # /api/servers/:id/metrics/*
│   ├── snapshots.js       # /api/snapshots/*, /api/deployments/:id/snapshots/*
│   ├── migrations.js      # /api/migrations/* (server-to-server)
│   └── ...
├── services/
│   ├── ssh/               # connectionPool, connectionManager, keyManager, sftpService
│   ├── metrics/           # collector, parser, scheduler (30s interval)
│   ├── snapshots/         # snapshotService for backups
│   └── migration/         # migrationService for cross-server transfers
└── websocket/terminal.js  # Socket.IO terminal + service installation handlers
```

### Key Backend Patterns

**Route handlers**: Always use `asyncHandler()` + `requireAuth` middleware:
```javascript
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const servers = await ServerModel.findAll(req.session.userId);
  res.json(servers);
}));
```

**Database queries**: Use Promise wrappers from `database/connection.js`:
```javascript
const { run, get, all } = require('../database/connection');
const row = await get('SELECT * FROM servers WHERE id = ?', [serverId]);
```

**SSH operations**: Get pooled connection, execute commands:
```javascript
const { connectionManager } = require('../services/ssh');
const result = await connectionManager.executeCommand(serverConfig, 'ls -la');
```

**Socket.IO for real-time**: Access via `req.app.get('io')`:
```javascript
const io = req.app.get('io');
io.emit('migration-progress', { step: 'transferring', progress: 50 });
```

## Frontend Structure (`Client/src/`)

```
Client/src/
├── App.jsx                # Routes, QueryClient, context providers
├── api/                   # Service modules (axiosConfig.js + feature services)
├── contexts/              # AuthContext, ThemeContext, SnapshotProgressContext, BackgroundJobsContext
├── pages/                 # Full pages (each has .jsx + .module.css)
├── components/            # Reusable components (Layout, Modal, FileBrowser, Terminal, etc.)
└── styles/global.css      # CSS variables (--primary, --background, etc.)
```

### Key Frontend Patterns

**API service pattern** (`api/servers.js`):
```javascript
export const serversService = {
  getServers: async () => (await api.get('/servers')).data,
  addServer: async (data) => (await api.post('/servers', data)).data,
};
```

**Protected routes**: Wrap pages in `<Layout>`:
```jsx
const MyPage = () => (
  <Layout>
    <div className={styles.container}>...</div>
  </Layout>
);
```

**Data fetching**: Use TanStack Query:
```javascript
const { data: servers } = useQuery({ queryKey: ['servers'], queryFn: serversService.getServers });
```

**Styling**: CSS Modules only - every component has matching `.module.css`:
```jsx
import styles from './Component.module.css';
<div className={styles.container}>
```

## Adding New Features

### New Backend Route
1. Create `Backend/routes/newFeature.js` with Express router
2. Export from `Backend/routes/index.js`
3. Mount in `Backend/server.js`: `app.use('/api/newFeature', newFeatureRoutes)`
4. Add corresponding API service in `Client/src/api/newFeature.js`

### New Frontend Page
1. Create `Client/src/pages/NewPage.jsx` + `NewPage.module.css`
2. Wrap content in `<Layout>` component
3. Add route in `App.jsx`: `<Route path="/newpage" element={<NewPage />} />`
4. Add nav link in `Sidebar.jsx` with icon from `Icons.jsx`

### Database Schema Changes
1. Add CREATE TABLE in `Backend/database/init.js` → `initDatabase()`
2. Add migrations in `runMigrations()` for existing databases
3. Create/update model in `Backend/models/`
4. Export from `Backend/models/index.js`

## Project-Specific Notes

- **SSH keys**: Stored in `Backend/ssh_keys/` as `server_<timestamp>` and `.pub` (no passphrase)
- **Connection pooling**: 5-min idle timeout, max 8 channels per connection before reconnect
- **Session**: Secret randomly generated on start (sessions lost on restart in dev)
- **Environment**: Uses `url.env` in root for `FRONTEND_URL`, `BACKEND_URL` configuration
- **Uploads**: Stored in `Backend/uploads/`, served statically at `/uploads`
- **Health check**: `GET /api/health` returns server status + SSH pool stats

## Key Files Reference

- [Backend/config/index.js](Backend/config/index.js) - All configuration constants
- [Backend/middleware/errorHandler.js](Backend/middleware/errorHandler.js) - asyncHandler pattern
- [Backend/services/ssh/connectionPool.js](Backend/services/ssh/connectionPool.js) - SSH connection reuse
- [Client/src/api/axiosConfig.js](Client/src/api/axiosConfig.js) - Axios instance with 401 redirect
- [Client/src/components/Layout.jsx](Client/src/components/Layout.jsx) - Auth guard + layout wrapper
- [Client/src/contexts/AuthContext.jsx](Client/src/contexts/AuthContext.jsx) - Auth state management
