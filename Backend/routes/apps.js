const express = require('express');
const router = express.Router();
const { AppModel, ActivityModel } = require('../models');
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { connectionManager } = require('../services/ssh');
const { checkPortsAvailable } = require('../services/metrics/collector');

/**
 * GET /api/apps
 * Get all apps for user
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const apps = await AppModel.findAll(req.session.userId);
  res.json(apps);
}));

/**
 * GET /api/apps/deployments/all
 * Get all deployments across all apps for user
 */
router.get('/deployments/all', requireAuth, asyncHandler(async (req, res) => {
  const deployments = await AppModel.findAllDeployments(req.session.userId);
  res.json(deployments);
}));

/**
 * GET /api/apps/orphaned
 * Get all apps with no active deployments
 */
router.get('/orphaned', requireAuth, asyncHandler(async (req, res) => {
  const orphanedApps = await AppModel.findOrphaned(req.session.userId);
  res.json(orphanedApps);
}));

/**
 * GET /api/apps/:id
 * Get single app
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await AppModel.findById(req.params.id, req.session.userId);
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  res.json(app);
}));

/**
 * POST /api/apps
 * Create new app
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'App name is required' });
  }

  const app = await AppModel.create(req.session.userId, name, description);

  // Log activity
  try {
    await ActivityModel.create(
      req.session.userId,
      'success',
      `App "${name}" created`
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }

  res.json(app);
}));

/**
 * PUT /api/apps/:id
 * Update app
 */
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await AppModel.findById(req.params.id, req.session.userId);
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  const { 
    name, 
    description, 
    image, 
    tag, 
    ports, 
    env_vars, 
    volumes, 
    restart_policy, 
    network_mode, 
    command,
    custom_args,
    registry_url,
    registry_username,
    registry_password,
    web_ui_port,
    icon,
    icon_url
  } = req.body;
  
  await AppModel.update(req.params.id, { 
    name, 
    description, 
    image, 
    tag, 
    ports, 
    env_vars, 
    volumes, 
    restart_policy, 
    network_mode, 
    command,
    custom_args,
    registry_url,
    registry_username,
    registry_password,
    web_ui_port,
    icon,
    icon_url
  });

  const updatedApp = await AppModel.findById(req.params.id, req.session.userId);
  res.json(updatedApp);
}));

/**
 * DELETE /api/apps/:id
 * Delete app
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await AppModel.findById(req.params.id, req.session.userId);
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  await AppModel.remove(req.params.id, req.session.userId);

  // Log activity
  try {
    await ActivityModel.create(
      req.session.userId,
      'error',
      `App "${app.name}" deleted`
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }

  res.json({ success: true });
}));

/**
 * POST /api/apps/:id/check-ports
 * Check if ports are available on a server
 * Also checks configured ports from other deployments on the same server
 */
