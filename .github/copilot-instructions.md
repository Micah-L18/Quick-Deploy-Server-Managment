# Multi-Server SSH Manager - AI Coding Guide

## Architecture Overview

This is a full-stack monorepo with **separate frontend and backend** that communicate via REST API + WebSocket:

- **Backend**: Modular Express server (`backend/`) on port 3044 - handles SSH connections, metrics collection, SQLite database
- **Frontend**: React 19 SPA (`client/`) on port 3000 - uses React Router v7, TanStack Query, CSS Modules
- **Root**: Orchestration package with `concurrently` to run both services

### Critical: Backend is NOT serving the frontend
The backend has no `express.static` - it's a pure API server. The React dev server proxies API requests to localhost:3044.

## Development Commands

```bash
# First time setup
npm run install:all

# Run both frontend + backend with hot-reload
npm run dev

# Run individually
npm run dev:backend   # nodemon on :3044
npm run dev:client    # react-scripts on :3000
```

**Common mistake**: Running `npm start` in root starts production mode (no hot-reload). Use `npm run dev` for development.

## Backend Structure

```
backend/
├── server.js           # Entry point (~100 lines) - mounts routes, starts server
├── config/
│   └── index.js        # Configuration constants (PORT, DB_FILE, SSH_KEYS_DIR, etc)
├── database/
│   ├── connection.js   # Promise-based SQLite wrapper (run, get, all, transaction)
│   └── init.js         # Schema creation and migrations
├── models/
│   ├── UserModel.js    # User CRUD operations
│   ├── ServerModel.js  # Server CRUD operations
│   ├── ActivityModel.js# Activity logging
│   ├── AppModel.js     # Apps and deployments
│   └── MetricsModel.js # Server metrics storage
├── middleware/
│   ├── auth.js         # requireAuth, optionalAuth, attachUser
│   ├── ownership.js    # checkServerOwnership, checkAppOwnership
│   └── errorHandler.js # asyncHandler, errorHandler, notFoundHandler
├── routes/
│   ├── auth.js         # /api/auth/* routes
│   ├── servers.js      # /api/servers/* routes
│   ├── activities.js   # /api/activities/* routes
│   ├── apps.js         # /api/apps/* routes
│   ├── files.js        # /api/servers/:id/files/* routes
│   ├── metrics.js      # /api/servers/:id/metrics/* routes
│   └── services.js     # /api/servers/:id/services/* routes
├── services/
│   ├── ssh/
│   │   ├── connectionPool.js  # SSH connection pooling with 5-min idle timeout
│   │   ├── connectionManager.js # testConnection, executeCommand, createShell
│   │   ├── keyManager.js      # generateKeyPair, deleteKeyPair
│   │   └── sftpService.js     # listDirectory, readFile, writeFile, etc.
│   └── metrics/
│       ├── collector.js       # collectMetrics, getOsInfo, getServiceStatus
│       ├── parser.js          # parseMetrics, parseCpuUsage
│       └── scheduler.js       # Background metrics collection (30s interval)
└── websocket/
    └── terminal.js     # Socket.IO terminal session handlers
```

### Database Layer
- **SQLite** with Promise-based wrapper in `database/connection.js`
- Use `run()`, `get()`, `all()` for queries - all return Promises
- 6 tables: `users`, `servers`, `activities`, `apps`, `server_metrics`, `app_deployments`
- All tables use TEXT id fields (UUID v4 or timestamp-based)
- Schema + migrations in `database/init.js`

### Models Pattern
- Each model file exports async functions
- Functions like `findById()`, `findAll()`, `create()`, `update()`, `remove()`
- Convert snake_case DB columns to camelCase in model layer

### SSH Operations
- **Connection Pool**: Reuses SSH connections with 5-minute idle timeout
- SSH keys stored in `backend/ssh_keys/` as `server_<timestamp>` and `.pub`
- Key generation via `ssh-keygen` in `services/ssh/keyManager.js`
- Command execution via `services/ssh/connectionManager.js`
- SFTP operations via `services/ssh/sftpService.js`

### Metrics Collection
- Background scheduler in `services/metrics/scheduler.js` (30s interval)
- Parsing logic isolated in `services/metrics/parser.js`
- Endpoint `/api/servers/:id/metrics/history?hours=24` returns time-series data
- Fresh metrics fetched if cache > 2 minutes old

### WebSocket (Socket.IO)
- Terminal handlers in `websocket/terminal.js`
- Client emits `start-terminal` with `{ serverId }` → server creates SSH shell
- One Socket.IO connection per terminal instance

