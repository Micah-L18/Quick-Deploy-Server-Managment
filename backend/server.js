const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { Client } = require('ssh2');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3044'],
    credentials: true,
    methods: ['GET', 'POST']
  }
});

const PORT = 3044;
const DB_FILE = path.join(__dirname, 'servers.db');
const SSH_KEYS_DIR = path.join(__dirname, 'ssh_keys');

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3044'],
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: 'neobase-secret-key-' + crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Database setup
const db = new sqlite3.Database(DB_FILE);

// Initialize storage
async function initStorage() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Create servers table
        db.run(`
          CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT,
            region TEXT,
            ip TEXT NOT NULL,
            username TEXT NOT NULL,
            private_key_path TEXT NOT NULL,
            public_key TEXT NOT NULL,
            setup_command TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            error TEXT,
            added_at TEXT NOT NULL,
            last_checked TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Create activities table
          db.run(`
            CREATE TABLE IF NOT EXISTS activities (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              type TEXT NOT NULL,
              message TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id)
            )
          `, (err) => {
            if (err) {
              console.error('Error creating activities table:', err);
              reject(err);
              return;
            }
            
            // Create apps table
            db.run(`
              CREATE TABLE IF NOT EXISTS apps (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
              )
            `, (err) => {
              if (err) {
                console.error('Error creating apps table:', err);
                reject(err);
                return;
              }
              
              // Create server_metrics table for historical data
              db.run(`
                CREATE TABLE IF NOT EXISTS server_metrics (
                  id TEXT PRIMARY KEY,
                  server_id TEXT NOT NULL,
                  cpu_usage REAL,
                  cpu_load_1min REAL,
                  cpu_load_5min REAL,
                  cpu_load_15min REAL,
                  memory_used INTEGER,
                  memory_total INTEGER,
                  memory_percentage INTEGER,
                  disk_percentage INTEGER,
                  timestamp TEXT NOT NULL,
                  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
                )
              `, (err) => {
                if (err) {
                  console.error('Error creating server_metrics table:', err);
                  reject(err);
                  return;
                }
                
                // Add new columns to server_metrics table if they don't exist
                const newColumns = [
                  { name: 'cpu_cores', type: 'INTEGER' },
                  { name: 'cpu_model', type: 'TEXT' },
                  { name: 'memory_free', type: 'INTEGER' },
                  { name: 'disk_total', type: 'INTEGER' },
                  { name: 'disk_used', type: 'INTEGER' },
                  { name: 'disk_available', type: 'INTEGER' },
                  { name: 'os', type: 'TEXT' },
                  { name: 'hostname', type: 'TEXT' },
                  { name: 'uptime', type: 'INTEGER' }
                ];
                
                let columnsAdded = 0;
                newColumns.forEach((column, index) => {
                  db.run(`ALTER TABLE server_metrics ADD COLUMN ${column.name} ${column.type}`, (alterErr) => {
                    // Ignore error if column already exists
                    if (alterErr && !alterErr.message.includes('duplicate column')) {
                      console.error(`Error adding column ${column.name}:`, alterErr);
                    } else if (!alterErr) {
                      console.log(`Added column ${column.name} to server_metrics table`);
                    }
                    
                    columnsAdded++;
                    if (columnsAdded === newColumns.length) {
                      // Continue with migrations
                      completeMigrations();
                    }
                  });
                });
              });
              
              function completeMigrations() {
                // Add columns if they don't exist (migration for existing databases)
                db.run(`ALTER TABLE servers ADD COLUMN name TEXT`, (err) => {
                  // Ignore error if column exists
                  db.run(`ALTER TABLE servers ADD COLUMN region TEXT`, (err) => {
                    // Ignore error if column exists
                    db.run(`ALTER TABLE servers ADD COLUMN user_id TEXT`, (err) => {
                      // Ignore error if column exists
                      resolve();
                    });
                  });
                });
              }
            });
          });
        });
      });
    });
  });
  
  // Ensure SSH keys directory exists
  try {
    await fs.access(SSH_KEYS_DIR);
  } catch {
    await fs.mkdir(SSH_KEYS_DIR, { recursive: true });
  }
}

// Load servers from database
async function loadServers(userId = null) {
  return new Promise((resolve, reject) => {
    const query = userId 
      ? 'SELECT * FROM servers WHERE user_id = ? ORDER BY added_at DESC'
      : 'SELECT * FROM servers ORDER BY added_at DESC';
    const params = userId ? [userId] : [];
    
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Convert snake_case to camelCase for compatibility with frontend
        const servers = rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          region: row.region,
          ip: row.ip,
          username: row.username,
          // Resolve relative path to absolute path at runtime, or use as-is if already absolute
          privateKeyPath: path.isAbsolute(row.private_key_path) 
            ? row.private_key_path 
            : path.join(__dirname, row.private_key_path),
          publicKey: row.public_key,
          setupCommand: row.setup_command,
          status: row.status,
          error: row.error,
          addedAt: row.added_at,
          lastChecked: row.last_checked
        }));
        resolve(servers);
      }
    });
  });
}

// Save/update a server in database
async function saveServer(server) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO servers 
      (id, user_id, name, region, ip, username, private_key_path, public_key, setup_command, status, error, added_at, last_checked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      server.id,
      server.userId || null,
      server.name || null,
      server.region || null,
      server.ip,
      server.username,
      server.privateKeyPath,
      server.publicKey,
      server.setupCommand,
      server.status,
      server.error || null,
      server.addedAt,
      server.lastChecked || null
    ], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

// Delete a server from database (also removes SSH keys)
async function deleteServer(serverId) {
  // First, get the server to find the SSH key path
  const server = await getServer(serverId);
  
  if (server && server.privateKeyPath) {
    // Delete the private key file
    try {
      await fs.promises.unlink(server.privateKeyPath);
      console.log(`Deleted private key: ${server.privateKeyPath}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Failed to delete private key: ${err.message}`);
      }
    }
    
    // Delete the public key file (.pub)
    try {
      await fs.promises.unlink(server.privateKeyPath + '.pub');
      console.log(`Deleted public key: ${server.privateKeyPath}.pub`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Failed to delete public key: ${err.message}`);
      }
    }
  }
  
  // Delete from database
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM servers WHERE id = ?', [serverId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