router.post('/:id/check-ports', requireAuth, asyncHandler(async (req, res) => {
  const { serverId, ports, excludeDeploymentId } = req.body;

  if (!serverId || !ports || !Array.isArray(ports)) {
    return res.status(400).json({ error: 'Server ID and ports array required' });
  }

  // Check if user owns the app
  const app = await AppModel.findById(req.params.id, req.session.userId);
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  // Check if user owns the server
  const serverCheck = await checkServerOwnership(serverId, req.session.userId);
  if (serverCheck.error) {
    return res.status(serverCheck.status).json({ error: serverCheck.error });
  }

  const server = serverCheck.server;
  const portNumbers = ports.map(p => p.host).filter(Boolean);
  
  // Get the excluded deployment's current ports (if editing an existing deployment)
  // These ports are owned by the deployment being edited, so they shouldn't be flagged as conflicts
  let excludedPorts = [];
  if (excludeDeploymentId) {
    const excludedDeployment = await AppModel.findDeploymentById(excludeDeploymentId, req.params.id, req.session.userId);
    if (excludedDeployment) {
      let deploymentPorts = excludedDeployment.port_mappings;
      if (typeof deploymentPorts === 'string') {
        try {
          deploymentPorts = JSON.parse(deploymentPorts);
        } catch {
          deploymentPorts = [];
        }
      }
      excludedPorts = (deploymentPorts || []).map(p => String(p.host));
    }
  }
  
  // First, check ports that are actually in use on the server (running processes)
  const liveResult = await checkPortsAvailable(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    portNumbers
  );
  
  // Filter out ports that belong to the excluded deployment (the one being edited)
  // These are not real conflicts - they're the deployment's own ports
  liveResult.conflicts = liveResult.conflicts.filter(conflict => {
    const portStr = String(conflict.port);
    return !excludedPorts.includes(portStr);
  });

  // Also check configured ports from other deployments on this server
  const serverDeployments = await AppModel.findDeploymentsByServer(serverId, req.session.userId);
  const configuredConflicts = [];

  for (const deployment of serverDeployments) {
    // Skip the deployment being edited
    if (excludeDeploymentId && deployment.id === excludeDeploymentId) {
      continue;
    }

    // Parse port mappings
    let deploymentPorts = deployment.port_mappings;
    if (typeof deploymentPorts === 'string') {
      try {
        deploymentPorts = JSON.parse(deploymentPorts);
      } catch {
        deploymentPorts = [];
      }
    }
    deploymentPorts = deploymentPorts || [];

    // Check for conflicts with configured ports
    for (const portNum of portNumbers) {
      const hasConflict = deploymentPorts.some(p => String(p.host) === String(portNum));
      if (hasConflict) {
        // Check if this conflict is already in the list
        if (!configuredConflicts.find(c => c.port === portNum)) {
          configuredConflicts.push({
            port: portNum,
            inUse: true,
            details: `Configured for deployment "${deployment.container_name}" (${deployment.status})`
          });
        }
      }
    }
  }

  // Merge live conflicts with configured conflicts
  const allConflicts = [...liveResult.conflicts];
  for (const conflict of configuredConflicts) {
    // Don't duplicate if already found in live check
    if (!allConflicts.find(c => c.port === conflict.port)) {
      allConflicts.push(conflict);
    }
  }

  res.json({
    available: allConflicts.length === 0,
    conflicts: allConflicts
  });
}));

/**
 * GET /api/apps/:appId/deployments
 * Get all deployments for an app
 */
router.get('/:appId/deployments', requireAuth, asyncHandler(async (req, res) => {
  const deployments = await AppModel.findDeployments(req.params.appId, req.session.userId);
  res.json(deployments);
}));

/**
 * DELETE /api/apps/:appId/deployments/:deploymentId
 * Remove a deployment
 * Query param: force=true to skip SSH and just remove from database (for orphaned deployments)
 */