## Frontend Patterns (`client/src/`)

### API Layer (`src/api/`)
- Centralized axios instance in `axiosConfig.js` with `withCredentials: true`
- Response interceptor redirects to `/login` on 401 (except when on auth pages)
- Service modules: `authService`, `serversService`, `filesService`, `appsService`, `activitiesService`
- Example: `serversService.getAll()` → `GET /api/servers` → returns Promise

### State Management
- **Auth**: React Context (`AuthContext.jsx`) wraps entire app, provides `{ user, login, logout, checkAuth }`
- **Server data**: TanStack Query with `useQuery(['servers'], serversService.getAll)`
- **Local UI**: useState/useReducer in components
- No Redux/Zustand - intentionally simple

### Routing & Layout
- Protected routes wrapped in `<Layout>` component which:
  1. Checks `useAuth().user` 
  2. Redirects to `/login` if not authenticated
  3. Renders `<Sidebar>` + children
- All pages (except Login/Register) must render inside `<Layout>`

### Styling Convention
- **CSS Modules** for component styles (`.module.css` files)
- Import as `import styles from './Component.module.css'`
- Global CSS variables in `styles/global.css`: `--primary: #00d4ff`, `--background: #0a0e27`, etc.
- Every component has its own `.module.css` file - no shared component styles

### Terminal Component
- Uses `xterm.js` (`@xterm/xterm`) with `FitAddon` from `@xterm/addon-fit`
- Socket.IO client connects on mount, emits `createTerminal`, listens for `terminalData`
- **Important**: Must call `fitAddon.fit()` after terminal container is rendered to size correctly

## Common Workflows

### Adding a New Server Feature
1. Create route handler in appropriate `routes/*.js` file
2. Use `asyncHandler()` wrapper and `requireAuth` middleware
3. Use models for database operations, SSH services for remote operations
4. Create service method in `client/src/api/servers.js`
5. Use in React with TanStack Query

### Adding a New Route File
1. Create `backend/routes/newFeature.js`
2. Export Express router with handlers
3. Import and mount in `server.js`: `app.use('/api/newFeature', newFeatureRoutes)`

### Adding a New Page
1. Create `client/src/pages/NewPage.jsx` + `NewPage.module.css`
2. Import `Layout` and wrap content: `<Layout><div>...</div></Layout>`
3. Add route in `App.jsx`: `<Route path="/newpage" element={<NewPage />} />`
4. Add nav link in `Sidebar.jsx` with icon from `Icons.jsx`

### Database Schema Changes
1. Add table creation in `database/init.js` inside `initDatabase()`
2. Add migrations for new columns in `runMigrations()`
3. Create/update model in `models/` directory

## Project-Specific Quirks

- **SSH key format**: Backend expects keys WITHOUT passphrase (automated connections)
- **SSH Connection Pooling**: Connections reused with 5-minute idle timeout (configurable in `config/index.js`)
- **Session secret**: Randomly generated on server start (sessions lost on restart)
- **Metrics interval**: Configurable in `config/index.js` - default 30 seconds
- **File paths**: Backend uses absolute paths from `__dirname`, React uses workspace-relative
- **Port conflict**: If port 3044 is taken, update `backend/config/index.js` AND `client/package.json` proxy
- **CORS**: Both `http://localhost:3000` and `http://localhost:3044` allowed - update in `config/index.js`

## Testing Context

- No test suite currently implemented (boilerplate from CRA exists)
- Manual testing workflow: `npm run dev` → test in browser → check backend logs in terminal
- Socket.IO debugging: Enable client logs with `socket.io-client/debug`
- Health check endpoint: `GET /api/health` returns server status and SSH pool stats

## Key Files to Reference

- [backend/server.js](backend/server.js) - Entry point, route mounting, startup
- [backend/config/index.js](backend/config/index.js) - All configuration constants
- [backend/routes/](backend/routes/) - API route handlers
- [backend/models/](backend/models/) - Database operations
- [backend/services/ssh/](backend/services/ssh/) - SSH connection pool, SFTP, key management
- [client/src/App.jsx](client/src/App.jsx) - React Router setup, QueryClient config
- [client/src/api/axiosConfig.js](client/src/api/axiosConfig.js) - Axios instance, auth interceptor
- [client/src/contexts/AuthContext.jsx](client/src/contexts/AuthContext.jsx) - Session management
- [client/src/components/Layout.jsx](client/src/components/Layout.jsx) - Protected route wrapper pattern
