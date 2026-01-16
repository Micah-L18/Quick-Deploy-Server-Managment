const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { SSH_KEYS_DIR, DEFAULT_SSH_USERNAME } = require('../../config');

/**
 * Generate SSH key pair for a server
 * @param {string} serverId - Server ID
 * @param {string} username - Username to create (defaults to nobase)
 * @returns {Promise<{privateKeyPath: string, publicKey: string, setupCommand: string, username: string}>}
 */
async function generateKeyPair(serverId, username = DEFAULT_SSH_USERNAME) {
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

    // Generate setup command based on username
    const setupCommand = generateSetupCommand(username, trimmedPublicKey);

    return {
      privateKeyPath: keyPath,
      publicKey: trimmedPublicKey,
      setupCommand,
      username
    };
  } catch (error) {
    throw new Error(`Failed to generate SSH key: ${error.message}`);
  }
}

/**
 * Generate the setup command to configure SSH access on the server
 * Creates user with passwordless sudo if using non-root user
 * @param {string} username - Target username
 * @param {string} publicKey - SSH public key
 * @returns {string} - Setup command to run on the server
 */
function generateSetupCommand(username, publicKey) {
  if (username === 'root') {
    // Simple root setup - just add key to authorized_keys
    return `mkdir -p ~/.ssh && echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`;
  }

  // Non-root user setup - single line command chain for easy copy/paste
  // Creates user, configures sudo, sets up SSH key
  const commands = [
    // Create user if doesn't exist
    `id "${username}" &>/dev/null || useradd -m -s /bin/bash ${username}`,
    // Add user to sudo group
    `usermod -aG sudo ${username}`,
    // Add user to docker group if it exists
    `getent group docker &>/dev/null && usermod -aG docker ${username} || true`,
    // Configure passwordless sudo for the user
    `echo "${username} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${username}`,
    `chmod 440 /etc/sudoers.d/${username}`,
    // Set up SSH directory and key
    `mkdir -p /home/${username}/.ssh`,
    `echo "${publicKey}" >> /home/${username}/.ssh/authorized_keys`,
    `chmod 700 /home/${username}/.ssh`,
    `chmod 600 /home/${username}/.ssh/authorized_keys`,
    `chown -R ${username}:${username} /home/${username}/.ssh`,
    // Success message
    `echo "User ${username} configured successfully with passwordless sudo"`
  ];

  return commands.join(' && ');
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
  generateSetupCommand,
  deleteKeyPair,
  readPrivateKey,
  readPublicKey,
  keyPairExists
};
