/**
 * Docker Run Command Parser
 * Parses a `docker run` command string and extracts configuration into structured data
 */

/**
 * Parse a docker run command into app configuration
 * @param {string} command - The docker run command string
 * @returns {Object} Parsed configuration object
 */
export function parseDockerRun(command) {
  const result = {
    image: '',
    tag: 'latest',
    name: '',
    ports: [],
    env_vars: [],
    volumes: [],
    restart_policy: '',
    network_mode: '',
    command: '',
    custom_args: '',
  };

  // Normalize the command - handle multiline and extra spaces
  let normalized = command
    .replace(/\\\n/g, ' ')  // Handle line continuations
    .replace(/\s+/g, ' ')   // Normalize whitespace
    .trim();

  // Remove 'docker run' prefix if present
  normalized = normalized.replace(/^docker\s+run\s+/i, '');

  // Track unknown flags for custom_args
  const unknownFlags = [];

  // Tokenize while respecting quotes
  const tokens = tokenize(normalized);

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // Port mapping: -p or --publish
    if (token === '-p' || token === '--publish') {
      if (i + 1 < tokens.length) {
        const portMapping = parsePortMapping(tokens[i + 1]);
        if (portMapping) {
          result.ports.push(portMapping);
        }
        i += 2;
        continue;
      }
    }

    // Environment variable: -e or --env
    if (token === '-e' || token === '--env') {
      if (i + 1 < tokens.length) {
        const envVar = parseEnvVar(tokens[i + 1]);
        if (envVar) {
          result.env_vars.push(envVar);
        }
        i += 2;
        continue;
      }
    }

    // Volume mount: -v or --volume
    if (token === '-v' || token === '--volume') {
      if (i + 1 < tokens.length) {
        const volume = parseVolume(tokens[i + 1]);
        if (volume) {
          result.volumes.push(volume);
        }
        i += 2;
        continue;
      }
    }

    // Container name: --name
    if (token === '--name') {
      if (i + 1 < tokens.length) {
        result.name = tokens[i + 1];
        i += 2;
        continue;
      }
    }

    // Restart policy: --restart
    if (token === '--restart') {
      if (i + 1 < tokens.length) {
        result.restart_policy = tokens[i + 1];
        i += 2;
        continue;
      }
    }

    // Network mode: --network or --net
    if (token === '--network' || token === '--net') {
      if (i + 1 < tokens.length) {
        result.network_mode = tokens[i + 1];
        i += 2;
        continue;
      }
    }

    // Detached mode: -d (skip, we always run detached)
    if (token === '-d' || token === '--detach') {
      i += 1;
      continue;
    }

    // Interactive/TTY flags (skip)
    if (token === '-i' || token === '--interactive' || token === '-t' || token === '--tty' || token === '-it') {
      i += 1;
      continue;
    }

    // Remove after exit (skip, not commonly needed)
    if (token === '--rm') {
      i += 1;
      continue;
    }

    // Handle flags with = syntax
    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=');
      if (eqIndex !== -1) {
        const flag = token.substring(0, eqIndex);
        const value = token.substring(eqIndex + 1);

        if (flag === '--name') {
          result.name = value;
          i += 1;
          continue;
        }
        if (flag === '--restart') {
          result.restart_policy = value;
          i += 1;
          continue;
        }
        if (flag === '--network' || flag === '--net') {
          result.network_mode = value;
          i += 1;
          continue;
        }
        if (flag === '-p' || flag === '--publish') {
          const portMapping = parsePortMapping(value);
          if (portMapping) result.ports.push(portMapping);
          i += 1;
          continue;
        }
        if (flag === '-e' || flag === '--env') {
          const envVar = parseEnvVar(value);
          if (envVar) result.env_vars.push(envVar);
          i += 1;
          continue;
        }
        if (flag === '-v' || flag === '--volume') {
          const volume = parseVolume(value);
          if (volume) result.volumes.push(volume);
          i += 1;
          continue;
        }

        // Unknown flag with value - add to custom_args
        unknownFlags.push(token);
        i += 1;
        continue;
      }
    }

    // Handle short combined flags like -dp
    if (token.startsWith('-') && !token.startsWith('--') && token.length > 2) {
      const flags = token.substring(1).split('');
      let handled = true;
      for (const flag of flags) {
        if (flag !== 'd' && flag !== 'i' && flag !== 't') {
          handled = false;
          break;
        }
      }
      if (handled) {
        i += 1;
        continue;
      }
    }

    // Unknown flags that take a value
    if (token.startsWith('-')) {
      const knownValueFlags = ['--memory', '-m', '--cpus', '--cpu-shares', '--cap-add', '--cap-drop', 
        '--device', '--ulimit', '--user', '-u', '--workdir', '-w', '--hostname', '-h',
        '--entrypoint', '--label', '-l', '--log-driver', '--log-opt', '--pid', '--ipc',
        '--shm-size', '--tmpfs', '--mount', '--security-opt', '--health-cmd'];
      
      const knownNoValueFlags = ['--privileged', '--read-only', '--init'];
      
      if (knownNoValueFlags.includes(token)) {
        unknownFlags.push(token);
        i += 1;
        continue;
      }
      
      if (knownValueFlags.some(f => token === f || token.startsWith(f + '='))) {
        if (token.includes('=')) {
          unknownFlags.push(token);
          i += 1;
        } else if (i + 1 < tokens.length) {
          unknownFlags.push(`${token} ${tokens[i + 1]}`);
          i += 2;
        } else {
          unknownFlags.push(token);
          i += 1;
        }
        continue;
      }

      // Unknown flag - preserve it
      unknownFlags.push(token);
      i += 1;
      continue;
    }

    // Not a flag - must be image or command
    // The first non-flag token is the image
    if (!result.image) {
      const { image, tag } = parseImageTag(token);
      result.image = image;
      result.tag = tag;
      i += 1;
      
      // Everything after image is the command
      const remainingTokens = tokens.slice(i);
      if (remainingTokens.length > 0) {
        result.command = remainingTokens.join(' ');
      }
      break;
    }

    i += 1;
  }

  // Add unknown flags to custom_args
  if (unknownFlags.length > 0) {
    result.custom_args = unknownFlags.join(' ');
  }

  return result;
}