// Get a single server from database
async function getServer(serverId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM servers WHERE id = ?', [serverId], (err, row) => {
      if (err) {
        reject(err);
      } else if (!row) {
        resolve(null);
      } else {
        resolve({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          region: row.region,
          ip: row.ip,
          username: row.username,
          // Resolve relative path to absolute path at runtime, or use as-is if already absolute
          privateKeyPath: path.isAbsolute(row.private_key_path) 
            ? row.private_key_path 
            : path.join(__dirname, row.private_key_path),
          publicKey: row.public_key,
          setupCommand: row.setup_command,
          status: row.status,
          error: row.error,
          addedAt: row.added_at,
          lastChecked: row.last_checked
        });
      }
    });
  });
}

// Generate SSH key pair for a server
async function generateSSHKey(serverId) {
  const keyPath = path.join(SSH_KEYS_DIR, `server_${serverId}`);
  const publicKeyPath = `${keyPath}.pub`;
  
  try {
    // Generate SSH key pair using ssh-keygen
    await execPromise(
      `ssh-keygen -t rsa -b 4096 -f "${keyPath}" -N "" -C "neo-multi-server-${serverId}"`
    );
    
    // Read the public key
    const publicKey = await fs.readFile(publicKeyPath, 'utf-8');
    
    return {
      // Store relative path to ssh_keys directory (portable)
      privateKeyPath: `ssh_keys/server_${serverId}`,
      publicKey: publicKey.trim(),
      setupCommand: `sudo su -c 'mkdir -p /root/.ssh && chmod 700 /root/.ssh && echo "${publicKey.trim()}" >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys'`
    };
  } catch (error) {
    throw new Error(`Failed to generate SSH key: ${error.message}`);
  }
}