router.delete('/:appId/deployments/:deploymentId', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;
  const forceRemove = req.query.force === 'true';

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // If force remove or server doesn't exist (orphaned), just remove from database
  if (forceRemove || !deployment.ip) {
    await AppModel.removeDeployment(deploymentId);
    return res.json({
      success: true,
      message: 'Deployment record removed from database',
      orphaned: true
    });
  }

  // Stop and remove container via SSH
  const stopCmd = `docker stop ${deployment.container_name} && docker rm ${deployment.container_name}`;
  
  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      stopCmd
    );

    // Remove from database
    await AppModel.removeDeployment(deploymentId);

    res.json({
      success: true,
      message: 'Deployment removed',
      output: stdout
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

/**
 * POST /api/apps/:appId/deployments/:deploymentId/start
 * Start a stopped container
 * If the deployment has config overrides, recreate the container with new settings
 */
router.post('/:appId/deployments/:deploymentId/start', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const containerRef = deployment.container_name || deployment.container_id;
  if (!containerRef) {
    return res.status(400).json({ error: 'No container reference found' });
  }

  // Helper to check if a field has been explicitly set (even if empty)
  // This detects if the deployment has been edited - any non-null value means it was saved
  const hasBeenSet = (val) => {
    return val !== null && val !== undefined;
  };

  // Helper to check if a value has actual content (not empty/null)
  const hasValue = (val) => {
    if (!val) return false;
    if (typeof val === 'string') {
      // Check if it's an empty JSON array/object
      const trimmed = val.trim();
      if (trimmed === '[]' || trimmed === '{}' || trimmed === '') return false;
      return true;
    }
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  };

  // Check if deployment has been edited (any config field explicitly set)
  // This handles the case where user intentionally sets empty config
  const hasBeenEdited = hasBeenSet(deployment.env_vars) || 
    hasBeenSet(deployment.volumes) || hasBeenSet(deployment.restart_policy) || 
    hasBeenSet(deployment.network_mode) || hasBeenSet(deployment.command) || 
    hasBeenSet(deployment.custom_args);

  // Check if deployment has any config overrides that require container recreation
  // This includes all editable fields that could differ from the app defaults
  // Also triggers if the deployment has been edited (even with empty values)
  const hasConfigOverrides = hasBeenEdited || hasValue(deployment.port_mappings) ||
    hasValue(deployment.env_vars) || hasValue(deployment.volumes) || 
    hasValue(deployment.restart_policy) || hasValue(deployment.network_mode) || 
    hasValue(deployment.command) || hasValue(deployment.custom_args);

  try {
    if (hasConfigOverrides) {
      console.log(`[Deployment Start] Recreating container ${containerRef} with config overrides`);
      
      // Need to recreate container with new settings
      const app = await AppModel.findById(appId, req.session.userId);
      if (!app) {
        return res.status(404).json({ error: 'App not found' });
      }

      // Parse JSON fields
      const parseJson = (val) => {
        if (!val) return null;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return null; }
        }
        return val;
      };

      // Stop and remove the existing container
      console.log(`[Deployment Start] Stopping and removing old container...`);
      await connectionManager.executeCommand(
        {
          host: deployment.ip,
          username: deployment.username,
          privateKeyPath: deployment.private_key_path
        },
        `docker stop ${containerRef} 2>/dev/null; docker rm ${containerRef} 2>/dev/null || true`
      );

      // Build merged config (deployment overrides take precedence)
      const portMappings = parseJson(deployment.port_mappings) || parseJson(app.ports) || [];
      const envVars = parseJson(deployment.env_vars) || parseJson(app.env_vars) || [];
      const volumes = parseJson(deployment.volumes) || parseJson(app.volumes) || [];
      const restartPolicy = deployment.restart_policy || app.restart_policy || '';
      const networkMode = deployment.network_mode || app.network_mode || '';
      const command = deployment.command || app.command || '';
      const customArgs = deployment.custom_args || app.custom_args || '';

      // Build docker run command
      let cmd = 'docker run -d';
      
      // Container name (reuse same name)
      cmd += ` --name ${deployment.container_name}`;
      
      // Port mappings
      if (portMappings.length > 0) {
        portMappings.forEach(port => {
          if (port.host && port.container) {
            cmd += ` -p ${port.host}:${port.container}`;
          }
        });
      }
      
      // Environment variables
      if (envVars.length > 0) {
        envVars.forEach(envVar => {
          if (envVar.key && envVar.value) {
            cmd += ` -e "${envVar.key}=${envVar.value}"`;
          }
        });
      }
      
      // Volumes
      if (volumes.length > 0) {
        volumes.forEach(vol => {
          if (vol.host && vol.container) {
            cmd += ` -v ${vol.host}:${vol.container}`;
          }
        });
      }
      
      // Restart policy
      if (restartPolicy) {
        cmd += ` --restart ${restartPolicy}`;
      }
      
      // Network mode
      if (networkMode) {
        cmd += ` --network ${networkMode}`;
      }
      
      // Custom arguments
      if (customArgs && customArgs.trim()) {
        cmd += ` ${customArgs.trim()}`;
      }
      
      // Image
      const image = app.image;
      const tag = app.tag || 'latest';
      const fullImage = app.registry_url 
        ? `${app.registry_url}/${image}:${tag}` 
        : `${image}:${tag}`;
      cmd += ` ${fullImage}`;
      
      // Command override
      if (command) {
        cmd += ` ${command}`;
      }

      console.log(`[Deployment Start] Running command: ${cmd}`);

      // Run the new container
      const { stdout, stderr, code } = await connectionManager.executeCommand(
        {
          host: deployment.ip,
          username: deployment.username,
          privateKeyPath: deployment.private_key_path
        },
        cmd
      );

      if (code === 0) {
        // Extract new container ID
        const newContainerId = stdout.trim().substring(0, 12);
        console.log(`[Deployment Start] Container recreated successfully, new ID: ${newContainerId}`);
        await AppModel.updateDeploymentStatus(deploymentId, 'running', newContainerId);
        res.json({ 
          success: true, 
          message: 'Container recreated with new configuration', 
          output: stdout,
          recreated: true
        });
      } else {
        console.log(`[Deployment Start] Failed to recreate container: ${stderr}`);
        res.status(500).json({ error: stderr || 'Failed to recreate container' });
      }
    } else {
      // Simple start without recreation
      console.log(`[Deployment Start] Simple start for container ${containerRef} (no config overrides)`);
      const { stdout, stderr, code } = await connectionManager.executeCommand(
        {
          host: deployment.ip,
          username: deployment.username,
          privateKeyPath: deployment.private_key_path
        },
        `docker start ${containerRef}`
      );

      if (code === 0) {
        await AppModel.updateDeploymentStatus(deploymentId, 'running');
        res.json({ success: true, message: 'Container started', output: stdout });
      } else {
        res.status(500).json({ error: stderr || 'Failed to start container' });
      }
    }
  } catch (err) {
    console.error(`[Deployment Start] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
}));

/**
 * POST /api/apps/:appId/deployments/:deploymentId/stop
 * Stop a running container
 */
router.post('/:appId/deployments/:deploymentId/stop', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const containerRef = deployment.container_name || deployment.container_id;
  if (!containerRef) {
    return res.status(400).json({ error: 'No container reference found' });
  }

  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      `docker stop ${containerRef}`
    );

    if (code === 0) {
      // Update deployment status in database
      await AppModel.updateDeploymentStatus(deploymentId, 'stopped');
      res.json({ success: true, message: 'Container stopped', output: stdout });
    } else {
      res.status(500).json({ error: stderr || 'Failed to stop container' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

/**
 * GET /api/apps/:appId/deployments/:deploymentId/stats
 * Get deployment stats
 */
router.get('/:appId/deployments/:deploymentId/stats', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Debug log
  console.log('Stats for deployment:', {
    id: deployment.id,
    container_name: deployment.container_name,
    container_id: deployment.container_id,
    server_ip: deployment.ip
  });

  // Use container_id if container_name isn't available
  const containerRef = deployment.container_name || deployment.container_id;
  
  if (!containerRef) {
    return res.json({ error: 'No container reference found', status: 'unknown' });
  }

  const statsCmd = `docker stats ${containerRef} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}"`;

  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path  // Note: DB column is snake_case
      },
      statsCmd
    );

    console.log('Stats command result:', { stdout, stderr, code });

    if (code !== 0 || !stdout.trim()) {
      return res.json({
        error: stderr || 'Container not running',
        status: 'stopped'
      });
    }

    // Parse stats
    const parts = stdout.trim().split('|');
    if (parts.length >= 4) {
      const result = {
        cpu: parts[0],
        memory: parts[1],
        network: parts[2],
        blockIO: parts[3],
        status: 'running'
      };

      // Try to get GPU stats for containers using NVIDIA GPU
      // Uses docker inspect to get container ID, then checks nvidia-smi for processes in that container
      try {
        // Get container ID and check for GPU usage in a single command
        const gpuCheckCmd = `
          CONTAINER_ID=$(docker inspect --format '{{.Id}}' ${containerRef} 2>/dev/null | cut -c1-12)
          if [ -n "$CONTAINER_ID" ] && command -v nvidia-smi &>/dev/null; then
            # Get all GPU processes and check if any belong to this container
            nvidia-smi --query-compute-apps=pid,used_gpu_memory,gpu_name --format=csv,noheader,nounits 2>/dev/null | while IFS=',' read pid mem name; do
              if cat /proc/$pid/cgroup 2>/dev/null | grep -q "$CONTAINER_ID"; then
                echo "$mem|$name"
              fi
            done
          fi
        `;
        const { stdout: gpuOutput } = await connectionManager.executeCommand(
          {
            host: deployment.ip,
            username: deployment.username,
            privateKeyPath: deployment.private_key_path
          },
          gpuCheckCmd
        );

        if (gpuOutput && gpuOutput.trim()) {
          // Sum up GPU memory from all processes in this container
          const lines = gpuOutput.trim().split('\n');
          let totalGpuMem = 0;
          let gpuName = null;
          
          for (const line of lines) {
            const [mem, name] = line.split('|').map(s => s.trim());
            totalGpuMem += parseInt(mem) || 0;
            if (!gpuName && name) gpuName = name;
          }

          if (totalGpuMem > 0 || gpuName) {
            result.gpu = {
              memory_used: totalGpuMem,
              name: gpuName
            };
          }
        }
      } catch (gpuErr) {
        // GPU stats are optional, don't fail if nvidia-smi isn't available
        console.log('GPU stats not available for container:', gpuErr.message);
      }

      res.json(result);
    } else {
      res.json({ error: 'Invalid stats format', status: 'unknown' });
    }
  } catch (err) {
    console.error('Stats error:', err);
    res.json({ error: err.message, status: 'error' });
  }
}));

