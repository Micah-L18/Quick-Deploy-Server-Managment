const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Cache for templates
let templatesCache = null;
let cacheTime = 0;
const CACHE_DURATION = 60000; // 1 minute cache

/**
 * Load and parse templates from YAML file
 */
function loadTemplates() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (templatesCache && (now - cacheTime) < CACHE_DURATION) {
    return templatesCache;
  }
  
  try {
    const templatesPath = path.join(__dirname, '../templates/templates.yaml');
    const fileContents = fs.readFileSync(templatesPath, 'utf8');
    const data = yaml.load(fileContents);
    
    templatesCache = data.templates || [];
    cacheTime = now;
    
    return templatesCache;
  } catch (error) {
    console.error('Failed to load templates:', error);
    return [];
  }
}

/**
 * Get category metadata
 */
function getCategoryInfo() {
  const categoryMeta = {
    'databases': { name: 'Databases', icon: '🗄️', order: 1 },
    'web-servers': { name: 'Web Servers', icon: '🌐', order: 2 },
    'game-servers': { name: 'Game Servers', icon: '🎮', order: 3 },
    'development': { name: 'Development', icon: '💻', order: 4 },
    'monitoring': { name: 'Monitoring', icon: '📊', order: 5 },
    'media': { name: 'Media', icon: '🎬', order: 6 },
    'utilities': { name: 'Utilities', icon: '🔧', order: 7 },
  };
  
  const templates = loadTemplates();
  const categoryCounts = {};
  
  templates.forEach(t => {
    categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
  });
  
  return Object.entries(categoryMeta)
    .map(([id, meta]) => ({
      id,
      name: meta.name,
      icon: meta.icon,
      order: meta.order,
      count: categoryCounts[id] || 0
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => a.order - b.order);
}

/**
 * GET /api/templates
 * Get all templates with optional category filter
 */
router.get('/', (req, res) => {
  try {
    const templates = loadTemplates();
    const categories = getCategoryInfo();
    
    // Optional category filter
    const { category } = req.query;
    let filteredTemplates = templates;
    
    if (category) {
      filteredTemplates = templates.filter(t => t.category === category);
    }
    
    res.json({
      templates: filteredTemplates,
      categories
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

/**
 * GET /api/templates/:id
 * Get a single template by ID
 */
router.get('/:id', (req, res) => {
  try {
    const templates = loadTemplates();
    const template = templates.find(t => t.id === req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to load template' });
  }
});

module.exports = router;
