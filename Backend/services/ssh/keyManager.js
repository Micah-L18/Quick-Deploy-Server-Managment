const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { SSH_KEYS_DIR, DEFAULT_SSH_USERNAME } = require('../../config');

/**
 * Supported operating systems for SSH setup
 */
const OS_TYPES = {
  UBUNTU_DEBIAN: 'ubuntu-debian',
  RHEL_CENTOS: 'rhel-centos',
  ALPINE: 'alpine',
  WINDOWS: 'windows'
};

/**
 * OS display names and descriptions
 */
const OS_INFO = {
  [OS_TYPES.UBUNTU_DEBIAN]: {
    name: 'Ubuntu / Debian',
    description: 'Ubuntu, Debian, Linux Mint, Pop!_OS, etc.'
  },
  [OS_TYPES.RHEL_CENTOS]: {
    name: 'RHEL / CentOS / Fedora',
    description: 'Red Hat Enterprise Linux, CentOS, Fedora, Rocky Linux, AlmaLinux'
  },
  [OS_TYPES.ALPINE]: {
    name: 'Alpine Linux',
    description: 'Alpine Linux (uses ash shell and doas)'
  },
  [OS_TYPES.WINDOWS]: {
    name: 'Windows Server (PowerShell)',
    description: 'Windows Server with OpenSSH installed'
  }
};

/**
 * Generate SSH key pair for a server
 * @param {string} serverId - Server ID
 * @param {string} username - Username to create (defaults to NoBase)
 * @param {string} osType - Operating system type
 * @returns {Promise<{privateKeyPath: string, publicKey: string, setupCommand: string, username: string, osType: string}>}
 */
async function generateKeyPair(serverId, username = DEFAULT_SSH_USERNAME, osType = OS_TYPES.UBUNTU_DEBIAN) {
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

    // Generate setup command based on OS type
    const setupCommand = generateSetupCommand(username, trimmedPublicKey, osType);

    return {
      privateKeyPath: keyPath,
      publicKey: trimmedPublicKey,
      setupCommand,
      username,
      osType
    };
  } catch (error) {
    throw new Error(`Failed to generate SSH key: ${error.message}`);
  }
}

/**
 * Generate the setup command based on OS type
 * @param {string} username - Target username
 * @param {string} publicKey - SSH public key
 * @param {string} osType - Operating system type
 * @returns {string} - Setup command to run on the server
 */
function generateSetupCommand(username, publicKey, osType = OS_TYPES.UBUNTU_DEBIAN) {
  switch (osType) {
    case OS_TYPES.UBUNTU_DEBIAN:
      return generateUbuntuDebianSetup(username, publicKey);
    case OS_TYPES.RHEL_CENTOS:
      return generateRhelCentosSetup(username, publicKey);
    case OS_TYPES.ALPINE:
      return generateAlpineSetup(username, publicKey);
    case OS_TYPES.WINDOWS:
      return generateWindowsSetup(username, publicKey);
    default:
      return generateUbuntuDebianSetup(username, publicKey);
  }
}

/**
 * Ubuntu/Debian setup (uses sudo group, apt package manager)
 */
function generateUbuntuDebianSetup(username, publicKey) {
  if (username === 'root') {
    return `mkdir -p ~/.ssh && echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`;
  }

  const commands = [
    `id "${username}" &>/dev/null || useradd -m -s /bin/bash ${username}`,
    `usermod -aG sudo ${username}`,
    `getent group docker &>/dev/null && usermod -aG docker ${username} || true`,
    `echo "${username} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${username}`,
    `chmod 440 /etc/sudoers.d/${username}`,
    `mkdir -p /home/${username}/.ssh`,
    `echo "${publicKey}" >> /home/${username}/.ssh/authorized_keys`,
    `chmod 700 /home/${username}/.ssh`,
    `chmod 600 /home/${username}/.ssh/authorized_keys`,
    `chown -R ${username}:${username} /home/${username}/.ssh`,
    `echo "User ${username} configured successfully"`
  ];
  return commands.join(' && ');
}

/**
 * RHEL/CentOS/Fedora setup (uses wheel group, yum/dnf package manager)
 */
