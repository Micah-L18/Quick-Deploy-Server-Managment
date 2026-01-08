const { ServerModel, AppModel } = require('../models');

/**
 * Check if user owns a server
 * @param {string} serverId - Server ID
 * @param {string} userId - User ID
 * @returns {Promise<{server?: Object, error?: string, status?: number}>}
 */
async function checkServerOwnership(serverId, userId) {
  const server = await ServerModel.findById(serverId);
  
  if (!server) {
    return { error: 'Server not found', status: 404 };
  }
  
  if (server.userId && server.userId !== userId) {
    return { error: 'Access denied', status: 403 };
  }
  
  return { server };
}

/**
 * Check if user owns an app
 * @param {string} appId - App ID
 * @param {string} userId - User ID
 * @returns {Promise<{app?: Object, error?: string, status?: number}>}
 */
async function checkAppOwnership(appId, userId) {
  const app = await AppModel.findById(appId, userId);
  
  if (!app) {
    return { error: 'App not found', status: 404 };
  }
  
  return { app };
}

/**
 * Middleware to verify server ownership
 * Attaches server to req.server
 */
function requireServerOwnership(req, res, next) {
  const serverId = req.params.id || req.params.serverId;
  
  checkServerOwnership(serverId, req.session.userId)
    .then(result => {
      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }
      req.server = result.server;
      next();
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
}

/**
 * Middleware to verify app ownership
 * Attaches app to req.app
 */
function requireAppOwnership(req, res, next) {
  const appId = req.params.id || req.params.appId;
  
  checkAppOwnership(appId, req.session.userId)
    .then(result => {
      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }
      req.app = result.app;
      next();
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
}

module.exports = {
  checkServerOwnership,
  checkAppOwnership,
  requireServerOwnership,
  requireAppOwnership
};
