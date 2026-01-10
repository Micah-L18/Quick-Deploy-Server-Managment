/**
 * Multi-Server SSH Manager - Backend Entry Point
 * 
 * This is the main entry point for the backend server.
 * All business logic has been extracted to modular components.
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');

// Configuration
const { PORT, CORS_ORIGINS, SESSION_CONFIG } = require('./config');

// Database
const { initDatabase } = require('./database/init');

// Routes
const {
  authRoutes,
  serverRoutes,
  activityRoutes,
  appRoutes,
  fileRoutes,
  metricsRoutes,
  serviceRoutes
} = require('./routes');

// Middleware
const { errorHandler, notFoundHandler } = require('./middleware');

// WebSocket
const { initTerminalHandlers } = require('./websocket');

// Services
const { scheduler: metricsScheduler } = require('./services/metrics');
const { connectionPool } = require('./services/ssh');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// =============================================================================
// Middleware Setup
// =============================================================================

// CORS
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));

// Body parsing
app.use(express.json());

// Session
app.use(session(SESSION_CONFIG));

// =============================================================================
// API Routes
// =============================================================================

// Mount route modules
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers', fileRoutes);      // /api/servers/:id/files/*
app.use('/api/servers', metricsRoutes);   // /api/servers/:id/metrics/*
app.use('/api/servers', serviceRoutes);   // /api/servers/:id/services/*
app.use('/api/activities', activityRoutes);
app.use('/api/apps', appRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sshPoolStats: connectionPool.getStats()
  });
});

// =============================================================================
// Error Handling
// =============================================================================

app.use(notFoundHandler);
app.use(errorHandler);

// =============================================================================
// WebSocket Setup
// =============================================================================

initTerminalHandlers(io);

// =============================================================================
// Server Startup
// =============================================================================

async function startServer() {
  try {
    // Initialize database
    await initDatabase();
    console.log('Database initialized');

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      
      // Start background metrics collection
      metricsScheduler.startMetricsCollection();
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

function shutdown() {
  console.log('Shutting down gracefully...');
  
  // Stop metrics collection
  metricsScheduler.stopMetricsCollection();
  
  // Close SSH connection pool
  connectionPool.closeAll();
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
startServer();

module.exports = { app, server, io };