function generateRhelCentosSetup(username, publicKey) {
  if (username === 'root') {
    return `mkdir -p ~/.ssh && echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`;
  }

  const commands = [
    `id "${username}" &>/dev/null || useradd -m -s /bin/bash ${username}`,
    `usermod -aG wheel ${username}`,
    `getent group docker &>/dev/null && usermod -aG docker ${username} || true`,
    `echo "${username} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${username}`,
    `chmod 440 /etc/sudoers.d/${username}`,
    `mkdir -p /home/${username}/.ssh`,
    `echo "${publicKey}" >> /home/${username}/.ssh/authorized_keys`,
    `chmod 700 /home/${username}/.ssh`,
    `chmod 600 /home/${username}/.ssh/authorized_keys`,
    `chown -R ${username}:${username} /home/${username}/.ssh`,
    `restorecon -R /home/${username}/.ssh 2>/dev/null || true`,
    `echo "User ${username} configured successfully"`
  ];
  return commands.join(' && ');
}

/**
 * Alpine Linux setup (uses doas instead of sudo, ash shell, adduser/addgroup)
 */
function generateAlpineSetup(username, publicKey) {
  if (username === 'root') {
    return `mkdir -p ~/.ssh && echo "${publicKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`;
  }

  const commands = [
    `id "${username}" 2>/dev/null || adduser -D -s /bin/ash ${username}`,
    `addgroup ${username} wheel 2>/dev/null || true`,
    `addgroup ${username} docker 2>/dev/null || true`,
    `apk add --no-cache doas 2>/dev/null || true`,
    `mkdir -p /etc/doas.d`,
    `echo "permit nopass ${username}" > /etc/doas.d/${username}.conf`,
    `chmod 400 /etc/doas.d/${username}.conf`,
    `mkdir -p /home/${username}/.ssh`,
    `echo "${publicKey}" >> /home/${username}/.ssh/authorized_keys`,
    `chmod 700 /home/${username}/.ssh`,
    `chmod 600 /home/${username}/.ssh/authorized_keys`,
    `chown -R ${username}:${username} /home/${username}/.ssh`,
    `echo "User ${username} configured successfully"`
  ];
  return commands.join(' && ');
}

/**
 * Windows Server PowerShell setup (uses OpenSSH)
 * Note: Users in Administrators group MUST use administrators_authorized_keys
 * Regular users use their own .ssh/authorized_keys
 */
function generateWindowsSetup(username, publicKey) {
  // For built-in Administrator account - just add the key
  if (username.toLowerCase() === 'administrator') {
    return `$authKeys = "$env:ProgramData\\ssh\\administrators_authorized_keys"; ` +
      `New-Item -ItemType Directory -Path (Split-Path $authKeys) -Force -ErrorAction SilentlyContinue; ` +
      `Add-Content -Path $authKeys -Value '${publicKey}'; ` +
      `icacls $authKeys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"; ` +
      `Write-Host "Administrator SSH key configured successfully"`;
  }

  // For custom users (like NoBase) - create user, add to Admins, use administrators_authorized_keys
  // Windows OpenSSH requires admin users to use the shared administrators_authorized_keys file
  const commands = [
    `$u = "${username}"`,
    // Create user if doesn't exist
    `if (!(Get-LocalUser -Name $u -ErrorAction SilentlyContinue)) { ` +
      `$p = ConvertTo-SecureString -String ([System.Guid]::NewGuid().ToString()) -AsPlainText -Force; ` +
      `New-LocalUser -Name $u -Password $p -PasswordNeverExpires -Description "SSH management user" }`,
    // Add to Administrators group (required for management)
    `Add-LocalGroupMember -Group "Administrators" -Member $u -ErrorAction SilentlyContinue`,
    // For admin users, we MUST use administrators_authorized_keys (not user's .ssh folder)
    `$authKeys = "$env:ProgramData\\ssh\\administrators_authorized_keys"`,
    `New-Item -ItemType Directory -Path (Split-Path $authKeys) -Force -ErrorAction SilentlyContinue`,
    `Add-Content -Path $authKeys -Value '${publicKey}'`,
    // Fix permissions - only Administrators and SYSTEM can access this file
    `icacls $authKeys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"`,
    `Write-Host "User $u configured with admin SSH key successfully"`
  ];
  return commands.join('; ');
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
  keyPairExists,
  OS_TYPES,
  OS_INFO
};
