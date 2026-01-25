/**
 * System Routes - Server update, version, and status management
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const { requireAuth, asyncHandler } = require('../middleware');

const execAsync = promisify(exec);

// Root directory of the project (one level up from backend)
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// GitHub repository info (can be overridden via environment variables)
const GITHUB_REPO = process.env.GITHUB_REPO || 'origin';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

/**
 * In-memory update state tracking
 * Persists across requests but resets on server restart
 */
const updateState = {
  status: 'idle', // 'idle' | 'updating' | 'complete' | 'error'
  logs: [],
  startedAt: null,
  completedAt: null,
  error: null,
  requiresRestart: false,
  newVersion: null,
  newCommit: null
};

/**
 * Update progress stages with percentages
 */
const UPDATE_STAGES = {
  starting: { percent: 0, label: 'Starting update' },
  checking: { percent: 5, label: 'Checking git status' },
  stashing: { percent: 10, label: 'Stashing local changes' },
  pulling: { percent: 20, label: 'Pulling latest changes' },
  rootDeps: { percent: 35, label: 'Installing root dependencies' },
  backendDeps: { percent: 50, label: 'Installing backend dependencies' },
  clientDeps: { percent: 65, label: 'Installing client dependencies' },
  building: { percent: 80, label: 'Building client application' },
  complete: { percent: 100, label: 'Update complete' },
  error: { percent: -1, label: 'Update failed' }
};

/**
 * Helper to add log entry to update state
 */
function addUpdateLog(message, type = 'info', io = null) {
  const logEntry = { 
    message, 
    type, 
    timestamp: new Date().toISOString() 
  };
  updateState.logs.push(logEntry);
  console.log(`[Update] ${message}`);
  
  // Emit to all connected clients
  if (io) {
    io.emit('system-update-progress', logEntry);
  }
}

/**
 * Helper to emit progress stage
 */
function emitProgress(stage, message, io = null) {
  const stageInfo = UPDATE_STAGES[stage] || { percent: 0, label: stage };
  
  if (io) {
    io.emit('system-update-stage', {
      stage,
      percent: stageInfo.percent,
      label: stageInfo.label,
      message,
      timestamp: new Date().toISOString()
    });
  }
  
  addUpdateLog(message || stageInfo.label, 'info', io);
}

/**
 * Get current version and check for updates
 * GET /api/system/version
 */
router.get('/version', requireAuth, asyncHandler(async (req, res) => {
  try {
    // Read current version from package.json
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;

    // Get current git commit hash
    let currentCommit = 'unknown';
    let currentBranch = 'unknown';
    let remoteUrl = 'unknown';
    
    try {
      const { stdout: commitHash } = await execAsync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT });
      currentCommit = commitHash.trim();
      
      const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT });
      currentBranch = branch.trim();
      
      const { stdout: remote } = await execAsync('git config --get remote.origin.url', { cwd: PROJECT_ROOT });
      remoteUrl = remote.trim();
    } catch (gitError) {
      console.warn('Git info not available:', gitError.message);
    }

    // Check for updates by fetching from remote
    let updateAvailable = false;
    let latestCommit = currentCommit;
    let behindBy = 0;

    try {
      // Fetch latest from remote (without merging)
      await execAsync(`git fetch ${GITHUB_REPO} ${GITHUB_BRANCH}`, { cwd: PROJECT_ROOT });
      
      // Get the remote HEAD commit
      const { stdout: remoteHead } = await execAsync(`git rev-parse --short ${GITHUB_REPO}/${GITHUB_BRANCH}`, { cwd: PROJECT_ROOT });
      latestCommit = remoteHead.trim();
      
      // Check how many commits behind
      const { stdout: behindCount } = await execAsync(
        `git rev-list --count HEAD..${GITHUB_REPO}/${GITHUB_BRANCH}`,
        { cwd: PROJECT_ROOT }
      );
      behindBy = parseInt(behindCount.trim(), 10);
      updateAvailable = behindBy > 0;
    } catch (fetchError) {
      console.warn('Could not check for updates:', fetchError.message);
    }

    res.json({
      currentVersion,
      currentCommit,
      currentBranch,
      remoteUrl,
      latestCommit,
      updateAvailable,
      behindBy
    });
  } catch (error) {
    console.error('Error getting version info:', error);
    res.status(500).json({ error: 'Failed to get version information' });
  }
}));