// Test SSH connection to a server
async function testSSHConnection(host, username, privateKeyPath) {
  return new Promise((resolve) => {
    const conn = new Client();
    let connected = false;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        conn.end();
        resolve({ status: 'offline', error: 'Connection timeout' });
      }
    }, 10000); // 10 second timeout
    
    conn.on('ready', () => {
      connected = true;
      clearTimeout(timeout);
      conn.end();
      resolve({ status: 'online' });
    }).on('error', (err) => {
      connected = true;
      clearTimeout(timeout);
      resolve({ status: 'offline', error: err.message });
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// SFTP - List directory contents
async function listDirectory(host, username, privateKeyPath, dirPath = '/') {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        sftp.readdir(dirPath, (err, list) => {
          conn.end();
          
          if (err) {
            return reject(err);
          }
          
          const items = list.map(item => ({
            name: item.filename,
            type: item.longname.startsWith('d') ? 'directory' : 'file',
            size: item.attrs.size,
            permissions: item.attrs.mode,
            modified: item.attrs.mtime * 1000, // Convert to milliseconds
            isDirectory: item.longname.startsWith('d'),
            isFile: !item.longname.startsWith('d')
          }));
          
          resolve(items);
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// SFTP - Read file contents
async function readFile(host, username, privateKeyPath, filePath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        sftp.readFile(filePath, 'utf8', (err, data) => {
          conn.end();
          
          if (err) {
            return reject(err);
          }
          
          resolve(data);
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// SFTP - Get file stats
async function getFileStats(host, username, privateKeyPath, filePath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        sftp.stat(filePath, (err, stats) => {
          conn.end();
          
          if (err) {
            return reject(err);
          }
          
          resolve({
            size: stats.size,
            modified: stats.mtime * 1000,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile()
          });
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// SFTP - Write file contents
async function writeFile(host, username, privateKeyPath, filePath, content) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        sftp.writeFile(filePath, content, 'utf8', (err) => {
          conn.end();
          
          if (err) {
            return reject(err);
          }
          
          resolve({ success: true, path: filePath });
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// Recursive file search
async function searchFiles(host, username, privateKeyPath, searchPath, query, maxResults = 100) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      // Use find command for recursive search with maxdepth to prevent infinite loops
      // Output format: type|path (d for directory, f for file)
      const escapedQuery = query.replace(/'/g, "'\\''");
      const command = `find "${searchPath}" -maxdepth 10 \\( -iname "*${escapedQuery}*" -type f -printf "f|%p\\n" \\) -o \\( -iname "*${escapedQuery}*" -type d -printf "d|%p\\n" \\) 2>/dev/null | head -n ${maxResults}`;
      
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        let output = '';
        
        stream.on('close', (code, signal) => {
          conn.end();
          
          if (code !== 0 && output.trim() === '') {
            return resolve([]);
          }
          
          const lines = output.trim().split('\n').filter(p => p);
          resolve(lines.map(line => {
            // Parse format: type|path
            const pipeIndex = line.indexOf('|');
            const type = pipeIndex > 0 ? line.substring(0, pipeIndex) : 'f';
            const filePath = pipeIndex > 0 ? line.substring(pipeIndex + 1) : line;
            
            return {
              path: filePath,
              name: filePath.split('/').pop(),
              directory: filePath.substring(0, filePath.lastIndexOf('/')) || '/',
              isDirectory: type === 'd'
            };
          }));
        }).on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          // Ignore stderr for now (permission denied, etc.)
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// Detect OS distribution and version
async function detectOS(host, username, privateKeyPath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      const command = `
        if [ -f /etc/os-release ]; then
          cat /etc/os-release
        elif [ -f /etc/lsb-release ]; then
          cat /etc/lsb-release
        else
          uname -a
        fi
      `;
      
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        }).on('close', () => {
          conn.end();
          
          const osInfo = {};
          const lines = output.split('\n');
          
          lines.forEach(line => {
            const match = line.match(/^(\w+)="?([^"]+)"?$/);
            if (match) {
              osInfo[match[1]] = match[2];
            }
          });
          
          // Determine OS type and package manager
          let osType = 'unknown';
          let packageManager = 'unknown';
          
          if (osInfo.ID || osInfo.DISTRIB_ID) {
            const id = (osInfo.ID || osInfo.DISTRIB_ID).toLowerCase();
            
            if (id.includes('ubuntu') || id.includes('debian')) {
              osType = 'debian';
              packageManager = 'apt';
            } else if (id.includes('centos') || id.includes('rhel') || id.includes('fedora')) {
              osType = 'redhat';
              packageManager = 'yum';
            } else if (id.includes('arch')) {
              osType = 'arch';
              packageManager = 'pacman';
            } else if (id.includes('alpine')) {
              osType = 'alpine';
              packageManager = 'apk';
            }
          }
          
          resolve({
            id: osInfo.ID || osInfo.DISTRIB_ID || 'unknown',
            name: osInfo.NAME || osInfo.DISTRIB_DESCRIPTION || 'Unknown',
            version: osInfo.VERSION || osInfo.DISTRIB_RELEASE || 'unknown',
            versionId: osInfo.VERSION_ID || osInfo.DISTRIB_RELEASE || 'unknown',
            prettyName: osInfo.PRETTY_NAME || osInfo.DISTRIB_DESCRIPTION || 'Unknown OS',
            osType,
            packageManager,
            raw: osInfo
          });
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// Check service status
async function checkServiceStatus(host, username, privateKeyPath, serviceName) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      // Check if service is actually installed by looking for systemd unit file or checking package
      const command = `
        # Check if service unit exists or package is installed
        if command -v systemctl &> /dev/null; then
          if systemctl list-unit-files ${serviceName}.service 2>/dev/null | grep -q "${serviceName}.service"; then
            echo "INSTALLED"
            systemctl is-active ${serviceName} 2>/dev/null && echo "ACTIVE" || echo "INACTIVE"
            systemctl is-enabled ${serviceName} 2>/dev/null && echo "ENABLED" || echo "DISABLED"
          else
            echo "NOT_INSTALLED"
            echo "INACTIVE"
            echo "DISABLED"
          fi
        elif command -v service &> /dev/null; then
          if service ${serviceName} status &> /dev/null || [ -f /etc/init.d/${serviceName} ]; then
            echo "INSTALLED"
            service ${serviceName} status &> /dev/null && echo "ACTIVE" || echo "INACTIVE"
            echo "UNKNOWN"
          else
            echo "NOT_INSTALLED"
            echo "INACTIVE"
            echo "UNKNOWN"
          fi
        else
          echo "NO_MANAGER"
          echo "INACTIVE"
          echo "UNKNOWN"
        fi
      `;
      
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        }).on('close', () => {
          conn.end();
          
          const lines = output.trim().split('\n');
          const installStatus = lines[0] || 'NOT_INSTALLED';
          const activeStatus = lines[1] || 'INACTIVE';
          const enabledStatus = lines[2] || 'DISABLED';
          
          resolve({
            service: serviceName,
            installed: installStatus === 'INSTALLED',
            active: activeStatus === 'ACTIVE',
            enabled: enabledStatus === 'ENABLED',
            installStatus,
            activeStatus,
            enabledStatus
          });
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// Install service
async function installService(host, username, privateKeyPath, serviceName, osInfo) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      let installCommand = '';
      
      // Detect if we need sudo (check if running as root)
      const sudoPrefix = `if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; else SUDO=""; fi && `;
      
      // Get installation command based on service and OS
      if (serviceName === 'docker') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `
            # Add Docker's official GPG key
            $SUDO apt update && \
            $SUDO apt install -y ca-certificates curl && \
            $SUDO install -m 0755 -d /etc/apt/keyrings && \
            $SUDO curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
            $SUDO chmod a+r /etc/apt/keyrings/docker.asc && \
            # Add the repository to Apt sources
            echo "Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: \$(. /etc/os-release && echo "\${UBUNTU_CODENAME:-\$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc" | $SUDO tee /etc/apt/sources.list.d/docker.sources > /dev/null && \
            $SUDO apt update && \
            $SUDO apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
            $SUDO systemctl start docker && \
            $SUDO systemctl enable docker
          `;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `
            $SUDO yum install -y yum-utils && \
            $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo && \
            $SUDO yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
            $SUDO systemctl start docker && \
            $SUDO systemctl enable docker
          `;
        }
      } else if (serviceName === 'nginx') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `$SUDO apt update && $SUDO apt install -y nginx && $SUDO systemctl start nginx && $SUDO systemctl enable nginx`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `$SUDO yum install -y nginx && $SUDO systemctl start nginx && $SUDO systemctl enable nginx`;
        }
      } else if (serviceName === 'nodejs') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash - && $SUDO apt install -y nodejs`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash - && $SUDO yum install -y nodejs`;
        }
      } else if (serviceName === 'postgresql') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `$SUDO apt update && $SUDO apt install -y postgresql postgresql-contrib && $SUDO systemctl start postgresql && $SUDO systemctl enable postgresql`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `$SUDO yum install -y postgresql-server postgresql-contrib && $SUDO postgresql-setup initdb && $SUDO systemctl start postgresql && $SUDO systemctl enable postgresql`;
        }
      } else if (serviceName === 'redis') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `$SUDO apt update && $SUDO apt install -y redis-server && $SUDO systemctl start redis-server && $SUDO systemctl enable redis-server`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `$SUDO yum install -y redis && $SUDO systemctl start redis && $SUDO systemctl enable redis`;
        }
      }
      
      if (!installCommand) {
        conn.end();
        return reject(new Error(`Installation not supported for ${serviceName} on ${osInfo.packageManager}`));
      }
      
      conn.exec(installCommand, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        let output = '';
        let errorOutput = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          errorOutput += data.toString();
        }).on('close', (code) => {
          conn.end();
          
          if (code !== 0) {
            return reject(new Error(`Installation failed with code ${code}: ${errorOutput}`));
          }
          
          resolve({
            service: serviceName,
            installed: true,
            output: output,
            message: `${serviceName} installed successfully`
          });
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// Manage service (start, stop, restart, enable, disable)
async function manageService(host, username, privateKeyPath, serviceName, action) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      // Detect if we need sudo
      const sudoCheck = `if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; else SUDO=""; fi && `;
      let command = '';
      
      if (['start', 'stop', 'restart'].includes(action)) {
        command = sudoCheck + `$SUDO systemctl ${action} ${serviceName}`;
      } else if (action === 'enable') {
        command = sudoCheck + `$SUDO systemctl enable ${serviceName}`;
      } else if (action === 'disable') {
        command = sudoCheck + `$SUDO systemctl disable ${serviceName}`;
      } else {
        conn.end();
        return reject(new Error(`Invalid action: ${action}`));
      }
      
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        let output = '';
        let errorOutput = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          errorOutput += data.toString();
        }).on('close', (code) => {
          conn.end();
          
          if (code !== 0) {
            return reject(new Error(`Action failed: ${errorOutput}`));
          }
          
          resolve({
            service: serviceName,
            action: action,
            success: true,
            message: `${serviceName} ${action} completed successfully`
          });
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host,
      port: 22,
      username,
      privateKey: require('fs').readFileSync(privateKeyPath),
      readyTimeout: 10000
    });
  });
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
}

