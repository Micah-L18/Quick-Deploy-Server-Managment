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
 * Perform system update
 * POST /api/system/update
 */
router.post('/update', requireAuth, asyncHandler(async (req, res) => {
  const { io } = req.app.get('io') || {};
  const sessionId = req.session?.id || 'unknown';

  // Helper to emit progress
  const emitProgress = (message, type = 'info') => {
    console.log(`[Update] ${message}`);
    if (io) {
      io.emit('system-update-progress', { message, type, timestamp: new Date().toISOString() });
    }
  };

  try {
    emitProgress('Starting system update...', 'info');

    // Step 1: Check git status
    emitProgress('Checking git status...', 'info');
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: PROJECT_ROOT });
    
    if (statusOutput.trim().length > 0) {
      emitProgress('Warning: You have local changes. Stashing them...', 'warning');
      await execAsync('git stash', { cwd: PROJECT_ROOT });
    }

    // Step 2: Pull latest changes
    emitProgress(`Pulling latest changes from ${GITHUB_REPO}/${GITHUB_BRANCH}...`, 'info');
    const { stdout: pullOutput } = await execAsync(
      `git pull ${GITHUB_REPO} ${GITHUB_BRANCH}`,
      { cwd: PROJECT_ROOT }
    );
    emitProgress(pullOutput.trim(), 'output');

    // Step 3: Install root dependencies
    emitProgress('Installing root dependencies...', 'info');
    const { stdout: rootInstall } = await execAsync('npm install', { cwd: PROJECT_ROOT });
    emitProgress('Root dependencies installed', 'success');

    // Step 4: Install backend dependencies
    emitProgress('Installing backend dependencies...', 'info');
    const backendPath = path.join(PROJECT_ROOT, 'Backend');
    await execAsync('npm install', { cwd: backendPath });
    emitProgress('Backend dependencies installed', 'success');

    // Step 5: Install client dependencies
    emitProgress('Installing client dependencies...', 'info');
    const clientPath = path.join(PROJECT_ROOT, 'Client');
    await execAsync('npm install', { cwd: clientPath });
    emitProgress('Client dependencies installed', 'success');

    // Step 6: Build client (for production)
    emitProgress('Building client application...', 'info');
    try {
      await execAsync('npm run build', { cwd: clientPath, timeout: 300000 }); // 5 min timeout
      emitProgress('Client build completed', 'success');
    } catch (buildError) {
      emitProgress('Client build failed (may not be needed for dev mode)', 'warning');
    }

    // Step 7: Get new version info
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const { stdout: newCommit } = await execAsync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT });

    emitProgress('Update completed successfully!', 'success');
    emitProgress('Server restart required to apply changes.', 'warning');

    res.json({
      success: true,
      message: 'Update completed. Restart required.',
      newVersion: packageJson.version,
      newCommit: newCommit.trim(),
      requiresRestart: true
    });

  } catch (error) {
    emitProgress(`Update failed: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * Restart the server (requires PM2 or similar process manager)
 * POST /api/system/restart
 */
router.post('/restart', requireAuth, asyncHandler(async (req, res) => {
  const { io } = req.app.get('io') || {};
  
  // Emit restart warning
  if (io) {
    io.emit('system-update-progress', { 
      message: 'Server is restarting...', 
      type: 'warning',
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