/**
 * Get system status
 * GET /api/system/status
 */
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  // Format uptime
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  let uptimeString = '';
  if (days > 0) uptimeString += `${days}d `;
  if (hours > 0 || days > 0) uptimeString += `${hours}h `;
  if (minutes > 0 || hours > 0 || days > 0) uptimeString += `${minutes}m `;
  uptimeString += `${seconds}s`;

  // Check if running under PM2
  const pm2Running = !!process.env.PM2_HOME || !!process.env.pm_id;

  // Get git status
  let gitStatus = { clean: true, changes: 0 };
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: PROJECT_ROOT });
    const changes = stdout.trim().split('\n').filter(line => line.length > 0);
    gitStatus = {
      clean: changes.length === 0,
      changes: changes.length
    };
  } catch (error) {
    gitStatus = { clean: true, changes: 0, error: 'Git not available' };
  }

  res.json({
    uptime: uptimeString,
    uptimeSeconds: uptime,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    pm2Running,
    memoryUsage: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB'
    },
    gitStatus
  });
}));

/**
 * Get update logs (recent git commits)
 * GET /api/system/changelog
 */
router.get('/changelog', requireAuth, asyncHandler(async (req, res) => {
  try {
    // Fetch to ensure we have latest refs
    await execAsync(`git fetch ${GITHUB_REPO} ${GITHUB_BRANCH}`, { cwd: PROJECT_ROOT }).catch(() => {});
    
    // Get recent commits from remote that we don't have
    const { stdout } = await execAsync(
      `git log --oneline HEAD..${GITHUB_REPO}/${GITHUB_BRANCH} -20`,
      { cwd: PROJECT_ROOT }
    );
    
    const commits = stdout.trim().split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const [hash, ...messageParts] = line.split(' ');
        return { hash, message: messageParts.join(' ') };
      });

    res.json({ commits });
  } catch (error) {
    res.json({ commits: [], error: 'Could not fetch changelog' });
  }
}));

/**
 * Get current update status
 * GET /api/system/update-status
 * Returns the current state of any in-progress or completed update
 */
router.get('/update-status', requireAuth, asyncHandler(async (req, res) => {
  res.json({
    status: updateState.status,
    logs: updateState.logs,
    startedAt: updateState.startedAt,
    completedAt: updateState.completedAt,
    error: updateState.error,
    requiresRestart: updateState.requiresRestart,
    newVersion: updateState.newVersion,
    newCommit: updateState.newCommit
  });
}));

/**
 * Clear update status (reset to idle)
 * POST /api/system/update-status/clear
 */
router.post('/update-status/clear', requireAuth, asyncHandler(async (req, res) => {
  // Only allow clearing if not currently updating
  if (updateState.status === 'updating') {
    return res.status(400).json({ error: 'Cannot clear status while update is in progress' });
  }
  
  updateState.status = 'idle';
  updateState.logs = [];
  updateState.startedAt = null;
  updateState.completedAt = null;
  updateState.error = null;
  updateState.requiresRestart = false;
  updateState.newVersion = null;
  updateState.newCommit = null;
  
  res.json({ success: true, message: 'Update status cleared' });
}));

/**
 * Perform system update (runs in background)
 * POST /api/system/update
 */
router.post('/update', requireAuth, asyncHandler(async (req, res) => {
  const io = req.app.get('io');

  // Prevent multiple concurrent updates
  if (updateState.status === 'updating') {
    return res.status(409).json({ 
      error: 'Update already in progress',
      status: updateState.status
    });
  }

  // Reset update state
  updateState.status = 'updating';
  updateState.logs = [];
  updateState.startedAt = new Date().toISOString();
  updateState.completedAt = null;
  updateState.error = null;
  updateState.requiresRestart = false;
  updateState.newVersion = null;
  updateState.newCommit = null;

  // Respond immediately - update runs in background
  res.json({
    success: true,
    message: 'Update started in background',
    status: 'updating'
  });

  // Run update process in background (not awaited)
  runBackgroundUpdate(io);
}));

