const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { SSH_KEYS_DIR } = require('../../config');

/**
 * Generate SSH key pair for a server
 * @param {string} serverId - Server ID
 * @returns {Promise<{privateKeyPath: string, publicKey: string, setupCommand: string}>}
 */
async function generateKeyPair(serverId) {
  const keyPath = path.join(SSH_KEYS_DIR, `server_${serverId}`);
  const publicKeyPath = `${keyPath}.pub`;

  try {
    // Ensure SSH keys directory exists
    await fs.mkdir(SSH_KEYS_DIR, { recursive: true });

    // Generate SSH key pair using ssh-keygen
    await execPromise(
      `ssh-keygen -t rsa -b 4096 -f "${keyPath}" -N "" -C "neo-multi-server-${serverId}"`
    );

    // Read the public key
    const publicKey = await fs.readFile(publicKeyPath, 'utf-8');
    const trimmedPublicKey = publicKey.trim();

    return {
      privateKeyPath: keyPath,
      publicKey: trimmedPublicKey,
      setupCommand: `echo "${trimmedPublicKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
    };
  } catch (error) {
    throw new Error(`Failed to generate SSH key: ${error.message}`);
  }
}

/**
 * Delete SSH key pair for a server
 * @param {string} privateKeyPath - Path to private key
 * @returns {Promise<void>}
 */
async function deleteKeyPair(privateKeyPath) {
  try {
    await fs.unlink(privateKeyPath);
    await fs.unlink(`${privateKeyPath}.pub`);
  } catch (err) {
    // Keys might already be deleted, ignore errors
    console.warn(`Could not delete SSH keys at ${privateKeyPath}:`, err.message);
  }
}

/**
 * Read a private key
 * @param {string} privateKeyPath - Path to private key
 * @returns {Promise<string>}
 */
async function readPrivateKey(privateKeyPath) {
  return fs.readFile(privateKeyPath, 'utf-8');
}

/**
 * Read a public key
 * @param {string} privateKeyPath - Path to private key (will append .pub)
 * @returns {Promise<string>}
 */
async function readPublicKey(privateKeyPath) {
  return fs.readFile(`${privateKeyPath}.pub`, 'utf-8');
}

/**
 * Check if SSH key pair exists
 * @param {string} privateKeyPath - Path to private key
 * @returns {Promise<boolean>}
 */
async function keyPairExists(privateKeyPath) {
  try {
    await fs.access(privateKeyPath);
    await fs.access(`${privateKeyPath}.pub`);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  generateKeyPair,
  deleteKeyPair,
  readPrivateKey,
  readPublicKey,
  keyPairExists
};
