const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../database/connection');

/**
 * Get all apps for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function findAll(userId) {
  return all(
    'SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
}

/**
 * Get orphaned apps (apps with no active deployments)
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function findOrphaned(userId) {
  return all(
    `SELECT a.* FROM apps a
     LEFT JOIN app_deployments ad ON a.id = ad.app_id
     WHERE a.user_id = ? AND ad.id IS NULL
     ORDER BY a.created_at DESC`,
    [userId]
  );
}

/**
 * Get app by ID
 * @param {string} appId - App ID
 * @param {string} userId - User ID (for ownership verification)
 * @returns {Promise<Object|null>}
 */
async function findById(appId, userId = null) {
  if (userId) {
    return get('SELECT * FROM apps WHERE id = ? AND user_id = ?', [appId, userId]);
  }
  return get('SELECT * FROM apps WHERE id = ?', [appId]);
}

/**
 * Create a new app
 * @param {string} userId - User ID
 * @param {string} name - App name
 * @param {string|null} description - App description
 * @returns {Promise<Object>}
 */
async function create(userId, name, description = null) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  await run(
    'INSERT INTO apps (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, userId, name, description, createdAt]
  );

  return { id, name, description, created_at: createdAt };
}

/**
 * Update an app
 * @param {string} appId - App ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function update(appId, updates) {
  const fields = [];
  const values = [];

  // Basic fields
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  
  // Docker configuration fields
  if (updates.image !== undefined) {
    fields.push('image = ?');
    values.push(updates.image);
  }
  if (updates.tag !== undefined) {
    fields.push('tag = ?');
    values.push(updates.tag);
  }
  if (updates.ports !== undefined) {
    fields.push('ports = ?');
    values.push(JSON.stringify(updates.ports));
  }
  if (updates.env_vars !== undefined) {
    fields.push('env_vars = ?');
    values.push(JSON.stringify(updates.env_vars));
  }
  if (updates.volumes !== undefined) {
    fields.push('volumes = ?');
    values.push(JSON.stringify(updates.volumes));
  }
  if (updates.restart_policy !== undefined) {
    fields.push('restart_policy = ?');
    values.push(updates.restart_policy);
  }
  if (updates.network_mode !== undefined) {
    fields.push('network_mode = ?');
    values.push(updates.network_mode);
  }
  if (updates.command !== undefined) {
    fields.push('command = ?');
    values.push(updates.command);
  }
  if (updates.custom_args !== undefined) {
    fields.push('custom_args = ?');
    values.push(updates.custom_args);
  }
  
  // Registry fields
  if (updates.registry_url !== undefined) {
    fields.push('registry_url = ?');
    values.push(updates.registry_url);
  }
  if (updates.registry_username !== undefined) {
    fields.push('registry_username = ?');
    values.push(updates.registry_username);
  }
  if (updates.registry_password !== undefined) {
    fields.push('registry_password = ?');
    values.push(updates.registry_password);
  }
  
  // Web UI configuration
  if (updates.web_ui_port !== undefined) {
    fields.push('web_ui_port = ?');
    values.push(updates.web_ui_port || null);
  }
  
  // Icon fields
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    values.push(updates.icon);
  }
  if (updates.icon_url !== undefined) {
    fields.push('icon_url = ?');
    values.push(updates.icon_url);
  }

  if (fields.length === 0) return;

  values.push(appId);
  await run(`UPDATE apps SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * Delete an app
 * @param {string} appId - App ID
 * @param {string} userId - User ID (for ownership verification)
 * @returns {Promise<number>}
 */
async function remove(appId, userId) {
  const result = await run(
    'DELETE FROM apps WHERE id = ? AND user_id = ?',
    [appId, userId]
  );
  return result.changes;
}

// ==================== Deployment Functions ====================

/**
 * Get all deployments for an app
 * @param {string} appId - App ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function findDeployments(appId, userId) {
  const rows = await all(`
    SELECT 
      d.*,
      s.name as server_name,
      s.ip as server_ip,
      a.name as app_name
    FROM app_deployments d
    LEFT JOIN servers s ON d.server_id = s.id
    LEFT JOIN apps a ON d.app_id = a.id
    WHERE d.app_id = ? AND a.user_id = ?
    ORDER BY d.deployed_at DESC
  `, [appId, userId]);

  return rows;
}

/**
 * Get deployment by ID
 * @param {string} deploymentId - Deployment ID
 * @param {string} appId - App ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
async function findDeploymentById(deploymentId, appId, userId) {
  return get(`
    SELECT d.*, s.ip, s.username, s.private_key_path, a.user_id
    FROM app_deployments d
    LEFT JOIN servers s ON d.server_id = s.id
    LEFT JOIN apps a ON d.app_id = a.id
    WHERE d.id = ? AND d.app_id = ? AND a.user_id = ?
  `, [deploymentId, appId, userId]);
}

/**
 * Get deployment by ID only (simpler version)
 * @param {string} deploymentId - Deployment ID
 * @returns {Promise<Object|null>}
 */
