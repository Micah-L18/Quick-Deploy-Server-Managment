/**
 * PM2 Ecosystem Configuration
 * 
 * This file configures PM2 process manager for production deployments.
 * PM2 handles automatic restarts, load balancing, and log management.
 * 
 * Usage:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 logs              # View logs
 *   pm2 status            # Check status
 *   pm2 restart all       # Restart services
 *   pm2 stop all          # Stop all services
 *   pm2 delete all        # Remove from PM2
 * 
 * To enable startup on system boot:
 *   pm2 startup
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'qdeploy-backend',
      script: 'server.js',
      cwd: './Backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3044
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3044
      },
      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,
      // Logging
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Restart behavior
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 1000
    },
    {
      name: 'qdeploy-client',
      script: 'npx',
      args: 'serve -s build -l 3000',
      cwd: './Client',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      // Logging
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
