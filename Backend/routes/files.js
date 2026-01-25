const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, asyncHandler, checkServerOwnership } = require('../middleware');
const { sftpService } = require('../services/ssh');

// Configure multer for file uploads (store in memory for transfer to remote server)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

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
    // Use smart listing that auto-elevates for protected paths
    const items = await sftpService.listDirectorySmart(
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

  // Use smart read that auto-elevates for protected files
  const content = await sftpService.readFileSmart(
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

  // Use smart write that auto-elevates for protected files
  await sftpService.writeFileSmart(
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
  const socketId = req.query.socketId;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const serverConfig = {
    host: server.ip,
    username: server.username,
    privateKeyPath: server.privateKeyPath
  };

  // Create job ID
  const jobId = `delete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const fileName = filePath.split('/').pop();

  // Get socket.io instance
  const io = req.app.get('io');

  try {
    console.log(`Delete request for ${isDirectory ? 'directory' : 'file'}: ${filePath}`);
    
    // Emit initial progress
    if (socketId && io) {
      io.to(socketId).emit('file-operation-progress', {
        jobId,
        type: 'Deleting',
        fileName,
        serverName: server.name,
        percent: 0,
        stage: 'in-progress',
        message: `Deleting ${fileName}...`
      });
    }

    if (isDirectory) {
      await sftpService.deleteDirectory(serverConfig, filePath);
    } else {
      await sftpService.deleteFile(serverConfig, filePath);
    }

    // Emit completion
    if (socketId && io) {
      io.to(socketId).emit('file-operation-complete', {
        jobId
      });
    }

    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Delete operation failed:', error);
    
    // Emit error
    if (socketId && io) {
      io.to(socketId).emit('file-operation-error', {
        jobId,
        error: error.message
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to delete file/directory',
      path: filePath 
    });
  }
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

/**
 * POST /api/servers/:id/files/upload
 * Upload a file to the remote server
 */
router.post('/:id/files/upload', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const remotePath = req.body.path;
  const socketId = req.query.socketId;

  if (!remotePath) {
    return res.status(400).json({ error: 'Remote path is required' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const jobId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const io = req.app.get('io');

  try {
    // Emit initial progress
    if (socketId && io) {
      io.to(socketId).emit('file-operation-progress', {
        jobId,
        type: 'Uploading',
        fileName: req.file.originalname,
        serverName: server.name,
        percent: 0,
        stage: 'in-progress',
        message: `Uploading ${req.file.originalname}...`
      });
    }

    // Upload file from buffer to remote server
    await sftpService.uploadFileFromBuffer(
      {
        host: server.ip,
        username: server.username,
        privateKeyPath: server.privateKeyPath
      },
      req.file.buffer,
      remotePath
    );

    // Emit completion
    if (socketId && io) {
      io.to(socketId).emit('file-operation-complete', {
        jobId
      });
    }

    res.json({ 
      success: true, 
      path: remotePath,
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    console.error('File upload error:', err);
    
    // Emit error
    if (socketId && io) {
      io.to(socketId).emit('file-operation-error', {
        jobId,
        error: err.message
      });
    }
    
    res.status(500).json({ error: `Failed to upload file: ${err.message}` });
  }
}));

/**
 * POST /api/servers/:id/files/upload-multiple
 * Upload multiple files to the remote server (for folder uploads)
 */
router.post('/:id/files/upload-multiple', requireAuth, upload.any(), asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const basePath = req.body.basePath || '';
  const socketId = req.query.socketId;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const jobId = `upload-multiple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const io = req.app.get('io');
  const totalFiles = req.files.length;

  try {
    const results = [];
    const errors = [];

    // Emit initial progress
    if (socketId && io) {
      io.to(socketId).emit('file-operation-progress', {
        jobId,
        type: 'Uploading',
        fileName: `${totalFiles} files`,
        serverName: server.name,
        percent: 0,
        stage: 'in-progress',
        message: `Uploading ${totalFiles} files...`
      });
    }

    // Ensure base directory exists if basePath is provided
    if (basePath) {
      try {
        const pathParts = basePath.split('/').filter(p => p);
        let currentPath = '';
        for (const part of pathParts) {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          try {
            await sftpService.createDirectory(
              {
                host: server.ip,
                username: server.username,
                privateKeyPath: server.privateKeyPath
              },
              currentPath
            );
          } catch (mkdirErr) {
            // Ignore if directory already exists
            if (!mkdirErr.message.includes('exist') && !mkdirErr.message.includes('Failure')) {
              console.warn(`Warning creating directory ${currentPath}:`, mkdirErr.message);
            }
          }
        }
      } catch (basePathErr) {
        console.error('Error ensuring base path exists:', basePathErr);
        // Continue anyway - the directory might already exist
      }
    }

    // Process files sequentially to avoid overwhelming the server
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        // Get the relative path from the file's webkitRelativePath or fallback to name
        // The originalname contains the full relative path like "folderName/subfolder/file.txt"
        const fullRelativePath = file.originalname;
        
        // Strip the root folder name since it's already in basePath
        // For example: "myfolder/subfolder/file.txt" -> "subfolder/file.txt"
        const pathParts = fullRelativePath.split('/');
        const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : pathParts[0];
        
        const remotePath = basePath ? `${basePath}/${relativePath}` : relativePath;

        // Emit progress for current file
        if (socketId && io) {
          const percent = Math.round((i / totalFiles) * 100);
          io.to(socketId).emit('file-operation-progress', {
            jobId,
            type: 'Uploading',
            fileName: `${i + 1}/${totalFiles}: ${file.originalname}`,
            serverName: server.name,
            percent,
            stage: 'in-progress',
            message: `Uploading ${file.originalname}...`
          });
        }

        // Create directory if needed (extract directory from path)
        const dirPath = remotePath.substring(0, remotePath.lastIndexOf('/'));
        if (dirPath && dirPath !== basePath) {
          try {
            // Create directory recursively by splitting path and creating each level
            const pathParts = dirPath.split('/').filter(p => p);
            let currentPath = '';
            for (const part of pathParts) {
              currentPath = currentPath ? `${currentPath}/${part}` : part;
              try {
                await sftpService.createDirectory(
                  {
                    host: server.ip,
                    username: server.username,
                    privateKeyPath: server.privateKeyPath
                  },
                  currentPath
                );
              } catch (mkdirErr) {
                // Ignore if directory already exists
                if (!mkdirErr.message.includes('exist')) {
                  throw mkdirErr;
                }
              }
            }
          } catch (dirErr) {
            // Continue even if directory creation fails (might already exist)
          }
        }

        // Upload the file
        await sftpService.uploadFileFromBuffer(
          {
            host: server.ip,
            username: server.username,
            privateKeyPath: server.privateKeyPath
          },
          file.buffer,
          remotePath
        );

        results.push({ path: remotePath, success: true });
      } catch (fileErr) {
        errors.push({ 
          filename: file.originalname, 
          error: fileErr.message 
        });
      }
    }

    // Emit completion
    if (socketId && io) {
      io.to(socketId).emit('file-operation-complete', {
        jobId
      });
    }

    res.json({ 
      success: true,
      uploaded: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (err) {
    console.error('Multiple file upload error:', err);
    
    // Emit error
    if (socketId && io) {
      io.to(socketId).emit('file-operation-error', {
        jobId,
        error: err.message
      });
    }
    
    res.status(500).json({ error: `Failed to upload files: ${err.message}` });
  }
}));

/**
 * GET /api/servers/:id/files/download
 * Download a file from the remote server
 */
router.get('/:id/files/download', requireAuth, asyncHandler(async (req, res) => {
  const check = await checkServerOwnership(req.params.id, req.session.userId);
  if (check.error) {
    return res.status(check.status).json({ error: check.error });
  }

  const server = check.server;
  const remotePath = req.query.path;

  if (!remotePath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  try {
    // Get file stats first
    const stats = await sftpService.getFileStats(
      {
        host: server.ip,
        username: server.username,
        privateKeyPath: server.privateKeyPath
      },
      remotePath
    );

    if (stats.isDirectory) {
      return res.status(400).json({ error: 'Cannot download directories. Path must be a file.' });
    }

    // Download file to buffer
    const fileBuffer = await sftpService.downloadFileToBuffer(
      {
        host: server.ip,
        username: server.username,
        privateKeyPath: server.privateKeyPath
      },
      remotePath
    );

    // Set headers for file download
    const filename = remotePath.split('/').pop();
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileBuffer.length);

    res.send(fileBuffer);
  } catch (err) {
    console.error('File download error:', err);
    res.status(500).json({ error: `Failed to download file: ${err.message}` });
  }
}));

module.exports = router;