// Check server ownership
async function checkServerOwnership(serverId, userId) {
  const server = await getServer(serverId);
  if (!server) {
    return { error: 'Server not found', status: 404 };
  }
  if (server.userId && server.userId !== userId) {
    return { error: 'Access denied', status: 403 };
  }
  return { server };
}

// User management functions
async function createUser(email, password, name) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = Date.now().toString();
  
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (id, email, password, name, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, email, hashedPassword, name, new Date().toISOString()],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: userId, email, name });
        }
      }
    );
  });
}

async function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

async function getUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, email, name, created_at FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// API Routes

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    // Check if user already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const user = await createUser(email, password, name);
    req.session.userId = user.id;
    
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user.id;
    
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all servers
app.get('/api/servers', requireAuth, async (req, res) => {
  try {
    const servers = await loadServers(req.session.userId);
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check status of all servers (must come before /:id routes)
app.get('/api/servers/status/all', requireAuth, async (req, res) => {
  try {
    const servers = await loadServers(req.session.userId);
    const statusPromises = servers.map(async (server) => {
      const result = await testSSHConnection(server.ip, server.username, server.privateKeyPath);
      return {
        id: server.id,
        status: result.status,
        error: result.error
      };
    });
    
    const statuses = await Promise.all(statusPromises);
    
    // Update all servers in storage
    for (let i = 0; i < servers.length; i++) {
      servers[i].status = statuses[i].status;
      servers[i].lastChecked = new Date().toISOString();
      if (statuses[i].error) {
        servers[i].error = statuses[i].error;
      } else {
        servers[i].error = null;
      }
      await saveServer(servers[i]);
    }
    
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single server by ID
app.get('/api/servers/:id', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    res.json(check.server);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update server details
app.put('/api/servers/:id', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const { name, region } = req.body;
    
    // Update only the fields that are provided
    if (name !== undefined) server.name = name || null;
    if (region !== undefined) server.region = region || null;
    
    await saveServer(server);
    
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new server
app.post('/api/servers', requireAuth, async (req, res) => {
  try {
    const { name, region, ip, username } = req.body;
    
    if (!ip || !username) {
      return res.status(400).json({ error: 'IP address and username are required' });
    }
    
    const serverId = Date.now().toString();
    
    // Generate SSH key for this server
    const keyInfo = await generateSSHKey(serverId);
    
    const newServer = {
      id: serverId,
      userId: req.session.userId,
      name: name || null,
      region: region || null,
      ip,
      username,
      privateKeyPath: keyInfo.privateKeyPath,
      publicKey: keyInfo.publicKey,
      setupCommand: keyInfo.setupCommand,
      status: 'pending',
      addedAt: new Date().toISOString()
    };
    
    await saveServer(newServer);
    
    // Log activity
    try {
      await logActivity(
        req.session.userId,
        'success',
        `Server ${name || ip} added successfully`
      );
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
    
    res.json(newServer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check connection status for a specific server
app.get('/api/servers/:id/status', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const result = await testSSHConnection(server.ip, server.username, server.privateKeyPath);
    
    // Update server status in storage
    server.status = result.status;
    server.lastChecked = new Date().toISOString();
    if (result.error) {
      server.error = result.error;
    } else {
      server.error = null;
    }
    
    await saveServer(server);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a server
app.delete('/api/servers/:id', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    
    // Remove SSH keys
    try {
      await fs.unlink(server.privateKeyPath);
      await fs.unlink(`${server.privateKeyPath}.pub`);
    } catch (err) {
      // Keys might already be deleted
    }
    
    await deleteServer(req.params.id);
    
    // Log activity
    try {
      await logActivity(
        req.session.userId,
        'error',
        `Server ${server.name || server.ip} removed`
      );
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activities endpoints

// Helper function to log activity
function logActivity(userId, type, message) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    db.run(
      'INSERT INTO activities (id, user_id, type, message, timestamp) VALUES (?, ?, ?, ?, ?)',
      [id, userId, type, message, timestamp],
      (err) => {
        if (err) {
          console.error('Error logging activity:', err);
          reject(err);
        } else {
          resolve({ id, type, message, timestamp });
        }
      }
    );
  });
}

// Get recent activities
app.get('/api/activities', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    db.all(
      'SELECT * FROM activities WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
      [req.session.userId, limit],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new activity
app.post('/api/activities', requireAuth, async (req, res) => {
  try {
    const { type, message } = req.body;
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    console.log('Inserting activity:', { id, userId: req.session.userId, type, message, timestamp });
    
    db.run(
      'INSERT INTO activities (id, user_id, type, message, timestamp) VALUES (?, ?, ?, ?, ?)',
      [id, req.session.userId, type, message, timestamp],
      (err) => {
        if (err) {
          console.error('Error inserting activity:', err);
          return res.status(500).json({ error: err.message });
        }
        res.json({ id, type, message, timestamp });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apps endpoints

// Get all apps for user
app.get('/api/apps', requireAuth, async (req, res) => {
  try {
    db.all(
      'SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single app
app.get('/api/apps/:id', requireAuth, async (req, res) => {
  try {
    db.get(
      'SELECT * FROM apps WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId],
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (!row) {
          return res.status(404).json({ error: 'App not found' });
        }
        res.json(row);
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new app
app.post('/api/apps', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'App name is required' });
    }
    
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    
    db.run(
      'INSERT INTO apps (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, req.session.userId, name, description || null, createdAt],
      async (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Log activity
        try {
          await logActivity(
            req.session.userId,
            'success',
            `App "${name}" created`
          );
        } catch (err) {
          console.error('Failed to log activity:', err);
        }
        
        res.json({ id, name, description, created_at: createdAt });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete app
app.delete('/api/apps/:id', requireAuth, async (req, res) => {
  try {
    // First get the app to log its name
    db.get(
      'SELECT * FROM apps WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId],
      async (err, app) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        if (!app) {
          return res.status(404).json({ error: 'App not found' });
        }
        
        db.run(
          'DELETE FROM apps WHERE id = ? AND user_id = ?',
          [req.params.id, req.session.userId],
          async (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            
            // Log activity
            try {
              await logActivity(
                req.session.userId,
                'error',
                `App "${app.name}" deleted`
              );
            } catch (err) {
              console.error('Failed to log activity:', err);
            }
            
            res.json({ success: true });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File browser endpoints

// List directory contents
app.get('/api/servers/:id/files', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const dirPath = req.query.path || '/';
    const items = await listDirectory(server.ip, server.username, server.privateKeyPath, dirPath);
    
    res.json({
      path: dirPath,
      items: items.sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read file contents
app.get('/api/servers/:id/files/read', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const content = await readFile(server.ip, server.username, server.privateKeyPath, filePath);
    
    res.json({
      path: filePath,
      content: content
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Write file contents
app.post('/api/servers/:id/files/write', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const { path: filePath, content } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    if (content === undefined) {
      return res.status(400).json({ error: 'File content is required' });
    }
    
    const result = await writeFile(server.ip, server.username, server.privateKeyPath, filePath, content);
    
    res.json({
      success: true,
      path: filePath,
      message: 'File saved successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get file stats
app.get('/api/servers/:id/files/stats', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const stats = await getFileStats(server.ip, server.username, server.privateKeyPath, filePath);
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search files recursively
app.get('/api/servers/:id/files/search', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const query = req.query.q;
    const searchPath = req.query.path || '/home';
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const results = await searchFiles(server.ip, server.username, server.privateKeyPath, searchPath, query);
    
    res.json({
      query: query,
      searchPath: searchPath,
      results: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List files in directory
app.get('/api/servers/:id/files', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const dirPath = req.query.path || '/';
    
    console.log(`Listing files for server ${server.ip} at path: ${dirPath}`);
    
    const files = await listFiles(server.ip, server.username, server.privateKeyPath, dirPath);
    
    res.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: error.message });
  }
});

// List files in directory via SSH
async function listFiles(ip, username, privateKeyPath, dirPath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      // Use simple ls -la for maximum compatibility
      const command = `ls -la "${dirPath}" 2>&1`;
      
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        let output = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.on('close', (code) => {
          conn.end();
          
          if (output.includes('cannot access') || output.includes('No such file')) {
            return reject(new Error('Directory not found or permission denied'));
          }
          
          try {
            const lines = output.trim().split('\n');
            const files = [];
            
            // Skip first line (total) and parse ls -la output
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              // Parse ls -la format: permissions links owner group size month day time/year name
              const parts = line.split(/\s+/);
              if (parts.length < 9) continue;
              
              const permissions = parts[0];
              const size = parseInt(parts[4]) || 0;
              // Name is everything from index 8 onwards (handles spaces in filenames)
              const name = parts.slice(8).join(' ');
              
              // Skip . and ..
              if (name === '.' || name === '..') continue;
              
              const isDirectory = permissions.startsWith('d');
              const fullPath = dirPath.endsWith('/') 
                ? dirPath + name 
                : dirPath + '/' + name;
              
              files.push({
                name,
                path: fullPath,
                isDirectory,
                permissions,
                size: isDirectory ? 0 : size,
                modified: Date.now(), // Use current time since parsing dates is complex
              });
            }
            
            // Sort: directories first, then alphabetically
            files.sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            });
            
            console.log(`Found ${files.length} files in ${dirPath}`);
            resolve(files);
          } catch (parseError) {
            console.error('Error parsing file list:', parseError);
            reject(parseError);
          }
        });
      });
    });
    
    conn.on('error', (err) => {
      console.error('SSH connection error:', err);
      reject(err);
    });
    
    try {
      conn.connect({
        host: ip,
        port: 22,
        username: username,
        privateKey: require('fs').readFileSync(privateKeyPath)
      });
    } catch (err) {
      console.error('SSH connect error:', err);
      reject(err);
    }
  });
}

// Get server metrics via SSH
async function getServerMetrics(ip, username, privateKeyPath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const metrics = {};
    
    conn.on('ready', () => {
      // Execute multiple commands to gather system information
      const commands = [
        'uname -srm',
        'uptime',
        'free -m',
        'df -h /',
        'nproc',
        'cat /proc/cpuinfo | grep "model name" | head -1',
        'cat /proc/meminfo | grep MemTotal',
        'hostname',
        'cat /proc/stat | grep "^cpu " | head -1 && sleep 1 && cat /proc/stat | grep "^cpu " | head -1' // Get two readings 1 second apart
      ];
      
      let currentIndex = 0;
      const results = [];
      
      const executeNext = () => {
        if (currentIndex >= commands.length) {
          conn.end();
          metrics.raw = results;
          resolve(parseMetrics(results));
          return;
        }
        
        conn.exec(commands[currentIndex], (err, stream) => {
          if (err) {
            results.push({ error: err.message });
            currentIndex++;
            executeNext();
            return;
          }
          
          let output = '';
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.on('close', () => {
            results.push(output.trim());
            currentIndex++;
            executeNext();
          });
        });
      };
      
      executeNext();
    });
    
    conn.on('error', (err) => {
      reject(err);
    });
    
    conn.connect({
      host: ip,
      port: 22,
      username: username,
      privateKey: require('fs').readFileSync(privateKeyPath)
    });
  });
}

function parseMetrics(results) {
  const metrics = {};
  
  // Parse uname (OS info)
  if (results[0] && !results[0].error) {
    metrics.os = results[0];
  }
  
  // Parse uptime and load average
  if (results[1] && !results[1].error) {
    const uptimeMatch = results[1].match(/up\s+(.+?),\s+\d+\s+user/);
    const loadMatch = results[1].match(/load average:\s+([\d.]+),\s+([\d.]+),\s+([\d.]+)/);
    
    if (uptimeMatch) {
      metrics.uptime = uptimeMatch[1];
    }
    if (loadMatch) {
      metrics.load = {
        '1min': parseFloat(loadMatch[1]),
        '5min': parseFloat(loadMatch[2]),
        '15min': parseFloat(loadMatch[3])
      };
    }
  }
  
  // Parse memory (free -m)
  if (results[2] && !results[2].error) {
    const lines = results[2].split('\n');
    const memLine = lines.find(line => line.startsWith('Mem:'));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      metrics.memory = {
        total: parseInt(parts[1]),
        used: parseInt(parts[2]),
        free: parseInt(parts[3]),
        percentage: Math.round((parseInt(parts[2]) / parseInt(parts[1])) * 100)
      };
    }
  }
  
  // Parse disk usage (df -h /)
  if (results[3] && !results[3].error) {
    const lines = results[3].split('\n');
    const diskLine = lines[1];
    if (diskLine) {
      const parts = diskLine.split(/\s+/);
      metrics.disk = {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        percentage: parseInt(parts[4])
      };
    }
  }
  
  // Parse CPU cores
  if (results[4] && !results[4].error) {
    metrics.cpu = {
      cores: parseInt(results[4])
    };
  }
  
  // Parse CPU model
  if (results[5] && !results[5].error) {
    const modelMatch = results[5].match(/model name\s*:\s*(.+)/);
    if (modelMatch && metrics.cpu) {
      metrics.cpu.model = modelMatch[1].trim();
    }
  }
  
  // Parse total RAM
  if (results[6] && !results[6].error) {
    const ramMatch = results[6].match(/MemTotal:\s+(\d+)/);
    if (ramMatch) {
      metrics.totalRam = Math.round(parseInt(ramMatch[1]) / 1024) + ' MB';
    }
  }
  
  // Parse hostname
  if (results[7] && !results[7].error) {
    metrics.hostname = results[7];
  }
  
  // Parse CPU usage percentage
  if (results[8] && !results[8].error) {
    // Parse /proc/stat: cpu user nice system idle iowait irq softirq steal guest guest_nice
    // We get two readings 1 second apart
    const lines = results[8].trim().split('\n');
    
    if (lines.length >= 2) {
      const parts1 = lines[0].trim().split(/\s+/);
      const parts2 = lines[1].trim().split(/\s+/);
      
      if (parts1.length >= 5 && parts1[0] === 'cpu' && parts2.length >= 5 && parts2[0] === 'cpu') {
        // First reading
        const user1 = parseInt(parts1[1]) || 0;
        const nice1 = parseInt(parts1[2]) || 0;
        const system1 = parseInt(parts1[3]) || 0;
        const idle1 = parseInt(parts1[4]) || 0;
        const iowait1 = parseInt(parts1[5]) || 0;
        const irq1 = parseInt(parts1[6]) || 0;
        const softirq1 = parseInt(parts1[7]) || 0;
        
        // Second reading
        const user2 = parseInt(parts2[1]) || 0;
        const nice2 = parseInt(parts2[2]) || 0;
        const system2 = parseInt(parts2[3]) || 0;
        const idle2 = parseInt(parts2[4]) || 0;
        const iowait2 = parseInt(parts2[5]) || 0;
        const irq2 = parseInt(parts2[6]) || 0;
        const softirq2 = parseInt(parts2[7]) || 0;
        
        // Calculate differences
        const userDiff = user2 - user1;
        const niceDiff = nice2 - nice1;
        const systemDiff = system2 - system1;
        const idleDiff = idle2 - idle1;
        const iowaitDiff = iowait2 - iowait1;
        const irqDiff = irq2 - irq1;
        const softirqDiff = softirq2 - softirq1;
        
        const totalIdleDiff = idleDiff + iowaitDiff;
        const totalActiveDiff = userDiff + niceDiff + systemDiff + irqDiff + softirqDiff;
        const totalDiff = totalIdleDiff + totalActiveDiff;
        
        // Calculate percentage based on the difference
        const usage = totalDiff > 0 ? (totalActiveDiff / totalDiff) * 100 : 0;
        
        if (metrics.cpu) {
          metrics.cpu.usage = Math.round(usage * 10) / 10; // Round to 1 decimal
        } else {
          metrics.cpu = { usage: Math.round(usage * 10) / 10 };
        }
      }
    } else {
      console.log('CPU stat did not return two lines:', lines); // Debug log
    }
  } else {
    console.log('No CPU usage data or error:', results[8]); // Debug log
  }
  
  return metrics;
}

// Service Management Endpoints

// Get OS information
app.get('/api/servers/:id/os-info', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    
    if (server.status !== 'online') {
      return res.status(400).json({ error: 'Server is not online' });
    }
    
    const osInfo = await detectOS(server.ip, server.username, server.privateKeyPath);
    res.json(osInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get service status
app.get('/api/servers/:id/services/:serviceName/status', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    
    if (server.status !== 'online') {
      return res.status(400).json({ error: 'Server is not online' });
    }
    
    const status = await checkServiceStatus(
      server.ip, 
      server.username, 
      server.privateKeyPath, 
      req.params.serviceName
    );
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Install service
app.post('/api/servers/:id/services/:serviceName/install', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    
    if (server.status !== 'online') {
      return res.status(400).json({ error: 'Server is not online' });
    }
    
    // Get OS info first
    const osInfo = await detectOS(server.ip, server.username, server.privateKeyPath);
    
    const result = await installService(
      server.ip,
      server.username,
      server.privateKeyPath,
      req.params.serviceName,
      osInfo
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manage service (start, stop, restart, enable, disable)
app.post('/api/servers/:id/services/:serviceName/:action', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    const { action } = req.params;
    
    if (server.status !== 'online') {
      return res.status(400).json({ error: 'Server is not online' });
    }
    
    if (!['start', 'stop', 'restart', 'enable', 'disable'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    const result = await manageService(
      server.ip,
      server.username,
      server.privateKeyPath,
      req.params.serviceName,
      action
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get server metrics endpoint - returns latest cached metrics
app.get('/api/servers/:id/metrics', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const server = check.server;
    
    if (server.status !== 'online') {
      return res.status(400).json({ error: 'Server is not online' });
    }
    
    // Get the latest metrics from database
    db.get(
      `SELECT * FROM server_metrics 
       WHERE server_id = ? 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [req.params.id],
      async (err, latestMetric) => {
        if (err) {
          console.error('Error fetching latest metrics:', err);
          return res.status(500).json({ error: 'Failed to fetch metrics' });
        }
        
        // If no metrics exist yet or they're older than 2 minutes, fetch fresh ones
        if (!latestMetric || (new Date() - new Date(latestMetric.timestamp)) > 120000) {
          try {
            const metrics = await getServerMetrics(server.ip, server.username, server.private_key_path);
            return res.json(metrics);
          } catch (error) {
            return res.status(500).json({ error: error.message });
          }
        }
        
        // Return cached metrics in the expected format
        const metrics = {
          cpu: {
            usage: latestMetric.cpu_usage,
            cores: latestMetric.cpu_cores,
            model: latestMetric.cpu_model
          },
          memory: {
            used: latestMetric.memory_used,
            total: latestMetric.memory_total,
            free: latestMetric.memory_free,
            percentage: latestMetric.memory_percentage
          },
          disk: {
            total: latestMetric.disk_total,
            used: latestMetric.disk_used,
            available: latestMetric.disk_available,
            percentage: latestMetric.disk_percentage
          },
          load: {
            '1min': latestMetric.cpu_load_1min,
            '5min': latestMetric.cpu_load_5min,
            '15min': latestMetric.cpu_load_15min
          },
          os: latestMetric.os,
          hostname: latestMetric.hostname,
          uptime: latestMetric.uptime
        };
        
        res.json(metrics);
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get server metrics history endpoint
app.get('/api/servers/:id/metrics/history', requireAuth, async (req, res) => {
  try {
    const check = await checkServerOwnership(req.params.id, req.session.userId);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }
    
    const hours = parseInt(req.query.hours) || 24; // Default to last 24 hours
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    db.all(`
      SELECT * FROM server_metrics 
      WHERE server_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `, [req.params.id, since], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket terminal sessions
const activeSessions = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('start-terminal', async ({ serverId }) => {
    try {
      const server = await getServer(serverId);
      
      if (!server) {
        socket.emit('error', { message: 'Server not found' });
        return;
      }
      
      const conn = new Client();
      
      conn.on('ready', () => {
        socket.emit('status', { message: 'Connected to server' });
        
        conn.shell({ term: 'xterm-color' }, (err, stream) => {
          if (err) {
            socket.emit('error', { message: err.message });
            return;
          }
          
          // Store the session
          activeSessions.set(socket.id, { conn, stream });
          
          // Send data from server to client
          stream.on('data', (data) => {
            socket.emit('data', data.toString('utf-8'));
          });
          
          stream.on('close', () => {
            socket.emit('status', { message: 'Terminal closed' });
            conn.end();
            activeSessions.delete(socket.id);
          });
          
          stream.stderr.on('data', (data) => {
            socket.emit('data', data.toString('utf-8'));
          });
        });
      }).on('error', (err) => {
        socket.emit('error', { message: err.message });
      }).connect({
        host: server.ip,
        port: 22,
        username: server.username,
        privateKey: require('fs').readFileSync(server.privateKeyPath),
        readyTimeout: 10000
      });
      
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  socket.on('data', (data) => {
    const session = activeSessions.get(socket.id);
    if (session && session.stream) {
      session.stream.write(data);
    }
  });
  
  socket.on('resize', ({ rows, cols }) => {
    const session = activeSessions.get(socket.id);
    if (session && session.stream) {
      session.stream.setWindow(rows, cols);
    }
  });

  // Real-time service installation
  socket.on('install-service', async ({ serverId, serviceName, version }) => {
    console.log(`[Install] Starting installation of ${serviceName}${version ? ` v${version}` : ''} on server ${serverId}`);
    
    try {
      const server = await getServer(serverId);
      
      if (!server) {
        console.log(`[Install] Server not found: ${serverId}`);
        socket.emit('install-error', { message: 'Server not found' });
        return;
      }

      console.log(`[Install] Found server: ${server.ip}, detecting OS...`);
      socket.emit('install-output', { data: `\x1b[36m>>> Connecting to server ${server.ip}...\x1b[0m\n` });

      // Get OS info first
      let osInfo;
      try {
        osInfo = await detectOS(server.ip, server.username, server.privateKeyPath);
        console.log(`[Install] OS detected: ${osInfo.prettyName}, package manager: ${osInfo.packageManager}`);
      } catch (osErr) {
        console.error(`[Install] OS detection failed:`, osErr);
        socket.emit('install-error', { message: `Failed to detect OS: ${osErr.message}` });
        return;
      }
      
      socket.emit('install-output', { data: `\x1b[36m>>> Detected OS: ${osInfo.prettyName || osInfo.id}\x1b[0m\n` });
      socket.emit('install-output', { data: `\x1b[36m>>> Package manager: ${osInfo.packageManager}\x1b[0m\n\n` });
      
      // Build installation command
      const sudoPrefix = `if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; else SUDO=""; fi && `;
      let installCommand = '';
      
      if (serviceName === 'docker') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `
            echo ">>> Adding Docker's official GPG key..." && \
            $SUDO apt update && \
            $SUDO apt install -y ca-certificates curl && \
            $SUDO install -m 0755 -d /etc/apt/keyrings && \
            $SUDO curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
            $SUDO chmod a+r /etc/apt/keyrings/docker.asc && \
            echo ">>> Adding Docker repository to Apt sources..." && \
            echo "Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "\${UBUNTU_CODENAME:-\$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc" | $SUDO tee /etc/apt/sources.list.d/docker.sources > /dev/null && \
            echo ">>> Updating package list..." && \
            $SUDO apt update && \
            echo ">>> Installing Docker packages..." && \
            $SUDO apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
            echo ">>> Starting Docker service..." && \
            $SUDO systemctl start docker && \
            $SUDO systemctl enable docker && \
            echo ">>> Docker installation complete!"
          `;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `
            echo ">>> Installing yum-utils..." && \
            $SUDO yum install -y yum-utils && \
            echo ">>> Adding Docker repository..." && \
            $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo && \
            echo ">>> Installing Docker packages..." && \
            $SUDO yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
            echo ">>> Starting Docker service..." && \
            $SUDO systemctl start docker && \
            $SUDO systemctl enable docker && \
            echo ">>> Docker installation complete!"
          `;
        }
      } else if (serviceName === 'nginx') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `echo ">>> Updating package list..." && $SUDO apt update && echo ">>> Installing Nginx..." && $SUDO apt install -y nginx && echo ">>> Starting Nginx..." && $SUDO systemctl start nginx && $SUDO systemctl enable nginx && echo ">>> Nginx installation complete!"`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `echo ">>> Installing Nginx..." && $SUDO yum install -y nginx && echo ">>> Starting Nginx..." && $SUDO systemctl start nginx && $SUDO systemctl enable nginx && echo ">>> Nginx installation complete!"`;
        }
      } else if (serviceName === 'nodejs') {
        const nodeVersion = version || '20'; // Default to v20 LTS if not specified
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `echo ">>> Adding NodeSource repository for Node.js v${nodeVersion}..." && curl -fsSL https://deb.nodesource.com/setup_${nodeVersion}.x | $SUDO bash - && echo ">>> Installing Node.js v${nodeVersion}..." && $SUDO apt install -y nodejs && echo ">>> Node.js installation complete!" && node --version`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `echo ">>> Adding NodeSource repository for Node.js v${nodeVersion}..." && curl -fsSL https://rpm.nodesource.com/setup_${nodeVersion}.x | $SUDO bash - && echo ">>> Installing Node.js v${nodeVersion}..." && $SUDO yum install -y nodejs && echo ">>> Node.js installation complete!" && node --version`;
        }
      } else if (serviceName === 'postgresql') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `echo ">>> Updating package list..." && $SUDO apt update && echo ">>> Installing PostgreSQL..." && $SUDO apt install -y postgresql postgresql-contrib && echo ">>> Starting PostgreSQL..." && $SUDO systemctl start postgresql && $SUDO systemctl enable postgresql && echo ">>> PostgreSQL installation complete!"`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `echo ">>> Installing PostgreSQL..." && $SUDO yum install -y postgresql-server postgresql-contrib && echo ">>> Initializing database..." && $SUDO postgresql-setup initdb && echo ">>> Starting PostgreSQL..." && $SUDO systemctl start postgresql && $SUDO systemctl enable postgresql && echo ">>> PostgreSQL installation complete!"`;
        }
      } else if (serviceName === 'redis') {
        if (osInfo.packageManager === 'apt') {
          installCommand = sudoPrefix + `echo ">>> Updating package list..." && $SUDO apt update && echo ">>> Installing Redis..." && $SUDO apt install -y redis-server && echo ">>> Starting Redis..." && $SUDO systemctl start redis-server && $SUDO systemctl enable redis-server && echo ">>> Redis installation complete!"`;
        } else if (osInfo.packageManager === 'yum') {
          installCommand = sudoPrefix + `echo ">>> Installing Redis..." && $SUDO yum install -y redis && echo ">>> Starting Redis..." && $SUDO systemctl start redis && $SUDO systemctl enable redis && echo ">>> Redis installation complete!"`;
        }
      }

      if (!installCommand) {
        socket.emit('install-error', { message: `Installation not supported for ${serviceName} on ${osInfo.packageManager}` });
        return;
      }

      socket.emit('install-output', { data: `\x1b[36m>>> Starting installation...\x1b[0m\n\n` });
      console.log(`[Install] Executing installation command for ${serviceName}`);

      const conn = new Client();
      
      conn.on('ready', () => {
        console.log(`[Install] SSH connection ready, executing command...`);
        conn.exec(installCommand, { pty: true }, (err, stream) => {
          if (err) {
            socket.emit('install-error', { message: err.message });
            conn.end();
            return;
          }

          stream.on('data', (data) => {
            socket.emit('install-output', { data: data.toString('utf-8') });
          });

          stream.stderr.on('data', (data) => {
            socket.emit('install-output', { data: data.toString('utf-8') });
          });

          stream.on('close', (code) => {
            conn.end();
            if (code === 0) {
              socket.emit('install-complete', { 
                success: true, 
                message: `${serviceName} installed successfully!` 
              });
            } else {
              socket.emit('install-complete', { 
                success: false, 
                message: `Installation exited with code ${code}` 
              });
            }
          });
        });
      }).on('error', (err) => {
        console.error(`[Install] SSH connection error:`, err);
        socket.emit('install-error', { message: err.message });
      }).connect({
        host: server.ip,
        port: 22,
        username: server.username,
        privateKey: require('fs').readFileSync(server.privateKeyPath),
        readyTimeout: 30000
      });

    } catch (error) {
      console.error(`[Install] Installation error:`, error);
      socket.emit('install-error', { message: error.message });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const session = activeSessions.get(socket.id);
    if (session) {
      if (session.stream) session.stream.end();
      if (session.conn) session.conn.end();
      activeSessions.delete(socket.id);
    }
  });
});

// Initialize and start server
initStorage().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Start background metrics collection
    startMetricsCollection();
  });
}).catch(err => {
  console.error('Failed to initialize storage:', err);
  process.exit(1);
});

// Background metrics collection
function startMetricsCollection() {
  console.log('Starting background metrics collection...');
  
  // Collect metrics immediately on startup
  collectAllMetrics();
  
  // Then collect every 30 seconds
  setInterval(() => {
    collectAllMetrics();
  }, 5000);
}

async function collectAllMetrics() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM servers WHERE status = ?', ['online'], async (err, servers) => {
      if (err) {
        console.error('Error fetching servers for metrics collection:', err);
        resolve();
        return;
      }
      
      if (!servers || servers.length === 0) {
        resolve();
        return;
      }
      
      // Collect metrics for all servers in parallel
      const promises = servers.map(async (server) => {
        try {
          const metrics = await getServerMetrics(server.ip, server.username, server.private_key_path);
          
          // Store complete metrics in database
          db.run(
            `INSERT INTO server_metrics (
              server_id, cpu_usage, cpu_cores, cpu_model, cpu_load_1min, cpu_load_5min, cpu_load_15min,
              memory_used, memory_total, memory_free, memory_percentage, 
              disk_total, disk_used, disk_available, disk_percentage,
              os, hostname, uptime, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              server.id,
              metrics.cpu?.usage || null,
              metrics.cpu?.cores || null,
              metrics.cpu?.model || null,
              metrics.load?.['1min'] || null,
              metrics.load?.['5min'] || null,
              metrics.load?.['15min'] || null,
              metrics.memory?.used || null,
              metrics.memory?.total || null,
              metrics.memory?.free || null,
              metrics.memory?.percentage || null,
              metrics.disk?.total || null,
              metrics.disk?.used || null,
              metrics.disk?.available || null,
              metrics.disk?.percentage || null,
              metrics.os || null,
              metrics.hostname || null,
              metrics.uptime || null,
              new Date().toISOString()
            ],
            (err) => {
              if (err) {
                console.error(`Error storing metrics for server ${server.name}:`, err);
              }
            }
          );
        } catch (error) {
          // Silently handle metrics collection errors
        }
      });
      
      await Promise.all(promises);
      resolve();
    });
  });
}