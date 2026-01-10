const express = require('express');
const router = express.Router();
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { sftpService } = require('../services/ssh');

/**
 * GET /api/servers/:id/files
 * List directory contents
 */
router.get('/:id/files', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const dirPath = req.query.path || '/';

  try {
    // Try SFTP first
    const items = await sftpService.listDirectory(
      {
        host: server.ip,
        username: server.username,
        privateKeyPath: server.privateKeyPath
      },
      dirPath
    );

    res.json({
      path: dirPath,
      items
    });
  } catch (err) {
    // Fallback to ls command
    try {
      const files = await sftpService.listFilesViaCommand(
        {
          host: server.ip,
          username: server.username,
          privateKeyPath: server.privateKeyPath
        },
        dirPath
      );

      res.json({
        path: dirPath,
        items: files
      });
    } catch (fallbackErr) {
      res.status(500).json({ error: fallbackErr.message });
    }
  }
}));

/**
 * GET /api/servers/:id/files/read
 * Read file contents
 */
router.get('/:id/files/read', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const content = await sftpService.readFile(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    filePath
  );

  res.json({
    path: filePath,
    content
  });
}));

/**
 * GET /api/servers/:id/files/search
 * Search for files
 */
router.get('/:id/files/search', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const query = req.query.q;
  const searchPath = req.query.path || '/';

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const results = await sftpService.searchFiles(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    query,
    searchPath
  );

  res.json({
    query,
    path: searchPath,
    results
  });
}));

/**
 * PUT /api/servers/:id/files/write
 * Write file contents
 */
router.put('/:id/files/write', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const { path: filePath, content } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  await sftpService.writeFile(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    filePath,
    content || ''
  );

  res.json({ success: true, path: filePath });
}));

/**
 * GET /api/servers/:id/files/stats
 * Get file stats
 */
router.get('/:id/files/stats', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const stats = await sftpService.getFileStats(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    filePath
  );

  res.json(stats);
}));

/**
 * POST /api/servers/:id/files/mkdir
 * Create directory
 */
router.post('/:id/files/mkdir', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const { path: dirPath } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'Directory path is required' });
  }

  await sftpService.createDirectory(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    dirPath
  );

  res.json({ success: true, path: dirPath });
}));

/**
 * DELETE /api/servers/:id/files
 * Delete file or directory
 */
router.delete('/:id/files', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const filePath = req.query.path;
  const isDirectory = req.query.isDirectory === 'true';

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const serverConfig = {
    host: server.ip,
    username: server.username,
    privateKeyPath: server.privateKeyPath
  };

  if (isDirectory) {
    await sftpService.deleteDirectory(serverConfig, filePath);
  } else {
    await sftpService.deleteFile(serverConfig, filePath);
  }

  res.json({ success: true, path: filePath });
}));

/**
 * POST /api/servers/:id/files/rename
 * Rename/move file or directory
 */
router.post('/:id/files/rename', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const { oldPath, newPath } = req.body;

  if (!oldPath || !newPath) {
    return res.status(400).json({ error: 'Both old and new paths are required' });
  }

  await sftpService.rename(
    {
      host: server.ip,
      username: server.username,
      privateKeyPath: server.privateKeyPath
    },
    oldPath,
    newPath
  );

  res.json({ success: true, oldPath, newPath });
}));

module.exports = router;
