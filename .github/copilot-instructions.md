# Multi-Server SSH Manager - AI Coding Guide

## Architecture Overview

This is a full-stack monorepo with **separate frontend and backend** that communicate via REST API + WebSocket:

- **Backend**: Express server (`backend/server.js`) on port 3044 - handles SSH connections, metrics collection, SQLite database
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

## Backend Patterns (`backend/server.js`)

### Database Layer
- **SQLite** with raw `sqlite3` queries (no ORM)
- 5 tables: `users`, `servers`, `activities`, `apps`, `server_metrics`
- All tables use TEXT id fields (UUID v4) generated with `uuid.v4()`
- `requireAuth` middleware checks `req.session.userId` - redirect to `/login` on 401

### SSH Operations
- SSH keys stored in `backend/ssh_keys/` as `server_<timestamp>` and `.pub`
- Generated via `ssh-keygen` child process (not programmatically)
- Uses `ssh2` library's `Client` class for all SSH connections
- Connection pattern: `new Client().connect({ host, username, privateKey })` → `.exec()` or `.sftp()`

### Metrics Collection
- Background interval (`setInterval` at 30s) calls `collectServerMetrics()` for ALL servers
- Metrics stored in `server_metrics` table with timestamp
- Endpoint `/api/servers/:id/metrics/history?hours=24` returns time-series data for charts
- Recharts (in React) expects `{ timestamp, cpu_usage, memory_percentage, ... }` array format

### WebSocket (Socket.IO)
- Terminal sessions use Socket.IO on `io.on('connection')` 
- Client emits `createTerminal` with `{ serverId }` → server establishes SSH shell → streams I/O bidirectionally
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
1. Add backend endpoint in `server.js` (after line ~1500 where other endpoints are)
2. Add auth middleware: `app.get('/api/servers/:id/newFeature', requireAuth, async (req, res) => {...})`
3. Create service method in `client/src/api/servers.js`: `newFeature: (id) => api.get(...)`
4. Use in React with TanStack Query: `useQuery(['server', id, 'newFeature'], () => serversService.newFeature(id))`

### Adding a New Page
1. Create `client/src/pages/NewPage.jsx` + `NewPage.module.css`
2. Import `Layout` and wrap content: `<Layout><div>...</div></Layout>`
3. Add route in `App.jsx`: `<Route path="/newpage" element={<NewPage />} />`
4. Add nav link in `Sidebar.jsx` with icon from `Icons.jsx`

### Database Schema Changes
- Migrations are manual - add `ALTER TABLE` statements in `initStorage()` function
- Use pattern: `db.run(\`ALTER TABLE ... ADD COLUMN ...\`, (err) => { /* ignore duplicate column error */ })`
- No migration files - all schema changes in `server.js`

## Project-Specific Quirks

- **SSH key format**: Backend expects keys WITHOUT passphrase (automated connections)
- **Session secret**: Randomly generated on server start (sessions lost on restart)
- **Metrics interval**: Hardcoded 30 seconds - changing requires restart to take effect
- **File paths**: Backend uses absolute paths from `__dirname`, React uses workspace-relative
- **Port conflict**: If port 3044 is taken, update BOTH `backend/server.js` PORT constant AND `client/package.json` proxy
- **CORS**: Both `http://localhost:3000` and `http://localhost:3044` allowed - do not add other origins without updating backend

## Testing Context

- No test suite currently implemented (boilerplate from CRA exists)
- Manual testing workflow: `npm run dev` → test in browser → check backend logs in terminal
- Socket.IO debugging: Enable client logs with `socket.io-client/debug`

## Key Files to Reference

- [backend/server.js](backend/server.js) - All API routes, auth middleware, SSH logic, metrics collection
- [client/src/App.jsx](client/src/App.jsx) - React Router setup, QueryClient config
- [client/src/api/axiosConfig.js](client/src/api/axiosConfig.js) - Axios instance, auth interceptor
- [client/src/contexts/AuthContext.jsx](client/src/contexts/AuthContext.jsx) - Session management
- [client/src/components/Layout.jsx](client/src/components/Layout.jsx) - Protected route wrapper pattern
