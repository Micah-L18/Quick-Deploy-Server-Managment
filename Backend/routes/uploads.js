const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth, asyncHandler } = require('../middleware');
const storageService = require('../services/storage/storageService');

// Configure multer for icon uploads
const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for icons
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, SVG)'));
    }
  }
});

/**
 * POST /api/uploads/icons
 * Upload an icon file
 */
router.post('/icons', requireAuth, iconUpload.single('icon'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No icon file uploaded' });
  }

  try {
    // Save icon and get URL
    const iconUrl = await storageService.saveIcon(req.file.buffer, req.file.originalname);

    res.json({
      success: true,
      iconUrl,
      filename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype
    });
  } catch (err) {
    console.error('Icon upload error:', err);
    res.status(500).json({ error: `Failed to upload icon: ${err.message}` });
  }
}));

/**
 * DELETE /api/uploads/icons
 * Delete an icon file
 */
router.delete('/icons', requireAuth, asyncHandler(async (req, res) => {
  const { iconUrl } = req.body;

  if (!iconUrl) {
    return res.status(400).json({ error: 'Icon URL is required' });
  }

  try {
    const deleted = await storageService.deleteIcon(iconUrl);

    if (deleted) {
      res.json({ success: true, message: 'Icon deleted successfully' });
    } else {
      res.status(404).json({ error: 'Icon not found' });
    }
  } catch (err) {
    console.error('Icon deletion error:', err);
    res.status(500).json({ error: `Failed to delete icon: ${err.message}` });
  }
}));

/**
 * GET /api/uploads/storage-info
 * Get storage statistics
 */
router.get('/storage-info', requireAuth, asyncHandler(async (req, res) => {
  try {
    const info = await storageService.getStorageInfo();
    res.json(info);
  } catch (err) {
    console.error('Storage info error:', err);
    res.status(500).json({ error: `Failed to get storage info: ${err.message}` });
  }
}));

/**
 * GET /api/uploads/icons
 * Get list of all uploaded icons
 */
router.get('/icons', requireAuth, asyncHandler(async (req, res) => {
  try {
    const icons = await storageService.listIcons();
    res.json(icons);
  } catch (err) {
    console.error('List icons error:', err);
    res.status(500).json({ error: `Failed to list icons: ${err.message}` });
  }
}));

module.exports = router;
