# Templates System Documentation

This folder contains Docker application templates that users can quickly deploy from the "Apps > Templates" tab in the UI.

## Overview

Templates are defined in `templates.yaml` and provide pre-configured Docker container settings including:
- Docker image and tag
- Port mappings
- Environment variables (with descriptions and required flags)
- Volume mounts
- Restart policies
- Documentation links and setup notes

## How to Add a New Template

### 1. Edit `templates.yaml`

Add a new entry under the `templates:` section. Each template requires the following fields:

```yaml
- id: unique-identifier        # Required: lowercase, hyphen-separated
  name: Display Name           # Required: Human-readable name
  description: Short desc      # Required: Brief description (1 sentence)
  category: category-name      # Required: See categories below
  icon: 🐳                     # Optional: Emoji icon (default: 🐳)
  image: docker-image          # Required: Docker Hub image name
  tag: latest                  # Optional: Image tag (default: 'latest')
  ports:                       # Optional: Port mappings array
    - host: "8080"
      container: "80"
  env_vars:                    # Optional: Environment variables array
    - key: ENV_NAME
      value: default_value
      description: What this does
      required: true           # Show as required in UI
  volumes:                     # Optional: Volume mounts array
    - host: volume-name
      container: /path/in/container
      description: What this stores
  restart_policy: unless-stopped  # Optional: Docker restart policy
  network_mode: bridge         # Optional: Docker network mode
  command: ""                  # Optional: Command override
  documentation_url: https://... # Optional: Link to docs
  notes: Additional info       # Optional: Setup notes shown in UI
```

### 2. Categories

Templates must belong to one of these categories:

| Category | Description |
|----------|-------------|
| `databases` | Database servers (PostgreSQL, MySQL, MongoDB, etc.) |
| `web-servers` | Web servers and reverse proxies (Nginx, Traefik, etc.) |
| `game-servers` | Game server hosting (Minecraft, Valheim, etc.) |
| `development` | Dev tools (Git servers, CI/CD, etc.) |
| `monitoring` | Monitoring and observability tools |
| `media` | Media servers and file storage |
| `utilities` | General utilities and tools |

### 3. Best Practices

1. **Environment Variables**
   - Always include `description` to explain what each variable does
   - Mark truly required variables with `required: true`
   - Provide sensible defaults where possible
   - Leave passwords/secrets empty for user to fill in

2. **Volumes**
   - Use named volumes (e.g., `postgres-data`) for data persistence
   - Use bind mounts (e.g., `./config`) only for configuration files
   - Include `description` for each volume

3. **Ports**
   - Use string format for port numbers: `"8080"` not `8080`
   - Document what each port is used for in the template notes

4. **Documentation**
   - Always include `documentation_url` pointing to official docs
   - Add `notes` for any non-obvious setup requirements

## Example Template

Here's a complete example for a simple web application:

```yaml
- id: myapp
  name: My Application
  description: A brief description of what this app does
  category: utilities
  icon: 🚀
  image: myorg/myapp
  tag: "1.0"
  ports:
    - host: "8080"
      container: "3000"
  env_vars:
    - key: DATABASE_URL
      value: ""
      description: PostgreSQL connection string
      required: true
    - key: SECRET_KEY
      value: ""
      description: Application secret for sessions
      required: true
    - key: LOG_LEVEL
      value: info
      description: Logging verbosity (debug, info, warn, error)
      required: false
  volumes:
    - host: myapp-data
      container: /app/data
      description: Application data storage
  restart_policy: unless-stopped
  documentation_url: https://github.com/myorg/myapp
  notes: |
    1. Set DATABASE_URL to your PostgreSQL connection string
    2. Generate a random SECRET_KEY for production use
    3. Access the web UI at http://server:8080
```

## API Endpoint

Templates are served via `GET /api/templates` which returns:

```json
{
  "templates": [...],
  "categories": [
    { "id": "databases", "name": "Databases", "count": 5 },
    ...
  ]
}
```

## Template Updates

Templates are read from the YAML file on each API request (with short caching). To update templates:

1. Edit `templates.yaml`
2. Save the file
3. Refresh the Templates tab in the UI

No server restart is required.

## Future Enhancements

Planned improvements (not yet implemented):
- Template versioning for update notifications
- User-submitted templates
- Template ratings and popularity tracking
- Template verification/certification