/**
 * Background update process
 * Runs asynchronously after initial response
 */
async function runBackgroundUpdate(io) {
  try {
    emitProgress('starting', 'Starting system update...', io);

    // Step 1: Check git status
    emitProgress('checking', 'Checking git status...', io);
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: PROJECT_ROOT });
    
    if (statusOutput.trim().length > 0) {
      emitProgress('stashing', 'Local changes detected. Stashing them...', io);
      await execAsync('git stash', { cwd: PROJECT_ROOT });
      addUpdateLog('Local changes stashed successfully', 'success', io);
    }

    // Step 2: Pull latest changes
    emitProgress('pulling', `Pulling latest changes from ${GITHUB_REPO}/${GITHUB_BRANCH}...`, io);
    const { stdout: pullOutput } = await execAsync(
      `git pull ${GITHUB_REPO} ${GITHUB_BRANCH}`,
      { cwd: PROJECT_ROOT }
    );
    addUpdateLog(pullOutput.trim(), 'output', io);

    // Step 3: Install root dependencies
    emitProgress('rootDeps', 'Installing root dependencies...', io);
    await execAsync('npm install', { cwd: PROJECT_ROOT });
    addUpdateLog('Root dependencies installed', 'success', io);

    // Step 4: Install backend dependencies
    emitProgress('backendDeps', 'Installing backend dependencies...', io);
    const backendPath = path.join(PROJECT_ROOT, 'Backend');
    await execAsync('npm install', { cwd: backendPath });
    addUpdateLog('Backend dependencies installed', 'success', io);

    // Step 5: Install client dependencies
    emitProgress('clientDeps', 'Installing client dependencies...', io);
    const clientPath = path.join(PROJECT_ROOT, 'Client');
    await execAsync('npm install', { cwd: clientPath });
    addUpdateLog('Client dependencies installed', 'success', io);

    // Step 6: Build client (for production)
    emitProgress('building', 'Building client application...', io);
    try {
      await execAsync('npm run build', { cwd: PROJECT_ROOT, timeout: 300000 }); // 5 min timeout
      addUpdateLog('Client build completed', 'success', io);
    } catch (buildError) {
      addUpdateLog('Client build failed (may not be needed for dev mode)', 'warning', io);
    }

    // Step 7: Get new version info
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const { stdout: newCommit } = await execAsync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT });

    // Mark update as complete
    updateState.status = 'complete';
    updateState.completedAt = new Date().toISOString();
    updateState.requiresRestart = true;
    updateState.newVersion = packageJson.version;
    updateState.newCommit = newCommit.trim();

    emitProgress('complete', 'Update completed successfully!', io);
    addUpdateLog('Server restart required to apply changes.', 'warning', io);

    // Emit completion event for modals
    if (io) {
      io.emit('system-update-complete', {
        success: true,
        requiresRestart: true,
        newVersion: updateState.newVersion,
        newCommit: updateState.newCommit,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('[Update] Error:', error);
    updateState.status = 'error';
    updateState.completedAt = new Date().toISOString();
    updateState.error = error.message;

    addUpdateLog(`Update failed: ${error.message}`, 'error', io);

    // Emit error event
    if (io) {
      io.emit('system-update-complete', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Restart the server (requires PM2 or similar process manager)
 * POST /api/system/restart
 */
router.post('/restart', requireAuth, asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  
  // Clear update state since we're restarting
  updateState.status = 'idle';
  updateState.requiresRestart = false;
  
  // Emit restart warning
  if (io) {
    io.emit('system-update-progress', { 
      message: 'Server is restarting...', 
      type: 'warning',
      timestamp: new Date().toISOString()
    });
    io.emit('system-restart', {
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    message: 'Server restart initiated. Please wait...'
  });

  // Give time for response to be sent
  setTimeout(() => {
    console.log('Initiating server restart...');
    
    // Check if running under PM2
    if (process.env.PM2_HOME || process.env.pm_id) {
      // PM2 will automatically restart
      process.exit(0);
    } else {
      // Without PM2, just exit (user needs to restart manually or use a process manager)
      console.log('No process manager detected. Please restart the server manually.');
      process.exit(0);
    }
  }, 1000);
}));

module.exports = router;
