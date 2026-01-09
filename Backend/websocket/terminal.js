const { ServerModel, AppModel } = require('../models');
const { createShell, executeCommand } = require('../services/ssh/connectionManager');

/**
 * Service installation commands (with version support for nodejs)
 * DEBIAN_FRONTEND=noninteractive prevents interactive prompts
 */
const INSTALL_COMMANDS = {
  nginx: 'sudo DEBIAN_FRONTEND=noninteractive apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx',
  // Manual Docker installation that works on older/EOL distributions
  docker: `
    sudo apt-get update && 
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg lsb-release &&
    sudo install -m 0755 -d /etc/apt/keyrings &&
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes &&
    sudo chmod a+r /etc/apt/keyrings/docker.gpg &&
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null &&
    sudo apt-get update &&
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin &&
    sudo usermod -aG docker $USER &&
    sudo systemctl enable docker &&
    sudo systemctl start docker
  `.replace(/\n\s+/g, ' ').trim(),
  nodejs: (version) => `curl -fsSL https://deb.nodesource.com/setup_${version || '20'}.x | sudo -E bash - && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs`,
  postgresql: 'sudo DEBIAN_FRONTEND=noninteractive apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib',
  redis: 'sudo DEBIAN_FRONTEND=noninteractive apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server',
};

/**
 * Active terminal sessions
 * Map of socketId -> { conn, stream }
 */
const activeSessions = new Map();

/**
 * Build docker run command from app configuration
 */
function buildDockerCommand(app, portMappings) {
  let cmd = 'docker run -d';
  
  // Container name based on app name with timestamp
  const timestamp = Date.now();
  const baseContainerName = app.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const containerName = `${baseContainerName}-${timestamp}`;
  cmd += ` --name ${containerName}`;
  
  // Port mappings
  if (portMappings && portMappings.length > 0) {
    portMappings.forEach(port => {
      if (port.host && port.container) {
        cmd += ` -p ${port.host}:${port.container}`;
      }
    });
  } else if (app.ports && app.ports.length > 0) {
    app.ports.forEach(port => {
      if (port.host && port.container) {
        cmd += ` -p ${port.host}:${port.container}`;
      }
    });
  }
  
  // Environment variables
  if (app.env_vars && app.env_vars.length > 0) {
    app.env_vars.forEach(envVar => {
      if (envVar.key && envVar.value) {
        cmd += ` -e "${envVar.key}=${envVar.value}"`;
      }
    });
  }
  
  // Volumes
  if (app.volumes && app.volumes.length > 0) {
    app.volumes.forEach(vol => {
      if (vol.host && vol.container) {
        cmd += ` -v ${vol.host}:${vol.container}`;
      }
    });
  }
  
  // Restart policy
  if (app.restart_policy) {
    cmd += ` --restart ${app.restart_policy}`;
  }
  
  // Network mode
  if (app.network_mode) {
    cmd += ` --network ${app.network_mode}`;
  }
  
  // Custom arguments (added before image)
  if (app.custom_args && app.custom_args.trim()) {
    cmd += ` ${app.custom_args.trim()}`;
  }
  
  // Image with tag
  const image = app.image;
  const tag = app.tag || 'latest';
  cmd += ` ${image}:${tag}`;
  
  // Custom command if specified
  if (app.command) {
    cmd += ` ${app.command}`;
  }
  
  return { cmd, containerName };
}

/**
 * Initialize WebSocket terminal handlers
 * @param {Server} io - Socket.IO server instance
 */
function initTerminalHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle app deployment
    socket.on('deploy-app', async ({ appId, serverId, portMappings }) => {
      try {
        socket.emit('deploy-output', { data: '>>> Starting deployment...\n' });
        
        // Fetch app and server details
        const app = await AppModel.findById(appId);
        if (!app) {
          socket.emit('deploy-error', { message: 'App not found' });
          return;
        }
        
        // Parse JSON fields if they're strings
        if (app.ports && typeof app.ports === 'string') {
          app.ports = JSON.parse(app.ports);
        }
        if (app.env_vars && typeof app.env_vars === 'string') {
          app.env_vars = JSON.parse(app.env_vars);
        }
        if (app.volumes && typeof app.volumes === 'string') {
          app.volumes = JSON.parse(app.volumes);
        }
        
        const server = await ServerModel.findById(serverId);
        if (!server) {
          socket.emit('deploy-error', { message: 'Server not found' });
          return;
        }
        
        socket.emit('deploy-output', { data: `>>> Connecting to ${server.name} (${server.ip})...\n` });
        
        // Handle custom registry login if needed
        if (app.registry_url && app.registry_username && app.registry_password) {
          socket.emit('deploy-output', { data: `>>> Logging into custom registry: ${app.registry_url}...\n` });
          try {
            await executeCommand({
              host: server.ip,
              username: server.username,
              privateKeyPath: server.private_key_path
            }, `echo "${app.registry_password}" | docker login ${app.registry_url} -u ${app.registry_username} --password-stdin`);
            socket.emit('deploy-output', { data: '>>> Registry login successful\n' });
          } catch (loginErr) {
            socket.emit('deploy-output', { data: `>>> Warning: Registry login failed: ${loginErr.message}\n` });
          }
        }
        
        // Check if image is configured
        if (!app.image) {
          socket.emit('deploy-error', { message: 'No Docker image configured for this app. Please configure the app with a Docker image first.' });
          return;
        }
        
        // Pull the image
        const image = app.image;
        const tag = app.tag || 'latest';
        const fullImage = app.registry_url 
          ? `${app.registry_url}/${image}:${tag}` 
          : `${image}:${tag}`;
        
        socket.emit('deploy-output', { data: `>>> Pulling image: ${fullImage}...\n` });
        
        try {
          const pullResult = await executeCommand({
            host: server.ip,
            username: server.username,
            privateKeyPath: server.private_key_path
          }, `docker pull ${fullImage}`);
          socket.emit('deploy-output', { data: pullResult.stdout + '\n' });
        } catch (pullErr) {
          socket.emit('deploy-output', { data: `>>> Warning: Pull failed (may use cached image): ${pullErr.message}\n` });
        }
        
        // Build and run the container
        const { cmd, containerName } = buildDockerCommand(app, portMappings);
        socket.emit('deploy-output', { data: `>>> Running container...\n` });
        socket.emit('deploy-output', { data: `>>> Command: ${cmd}\n\n` });
        
        const runResult = await executeCommand({
          host: server.ip,
          username: server.username,
          privateKeyPath: server.private_key_path
        }, cmd);
        
        // Docker run returns the full container ID - extract it properly
        const fullOutput = runResult.stdout.trim();
        // The container ID is the last line (in case there's other output like pull progress)
        const lines = fullOutput.split('\n').filter(line => line.trim());
        const lastLine = lines[lines.length - 1] || '';
        // Container ID is 64 hex chars, we use first 12
        const containerId = lastLine.trim().substring(0, 12);
        
        console.log('Docker run output:', fullOutput);
        console.log('Extracted container ID:', containerId);
        
        socket.emit('deploy-output', { data: `>>> Container started: ${containerId}\n` });
        
        // Get the actual container name (docker may have modified it)
        let actualContainerName = containerName;
        try {
          const inspectResult = await executeCommand({
            host: server.ip,
            username: server.username,
            privateKeyPath: server.private_key_path
          }, `docker inspect --format='{{.Name}}' ${containerId}`);
          actualContainerName = inspectResult.stdout.trim().replace(/^\//, '');
        } catch (err) {
          // Use default name
        }
        
        // Create deployment record in database
        const deployment = await AppModel.createDeployment({
          appId,
          serverId,
          containerId,
          containerName: actualContainerName,
          status: 'running',
          portMappings: portMappings || app.ports
        });
        
        socket.emit('deploy-output', { data: '\n>>> Deployment complete!\n' });
        socket.emit('deploy-complete', { success: true, deploymentId: deployment.id });
        
      } catch (error) {
        console.error('Deployment error:', error);
        socket.emit('deploy-output', { data: `\n>>> Deployment failed: ${error.message}\n` });
        socket.emit('deploy-error', { message: error.message });
      }
    });

    // Handle service installation with streaming output
    socket.on('install-service', async ({ serverId, serviceName, version }) => {
      try {
        console.log(`Installing ${serviceName} on server ${serverId}${version ? ` (version ${version})` : ''}`);
        
        const server = await ServerModel.findById(serverId);
        if (!server) {
          socket.emit('install-error', { message: 'Server not found' });
          return;
        }

        // Get install command
        let installCmd = INSTALL_COMMANDS[serviceName.toLowerCase()];
        if (!installCmd) {
          socket.emit('install-error', { message: `Unsupported service: ${serviceName}` });
          return;
        }

        // Handle version-specific commands (like nodejs)
        if (typeof installCmd === 'function') {
          installCmd = installCmd(version);
        }

        socket.emit('install-output', { data: `>>> Installing ${serviceName}...\n` });
        socket.emit('install-output', { data: `>>> Running: ${installCmd}\n\n` });

        // Create SSH connection for exec with streaming
        const { Client } = require('ssh2');
        const fs = require('fs');
        const conn = new Client();

        conn.on('ready', () => {
          // Use exec instead of shell for proper exit code handling
          conn.exec(installCmd, { pty: true }, (err, stream) => {
            if (err) {
              socket.emit('install-error', { message: err.message });
              conn.end();
              return;
            }

            let hasError = false;

            stream.on('data', (data) => {
              const text = data.toString('utf-8');
              socket.emit('install-output', { data: text });
              
              // Check for common sudo password prompts
              if (text.includes('[sudo] password') || text.includes('password is required')) {
                hasError = true;
                socket.emit('install-error', { 
                  message: 'Sudo password is required. Please configure passwordless sudo or use a root user.' 
                });
                stream.close();
                conn.end();
              }
            });

            stream.stderr.on('data', (data) => {
              const text = data.toString('utf-8');
              socket.emit('install-output', { data: text });
            });

            stream.on('close', (code) => {
              if (!hasError) {
                if (code === 0) {
                  socket.emit('install-output', { data: `\n>>> ${serviceName} installation complete!\n` });
                  socket.emit('install-complete', { success: true, message: `${serviceName} installed successfully` });
                } else {
                  socket.emit('install-output', { data: `\n>>> Installation failed with exit code ${code}\n` });
                  socket.emit('install-complete', { success: false, message: `Installation failed with exit code ${code}` });
                }
              }
              conn.end();
            });
          });
        });

        conn.on('error', (err) => {
          socket.emit('install-error', { message: err.message });
        });

        conn.connect({
          host: server.ip,
          port: 22,
          username: server.username,
          privateKey: fs.readFileSync(server.privateKeyPath)
        });

      } catch (error) {
        console.error('Install service error:', error);
        socket.emit('install-error', { message: error.message });
      }
    });

    // Start terminal session
    socket.on('start-terminal', async ({ serverId }) => {
      try {
        const server = await ServerModel.findById(serverId);

        if (!server) {
          socket.emit('error', { message: 'Server not found' });
          return;
        }

        // Create SSH shell session
        const { conn, stream } = await createShell({
          host: server.ip,
          username: server.username,
          privateKeyPath: server.privateKeyPath
        });

        socket.emit('status', { message: 'Connected to server' });

        // Store the session
        activeSessions.set(socket.id, { conn, stream, serverId });

        // Send data from server to client
        stream.on('data', (data) => {
          socket.emit('data', data.toString('utf-8'));
        });

        stream.stderr.on('data', (data) => {
          socket.emit('data', data.toString('utf-8'));
        });

        stream.on('close', () => {
          socket.emit('status', { message: 'Terminal closed' });
          conn.end();
          activeSessions.delete(socket.id);
        });

      } catch (error) {
        console.error('Terminal error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Receive data from client
    socket.on('data', (data) => {
      const session = activeSessions.get(socket.id);
      if (session && session.stream) {
        session.stream.write(data);
      }
    });

    // Handle terminal resize
    socket.on('resize', ({ rows, cols }) => {
      const session = activeSessions.get(socket.id);
      if (session && session.stream) {
        session.stream.setWindow(rows, cols);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      const session = activeSessions.get(socket.id);
      if (session) {
        if (session.stream) session.stream.end();
        if (session.conn) session.conn.end();
        activeSessions.delete(socket.id);
      }
    });
  });
}

/**
 * Get active session count
 * @returns {number}
 */
function getActiveSessionCount() {
  return activeSessions.size;
}

/**
 * Get active sessions info
 * @returns {Array}
 */
function getActiveSessions() {
  const sessions = [];
  for (const [socketId, session] of activeSessions.entries()) {
    sessions.push({
      socketId,
      serverId: session.serverId
    });
  }
  return sessions;
}

/**
 * Close all terminal sessions (for shutdown)
 */
function closeAllSessions() {
  for (const [socketId, session] of activeSessions.entries()) {
    if (session.stream) session.stream.end();
    if (session.conn) session.conn.end();
  }
  activeSessions.clear();
}

module.exports = {
  initTerminalHandlers,
  getActiveSessionCount,
  getActiveSessions,
  closeAllSessions
};