async function findDeploymentByIdSimple(deploymentId) {
  return get(`
    SELECT d.*, s.ip, s.username, s.private_key_path, a.user_id, a.name as app_name, a.volumes
    FROM app_deployments d
    LEFT JOIN servers s ON d.server_id = s.id
    LEFT JOIN apps a ON d.app_id = a.id
    WHERE d.id = ?
  `, [deploymentId]);
}

/**
 * Create a deployment
 * @param {Object} deployment - Deployment data
 * @returns {Promise<Object>}
 */
async function createDeployment(deployment) {
  const id = uuidv4();
  const deployedAt = new Date().toISOString();
  const portMappingsJson = deployment.portMappings 
    ? JSON.stringify(deployment.portMappings) 
    : null;

  await run(`
    INSERT INTO app_deployments (id, app_id, server_id, container_id, container_name, status, port_mappings, deployed_at, icon, icon_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    deployment.appId,
    deployment.serverId,
    deployment.containerId || null,
    deployment.containerName || null,
    deployment.status,
    portMappingsJson,
    deployedAt,
    deployment.icon || null,
    deployment.iconUrl || null
  ]);

  return { id, ...deployment, deployed_at: deployedAt };
}

/**
 * Update deployment status
 * @param {string} deploymentId - Deployment ID
 * @param {string} status - New status
 * @param {string|null} containerId - Container ID
 * @returns {Promise<void>}
 */
async function updateDeploymentStatus(deploymentId, status, containerId = null) {
  if (containerId) {
    await run(
      'UPDATE app_deployments SET status = ?, container_id = ? WHERE id = ?',
      [status, containerId, deploymentId]
    );
  } else {
    await run('UPDATE app_deployments SET status = ? WHERE id = ?', [status, deploymentId]);
  }
}

/**
 * Delete a deployment
 * @param {string} deploymentId - Deployment ID
 * @returns {Promise<number>}
 */
async function removeDeployment(deploymentId) {
  const result = await run('DELETE FROM app_deployments WHERE id = ?', [deploymentId]);
  return result.changes;
}

/**
 * Update deployment configuration (for stopped containers)
 * @param {string} deploymentId - Deployment ID
 * @param {Object} config - Configuration overrides
 * @returns {Promise<void>}
 */
async function updateDeploymentConfig(deploymentId, config) {
  const fields = [];
  const values = [];

  if (config.port_mappings !== undefined) {
    fields.push('port_mappings = ?');
    values.push(JSON.stringify(config.port_mappings));
  }
  if (config.env_vars !== undefined) {
    fields.push('env_vars = ?');
    values.push(JSON.stringify(config.env_vars));
  }
  if (config.volumes !== undefined) {
    fields.push('volumes = ?');
    values.push(JSON.stringify(config.volumes));
  }
  if (config.restart_policy !== undefined) {
    fields.push('restart_policy = ?');
    values.push(config.restart_policy);
  }
  if (config.network_mode !== undefined) {
    fields.push('network_mode = ?');
    values.push(config.network_mode);
  }
  if (config.command !== undefined) {
    fields.push('command = ?');
    values.push(config.command);
  }
  if (config.custom_args !== undefined) {
    fields.push('custom_args = ?');
    values.push(config.custom_args);
  }
  if (config.web_ui_port !== undefined) {
    fields.push('web_ui_port = ?');
    values.push(config.web_ui_port || null);
  }
  if (config.icon !== undefined) {
    fields.push('icon = ?');
    values.push(config.icon);
  }
  if (config.icon_url !== undefined) {
    fields.push('icon_url = ?');
    values.push(config.icon_url);
  }
  if (config.nickname !== undefined) {
    fields.push('nickname = ?');
    values.push(config.nickname || null);
  }

  if (fields.length === 0) return;

  values.push(deploymentId);
  await run(`UPDATE app_deployments SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * Get all deployments across all apps for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function findAllDeployments(userId) {
  const rows = await all(`
    SELECT 
      d.*,
      s.name as server_name,
      s.ip as server_ip,
      a.name as app_name,
      a.image as app_image,
      a.tag as app_tag,
      a.web_ui_port,
      d.icon as app_icon,
      d.icon_url as app_icon_url
    FROM app_deployments d
    LEFT JOIN servers s ON d.server_id = s.id
    LEFT JOIN apps a ON d.app_id = a.id
    WHERE a.user_id = ?
    ORDER BY d.deployed_at DESC
  `, [userId]);

  return rows;
}

/**
 * Get all deployments for a specific server
 * @param {string} serverId - Server ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function findDeploymentsByServer(serverId, userId) {
  const rows = await all(`
    SELECT 
      d.id,
      d.app_id,
      d.container_name,
      d.port_mappings,
      d.status
    FROM app_deployments d
    LEFT JOIN apps a ON d.app_id = a.id
    WHERE d.server_id = ? AND a.user_id = ?
  `, [serverId, userId]);

  return rows;
}

module.exports = {
  findAll,
  findById,
  findOrphaned,
  create,
  update,
  remove,
  findDeployments,
  findDeploymentById,
  findDeploymentByIdSimple,
  createDeployment,
  updateDeploymentStatus,
  updateDeploymentConfig,
  removeDeployment,
  findAllDeployments,
  findDeploymentsByServer
};