/**
 * GET /api/apps/:appId/deployments/:deploymentId/logs
 * Get deployment container logs
 */
router.get('/:appId/deployments/:deploymentId/logs', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;
  const { lines = 100 } = req.query;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const containerRef = deployment.container_name || deployment.container_id;
  
  if (!containerRef) {
    return res.json({ error: 'No container reference found', logs: '' });
  }

  const logsCmd = `docker logs ${containerRef} --tail ${lines} 2>&1`;

  try {
    const { stdout, stderr, code } = await connectionManager.executeCommand(
      {
        host: deployment.ip,
        username: deployment.username,
        privateKeyPath: deployment.private_key_path
      },
      logsCmd
    );

    // Docker logs outputs to stderr for error logs, combine both
    const logs = stdout || stderr || 'No logs available';
    res.json({ logs, error: null });
  } catch (err) {
    console.error('Logs error:', err);
    res.json({ error: err.message, logs: '' });
  }
}));

/**
 * PUT /api/apps/:appId/deployments/:deploymentId
 * Update deployment configuration (only when stopped)
 */
router.put('/:appId/deployments/:deploymentId', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  const {
    port_mappings,
    env_vars,
    volumes,
    restart_policy,
    network_mode,
    command,
    custom_args,
    web_ui_port,
    icon,
    icon_url
  } = req.body;

  // Check if this is only an icon update (no container config changes)
  const isIconOnlyUpdate = icon !== undefined && icon_url !== undefined &&
    port_mappings === undefined && env_vars === undefined && volumes === undefined &&
    restart_policy === undefined && network_mode === undefined && 
    command === undefined && custom_args === undefined && web_ui_port === undefined;

  // Only allow editing container config on stopped containers
  if (!isIconOnlyUpdate && deployment.status === 'running') {
    return res.status(400).json({ error: 'Cannot edit a running deployment. Stop the container first.' });
  }

  // Validate port conflicts before saving
  if (port_mappings && Array.isArray(port_mappings) && port_mappings.length > 0) {
    const portNumbers = port_mappings.map(p => p.host).filter(Boolean);
    
    if (portNumbers.length > 0 && deployment.server_id) {
      // Check for port conflicts with other deployments on the same server
      const serverDeployments = await AppModel.findDeploymentsByServer(deployment.server_id, req.session.userId);
      const conflicts = [];

      for (const otherDeployment of serverDeployments) {
        // Skip the current deployment being edited
        if (otherDeployment.id === deploymentId) {
          continue;
        }

        // Parse port mappings
        let otherPorts = otherDeployment.port_mappings;
        if (typeof otherPorts === 'string') {
          try {
            otherPorts = JSON.parse(otherPorts);
          } catch {
            otherPorts = [];
          }
        }
        otherPorts = otherPorts || [];

        // Check for conflicts
        for (const portNum of portNumbers) {
          const hasConflict = otherPorts.some(p => String(p.host) === String(portNum));
          if (hasConflict && !conflicts.includes(portNum)) {
            conflicts.push(portNum);
          }
        }
      }

      if (conflicts.length > 0) {
        return res.status(400).json({ 
          error: `Port(s) ${conflicts.join(', ')} already configured for another deployment on this server` 
        });
      }
    }
  }

  await AppModel.updateDeploymentConfig(deploymentId, {
    port_mappings,
    env_vars,
    volumes,
    restart_policy,
    network_mode,
    command,
    custom_args,
    web_ui_port,
    icon,
    icon_url
  });

  // Log activity
  try {
    await ActivityModel.create(
      req.session.userId,
      'info',
      `Updated deployment configuration for container "${deployment.container_name}"`
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }

  res.json({ success: true, message: 'Deployment configuration updated' });
}));

/**
 * GET /api/apps/:appId/deployments/:deploymentId
 * Get single deployment with full config
 */
router.get('/:appId/deployments/:deploymentId', requireAuth, asyncHandler(async (req, res) => {
  const { appId, deploymentId } = req.params;

  const deployment = await AppModel.findDeploymentById(deploymentId, appId, req.session.userId);
  
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Also get the app to include app-level defaults
  const app = await AppModel.findById(appId, req.session.userId);

  res.json({
    ...deployment,
    app_image: app?.image || null,
    app_tag: app?.tag || 'latest',
    app_config: app ? {
      ports: app.ports,
      env_vars: app.env_vars,
      volumes: app.volumes,
      restart_policy: app.restart_policy,
      network_mode: app.network_mode,
      command: app.command,
      custom_args: app.custom_args
    } : null
  });
}));

module.exports = router;