/**
 * Tokenize a command string, respecting quotes
 */
function tokenize(str) {
  const tokens = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
        // Don't include the closing quote
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuote = true;
        quoteChar = char;
      } else if (char === ' ') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse port mapping string like "8080:80" or "8080:80/tcp"
 */
function parsePortMapping(portStr) {
  // Handle format: hostPort:containerPort or hostPort:containerPort/protocol
  const parts = portStr.split(':');
  if (parts.length >= 2) {
    const host = parts[0];
    let container = parts[1];
    
    // Remove protocol suffix if present
    container = container.replace(/\/(tcp|udp)$/i, '');
    
    return { host, container };
  }
  return null;
}

/**
 * Parse environment variable string like "KEY=value"
 */
function parseEnvVar(envStr) {
  const eqIndex = envStr.indexOf('=');
  if (eqIndex !== -1) {
    return {
      key: envStr.substring(0, eqIndex),
      value: envStr.substring(eqIndex + 1)
    };
  }
  // Environment variable without value (inherits from host)
  return { key: envStr, value: '' };
}

/**
 * Parse volume mount string like "/host/path:/container/path" or "volume-name:/container/path"
 */
function parseVolume(volStr) {
  const parts = volStr.split(':');
  if (parts.length >= 2) {
    return {
      host: parts[0],
      container: parts[1].replace(/:ro$|:rw$/, '') // Remove read mode suffix
    };
  }
  return null;
}

/**
 * Parse image:tag string
 */
function parseImageTag(imageStr) {
  // Handle registry/image:tag format
  const lastColon = imageStr.lastIndexOf(':');
  
  // Check if this colon is part of a port number (registry:port/image)
  // or the tag separator
  if (lastColon !== -1) {
    const afterColon = imageStr.substring(lastColon + 1);
    // If afterColon contains a /, it's not a tag
    if (!afterColon.includes('/')) {
      return {
        image: imageStr.substring(0, lastColon),
        tag: afterColon || 'latest'
      };
    }
  }
  
  return { image: imageStr, tag: 'latest' };
}

/**
 * Generate a docker run command from app configuration
 * @param {Object} config - App configuration object
 * @returns {string} Docker run command
 */
export function generateDockerRun(config) {
  const parts = ['docker run -d'];

  if (config.name) {
    parts.push(`--name ${config.name}`);
  }

  if (config.restart_policy) {
    parts.push(`--restart ${config.restart_policy}`);
  }

  if (config.network_mode) {
    parts.push(`--network ${config.network_mode}`);
  }

  // Ports
  if (config.ports && config.ports.length > 0) {
    config.ports.forEach(p => {
      if (p.host && p.container) {
        parts.push(`-p ${p.host}:${p.container}`);
      }
    });
  }

  // Environment variables
  if (config.env_vars && config.env_vars.length > 0) {
    config.env_vars.forEach(env => {
      if (env.key) {
        parts.push(`-e ${env.key}=${env.value || ''}`);
      }
    });
  }

  // Volumes
  if (config.volumes && config.volumes.length > 0) {
    config.volumes.forEach(vol => {
      if (vol.host && vol.container) {
        parts.push(`-v ${vol.host}:${vol.container}`);
      }
    });
  }

  // Custom args (before image)
  if (config.custom_args) {
    parts.push(config.custom_args);
  }

  // Image
  if (config.image) {
    parts.push(`${config.image}:${config.tag || 'latest'}`);
  }

  // Command override
  if (config.command) {
    parts.push(config.command);
  }

  return parts.join(' \\\n  ');
}
