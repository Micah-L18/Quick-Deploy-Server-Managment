/**
 * YAML Parser for Docker Compose
 * Parses docker-compose YAML and converts to/from app configuration
 */
import yaml from 'js-yaml';

/**
 * Parse docker-compose YAML string into app configuration
 * @param {string} yamlString - Docker compose YAML content
 * @returns {Object} Parsed configuration object
 */
export function parseDockerComposeYaml(yamlString) {
  const result = {
    name: '',
    image: '',
    tag: 'latest',
    ports: [],
    env_vars: [],
    volumes: [],
    restart_policy: '',
    network_mode: '',
    command: '',
    custom_args: '',
  };

  try {
    const doc = yaml.load(yamlString);
    
    if (!doc || !doc.services) {
      throw new Error('Invalid docker-compose format: missing services section');
    }

    // Get the first service (we only support single-service compose files for now)
    const serviceNames = Object.keys(doc.services);
    if (serviceNames.length === 0) {
      throw new Error('No services defined in YAML');
    }

    const serviceName = serviceNames[0];
    const service = doc.services[serviceName];

    // Service name becomes app name
    result.name = serviceName;

    // Parse image and tag
    if (service.image) {
      const { image, tag } = parseImageTag(service.image);
      result.image = image;
      result.tag = tag;
    }

    // Parse container_name if present (overrides service name)
    if (service.container_name) {
      result.name = service.container_name;
    }

    // Parse restart policy
    if (service.restart) {
      result.restart_policy = service.restart;
    }

    // Parse network mode
    if (service.network_mode) {
      result.network_mode = service.network_mode;
    }

    // Parse command
    if (service.command) {
      result.command = Array.isArray(service.command) 
        ? service.command.join(' ') 
        : service.command;
    }

    // Parse ports
    if (service.ports && Array.isArray(service.ports)) {
      result.ports = service.ports.map(port => {
        if (typeof port === 'string') {
          return parsePortString(port);
        } else if (typeof port === 'object') {
          // Long syntax
          return {
            host: String(port.published || port.host_ip || ''),
            container: String(port.target || '')
          };
        }
        return null;
      }).filter(Boolean);
    }

    // Parse environment variables
    if (service.environment) {
      if (Array.isArray(service.environment)) {
        // List format: ["KEY=value", "KEY2=value2"]
        result.env_vars = service.environment.map(env => {
          const eqIndex = env.indexOf('=');
          if (eqIndex !== -1) {
            return {
              key: env.substring(0, eqIndex),
              value: env.substring(eqIndex + 1)
            };
          }
          return { key: env, value: '' };
        });
      } else if (typeof service.environment === 'object') {
        // Map format: { KEY: value, KEY2: value2 }
        result.env_vars = Object.entries(service.environment).map(([key, value]) => ({
          key,
          value: value !== null ? String(value) : ''
        }));
      }
    }

    // Parse volumes
    if (service.volumes && Array.isArray(service.volumes)) {
      result.volumes = service.volumes.map(vol => {
        if (typeof vol === 'string') {
          return parseVolumeString(vol);
        } else if (typeof vol === 'object') {
          // Long syntax
          return {
            host: vol.source || '',
            container: vol.target || ''
          };
        }
        return null;
      }).filter(Boolean);
    }

    return { success: true, config: result };
  } catch (error) {
    return { success: false, error: error.message, config: result };
  }
}

/**
 * Generate docker-compose YAML from app configuration
 * @param {Object} config - App configuration object
 * @returns {string} Docker compose YAML string
 */
export function generateDockerComposeYaml(config) {
  if (!config.image) {
    return '# No Docker image configured\n# Configure the image in the Config tab first';
  }

  const serviceName = (config.name || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const service = {
    image: `${config.image}:${config.tag || 'latest'}`,
    container_name: serviceName,
    restart: config.restart_policy || 'unless-stopped',
  };

  // Add ports
  if (config.ports && config.ports.length > 0) {
    const validPorts = config.ports.filter(p => p.host && p.container);
    if (validPorts.length > 0) {
      service.ports = validPorts.map(p => `${p.host}:${p.container}`);
    }
  }

  // Add environment variables
  if (config.env_vars && config.env_vars.length > 0) {
    const validEnvs = config.env_vars.filter(e => e.key);
    if (validEnvs.length > 0) {
      service.environment = validEnvs.map(e => `${e.key}=${e.value || ''}`);
    }
  }

  // Add volumes
  if (config.volumes && config.volumes.length > 0) {
    const validVolumes = config.volumes.filter(v => v.host && v.container);
    if (validVolumes.length > 0) {
      service.volumes = validVolumes.map(v => `${v.host}:${v.container}`);
    }
  }

  // Add network mode
  if (config.network_mode) {
    service.network_mode = config.network_mode;
  }

  // Add command
  if (config.command) {
    service.command = config.command;
  }

  const doc = {
    version: '3.8',
    services: {
      [serviceName]: service
    }
  };

  return yaml.dump(doc, {
    indent: 2,
    lineWidth: -1, // Don't wrap lines
    noRefs: true,
    sortKeys: false
  });
}

/**
 * Parse image:tag string
 */
function parseImageTag(imageStr) {
  const lastColon = imageStr.lastIndexOf(':');
  
  if (lastColon !== -1) {
    const afterColon = imageStr.substring(lastColon + 1);
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
 * Parse port string like "8080:80" or "8080:80/tcp"
 */
function parsePortString(portStr) {
  const str = String(portStr);
  const parts = str.split(':');
  
  if (parts.length >= 2) {
    const host = parts[0];
    let container = parts[1];
    container = container.replace(/\/(tcp|udp)$/i, '');
    return { host, container };
  } else if (parts.length === 1) {
    // Single port means same on both sides
    const port = parts[0].replace(/\/(tcp|udp)$/i, '');
    return { host: port, container: port };
  }
  
  return null;
}

/**
 * Parse volume string like "/host:/container" or "volume:/container"
 */
function parseVolumeString(volStr) {
  const parts = volStr.split(':');
  if (parts.length >= 2) {
    return {
      host: parts[0],
      container: parts[1].replace(/:ro$|:rw$/, '')
    };
  }
  return null;
}

/**
 * Validate YAML syntax without parsing to config
 * @param {string} yamlString - YAML content to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateYaml(yamlString) {
  try {
    yaml.load(yamlString);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
