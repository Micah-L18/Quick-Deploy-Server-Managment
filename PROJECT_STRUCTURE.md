# Project Structure

## Overview
The project has been reorganized into a clean monorepo structure with separate frontend and backend.

## Directory Structure

```
neo-multi/
├── backend/              # Express API Server
│   ├── server.js         # Main server file
│   ├── servers.db        # SQLite database
│   ├── ssh_keys/         # Generated SSH keys for servers
│   ├── package.json      # Backend dependencies
│   └── node_modules/     # Backend packages
│
├── client/               # React Frontend Application
│   ├── src/              # React source code
│   │   ├── api/          # API client services
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── styles/       # Global styles
│   │   └── utils/        # Utility functions
│   ├── public/           # Static assets
│   ├── package.json      # Frontend dependencies
│   └── node_modules/     # Frontend packages
│
├── package.json          # Root package with dev scripts
├── node_modules/         # Root dependencies (concurrently)
├── README.md             # Project documentation
└── .gitignore            # Git ignore rules

```

## Key Changes

### 1. Backend Separation
- Moved `server.js`, `servers.db`, and `ssh_keys/` into `backend/` folder
- Created `backend/package.json` with backend-specific dependencies
- Removed `app.use(express.static('public'))` - no longer serving static files
- Backend runs on **port 3044**

### 2. Frontend Isolation
- React app in `client/` folder remains unchanged
- All UI is now exclusively in the React application
- Frontend development server runs on **port 3000**

### 3. Removed Old UI
- Deleted `public/` folder (old HTML/CSS/JS UI)
- All UI elements now come from the React client

### 4. Root Package Scripts
The root `package.json` provides convenient scripts to run both services:

```json
{
  "scripts": {
    "start": "concurrently \"npm run start:backend\" \"npm run start:client\"",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:client\"",
    "start:backend": "cd backend && npm start",
    "start:client": "cd client && npm start",
    "dev:backend": "cd backend && npm run dev",
    "dev:client": "cd client && PORT=3000 npm start",
    "install:all": "npm install && cd backend && npm install && cd ../client && npm install"
  }
}
```

## Development Workflow

### Initial Setup
```bash
npm run install:all
```

### Development Mode (with hot-reload)
```bash
npm run dev
```
This starts:
- Backend API with nodemon on http://localhost:3044
- React dev server on http://localhost:3000

### Production Mode
```bash
npm start
```

### Individual Services
```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:client
```

## Architecture

### Backend (Express + Socket.IO)
- RESTful API for server management
- WebSocket support for terminal sessions
- Background metrics collection every 30 seconds
- SQLite database for persistence
- SSH2 for server connections

### Frontend (React 19)
- Modern React with Hooks
- React Router v7 for navigation
- TanStack Query for data fetching
- Recharts for metrics visualization
- xterm.js for terminal emulation
- Socket.IO client for WebSocket communication

### Communication
- Frontend makes HTTP requests to `http://localhost:3044/api/...`
- WebSocket connection for real-time terminal: `ws://localhost:3044`
- CORS enabled for development

## Benefits of This Structure

1. **Clean Separation**: Frontend and backend are completely independent
2. **Easy Development**: Run both services with one command
3. **Modern Stack**: React for UI, Express for API
4. **Scalability**: Can deploy frontend and backend separately
5. **No UI Duplication**: Single source of truth for UI (React app)
6. **Professional**: Follows industry best practices for full-stack apps
