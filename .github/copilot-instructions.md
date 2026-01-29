# Multi-Server SSH Manager - AI Coding Guide

## Architecture Overview

Full-stack monorepo with **separate frontend and backend** communicating via REST API + WebSocket:

- **Backend** (`Backend/`): Express server on port 3044 - manages SSH connections to remote servers, SQLite database, real-time metrics collection, Docker container deployments, snapshots, server-to-server migrations
- **Frontend** (`Client/`): React SPA on port 3000 - React Router v6, TanStack Query v4, CSS Modules, Socket.IO client for terminal sessions
- **Root**: Orchestration with `concurrently` to run both services in development

**Critical architectural decisions**:
- Backend is a pure API server (no `express.static` for frontend files)
- React dev server proxies `/api`, `/uploads`, and `/socket.io` to `localhost:3044` via `setupProxy.js`
- SSH connection pooling with 5-min idle timeout, max 8 channels per connection before reconnect
- Session-based authentication (sessions stored in-memory, lost on restart in dev)

## Development Commands

```bash
npm run install:all      # First time setup (installs root, Backend/, Client/)
npm run dev              # Both frontend + backend with hot-reload
npm run dev:backend      # Backend only (nodemon on :3044)
npm run dev:client       # Frontend only (react-scripts on :3000)
npm run build            # Production build (runs scripts/build.sh, loads url.env)
npm run pm2:start        # Production deployment with PM2
```

**Common mistakes**: 
- `npm start` runs production mode (requires built frontend). Always use `npm run dev` for development.
- Environment variables: Backend reads from `url.env` at root. Frontend build reads `REACT_APP_BACKEND_URL` from `url.env` via `build.sh`.

## Backend Structure (`Backend/`)

```
Backend/
├── server.js              # Entry point - mounts routes, Socket.IO, starts metrics scheduler
├── config/index.js        # All configuration (PORT, DB, SSH, CORS, SESSION, etc.)
├── database/
│   ├── connection.js      # Promise-based SQLite wrapper: run(), get(), all()
│   └── init.js            # Schema creation and runMigrations() for db updates
├── models/                # Database operations (index.js re-exports all)
│   ├── ServerModel.js     # Server CRUD + toCamelCase conversion, resolveKeyPath()
│   ├── AppModel.js        # Apps (Docker containers) and deployments
│   ├── SnapshotModel.js   # Backup snapshots for deployments
│   ├── UserModel.js       # User authentication and management
│   ├── MetricsModel.js    # Historical metrics storage
│   └── ActivityModel.js   # Activity log tracking
├── middleware/
│   ├── auth.js            # requireAuth, optionalAuth, attachUser (session-based)
│   ├── ownership.js       # checkServerOwnership, checkAppOwnership (user isolation)
│   └── errorHandler.js    # asyncHandler wrapper, errorHandler, notFoundHandler
├── routes/                # API route handlers (index.js re-exports all)
│   ├── servers.js         # /api/servers/* - CRUD, status checks
│   ├── files.js           # /api/servers/:id/files/* - SFTP file browser
│   ├── metrics.js         # /api/servers/:id/metrics/* - CPU/memory/disk data
│   ├── snapshots.js       # /api/snapshots/*, /api/deployments/:id/snapshots/*
│   ├── migrations.js      # /api/migrations/* - server-to-server deployment transfers
│   ├── apps.js            # /api/apps/* - Docker container deployments
│   ├── services.js        # /api/services/* - install nginx, docker, nodejs, etc.
│   ├── templates.js       # /api/templates/* - load from templates/templates.yaml
│   └── auth.js            # /api/auth/* - login, register, session management
├── services/
│   ├── ssh/               # connectionPool, connectionManager, keyManager, sftpService
│   ├── metrics/           # collector, parser, scheduler (runs every 30s in background)
│   ├── snapshots/         # snapshotService for deployment backups (tar.gz format)
│   ├── migration/         # migrationService for cross-server deployment transfers
│   ├── containerFileService.js  # Browse Docker volume files via `docker inspect`
│   └── storage/           # storageService for file uploads, cleanup
├── websocket/terminal.js  # Socket.IO handlers: terminal sessions, service installation progress
├── templates/             # Docker app templates (YAML format)
└── ssh_keys/              # Generated SSH key pairs (server_<timestamp>, .pub)
```

### Key Backend Patterns

**Route handlers**: Always use `asyncHandler()` + auth middleware:
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
const result = await run('INSERT INTO servers ...', [params]);
```

**SSH operations**: Use connectionManager for pooled connections:
```javascript
const { connectionManager } = require('../services/ssh');
const result = await connectionManager.executeCommand(serverConfig, 'ls -la');
// connectionManager.createShell() for interactive terminal sessions
```

**Socket.IO for real-time**: Access via `req.app.get('io')`:
```javascript
const io = req.app.get('io');
io.emit('migration-progress', { step: 'transferring', progress: 50 });
io.to(socketId).emit('terminal-data', data); // Per-session events
```

**Docker deployments**: Use `buildDockerCommand()` in `websocket/terminal.js`:
- Constructs `docker run -d` with ports, env vars, volumes from app config
- Container naming: `{appname}-{timestamp}` to avoid conflicts
- Restart policies, network modes from app/template settings

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
