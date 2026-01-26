const { executeCommand } = require('../ssh/connectionManager');
const { parseMetrics, parseWindowsMetrics, parseGpuMetrics } = require('./parser');

/**
 * Linux commands to collect server metrics
 */
const LINUX_METRICS_COMMANDS = [
  'uname -srm',
  'uptime',
  'free -m',
  'df -h /',
  'nproc',
  'cat /proc/cpuinfo | grep "model name" | head -1',
  'cat /proc/meminfo | grep MemTotal',
  'hostname',
  // Get two CPU readings 1 second apart for accurate usage calculation
  'cat /proc/stat | grep "^cpu " | head -1 && sleep 1 && cat /proc/stat | grep "^cpu " | head -1',
  // Get detailed OS info (distro name, version, etc.)
  'cat /etc/os-release 2>/dev/null || cat /etc/lsb-release 2>/dev/null || echo ""',
  // GPU detection - NVIDIA (nvidia-smi) or AMD (rocm-smi)
  // Format: name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu (one line per GPU)
  'nvidia-smi --query-gpu=gpu_name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>/dev/null || rocm-smi --showuse --showmemuse --showtemp --csv 2>/dev/null || echo ""',
  // CPU temperature - try multiple sources (lm-sensors, thermal zones, etc.)
  'cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1 || sensors 2>/dev/null | grep -i "core 0" | grep -oP "\\+\\d+\\.\\d+" | head -1 || echo ""',
  // Network bandwidth - get two readings 1 second apart for rate calculation
  // /proc/net/dev format: "  iface: rx_bytes rx_packets ... tx_bytes tx_packets ..."
  // We use default route interface and extract rx_bytes (field 2) and tx_bytes (field 10)
  "iface=$(ip route 2>/dev/null | grep default | head -1 | awk '{print $5}'); if [ -n \"$iface\" ]; then awk -v iface=\"$iface:\" '$1 == iface {print iface, $2, $10}' /proc/net/dev && sleep 1 && awk -v iface=\"$iface:\" '$1 == iface {print iface, $2, $10}' /proc/net/dev; else echo \"\"; fi",
  // Ping to 8.8.8.8 (Google DNS) to measure latency - quick timeout
  'ping -c 1 -W 2 8.8.8.8 2>/dev/null | grep -E "time=" | sed -E "s/.*time=([0-9.]+).*/\\1/" || echo ""'
];

/**
 * Windows PowerShell commands to collect server metrics
 * Returns JSON for easy parsing
 * Note: Commands are wrapped in powershell.exe -Command since OpenSSH defaults to cmd.exe
 * Uses -EncodedCommand with Base64 to avoid shell escaping issues
 */
function getWindowsMetricsCommand() {
  // PowerShell script to collect metrics
  const psScript = `
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$uptime = (Get-Date) - $os.LastBootUpTime
$cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
if ($null -eq $cpuLoad) { $cpuLoad = 0 }

# GPU detection via nvidia-smi
$gpuInfo = $null
try {
  $nvidiaSmi = nvidia-smi --query-gpu=gpu_name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>$null
  if ($nvidiaSmi -and $nvidiaSmi.Trim()) {
    $gpuLines = $nvidiaSmi -split "\`n"
    $gpus = @()
    foreach ($line in $gpuLines) {
      if ($line.Trim()) {
        $parts = $line -split ','
        if ($parts.Count -ge 6) {
          $gpus += @{
            name = $parts[0].Trim()
            memory_total = [int]$parts[1].Trim()
            memory_used = [int]$parts[2].Trim()
            memory_free = [int]$parts[3].Trim()
            utilization = [int]$parts[4].Trim()
            temperature = [int]$parts[5].Trim()
          }
        }
      }
    }
    if ($gpus.Count -gt 0) {
      $gpuInfo = @{
        vendor = 'nvidia'
        count = $gpus.Count
        gpus = $gpus
      }
    }
  }
} catch {}

# CPU temperature via WMI (may require admin privileges)
$cpuTemp = $null
try {
  $tempReading = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($tempReading -and $tempReading.CurrentTemperature) {
    # WMI reports in tenths of Kelvin, convert to Celsius
    $cpuTemp = [math]::Round(($tempReading.CurrentTemperature / 10) - 273.15, 0)
  }
} catch {}

# Network bandwidth - get active adapter stats
$networkInfo = $null
try {
  $adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Loopback' } | Select-Object -First 1
  if ($adapter) {
    $stats1 = Get-NetAdapterStatistics -Name $adapter.Name
    Start-Sleep -Seconds 1
    $stats2 = Get-NetAdapterStatistics -Name $adapter.Name
    $rxRate = ($stats2.ReceivedBytes - $stats1.ReceivedBytes)
    $txRate = ($stats2.SentBytes - $stats1.SentBytes)
    $networkInfo = @{
      interface = $adapter.Name
      rx_rate = $rxRate
      tx_rate = $txRate
      rx_total = $stats2.ReceivedBytes
      tx_total = $stats2.SentBytes
    }
  }
} catch {}

# Ping to measure latency
$pingMs = $null
try {
  $pingResult = Test-Connection -ComputerName 8.8.8.8 -Count 1 -ErrorAction SilentlyContinue
  if ($pingResult) {
    $pingMs = $pingResult.ResponseTime
  }
} catch {}

$result = @{
  os = $os.Caption + ' ' + $os.Version
  hostname = $env:COMPUTERNAME
  uptime = [string]$uptime.Days + 'd ' + [string]$uptime.Hours + 'h ' + [string]$uptime.Minutes + 'm'
  cpu = @{
    model = $cpu[0].Name
    cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
    usage = [math]::Round($cpuLoad, 1)
    temperature = $cpuTemp
  }
  memory = @{
    total = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
    free = [math]::Round($os.FreePhysicalMemory / 1024, 0)
    used = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024, 0)
    percentage = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 0)
  }
  disk = @{
    total = [string][math]::Round($disk.Size / 1GB, 1) + 'G'
    used = [string][math]::Round(($disk.Size - $disk.FreeSpace) / 1GB, 1) + 'G'
    available = [string][math]::Round($disk.FreeSpace / 1GB, 1) + 'G'
    percentage = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 0)
  }
  gpu = $gpuInfo
  network = $networkInfo
  ping = $pingMs
}
$result | ConvertTo-Json -Compress -Depth 4
`;
  
  // Encode as Base64 (UTF-16LE as required by PowerShell)
  const base64 = Buffer.from(psScript, 'utf16le').toString('base64');
  return `powershell.exe -NoProfile -EncodedCommand ${base64}`;
}

/**
 * Collect metrics from a server
 * @param {Object} serverConfig - { host, username, privateKeyPath, osType }
 * @returns {Promise<Object>} - Parsed metrics
 */
async function collectMetrics(serverConfig) {
  const osType = serverConfig.osType || 'ubuntu-debian';
  
  // Windows uses a single PowerShell command that returns JSON
  if (osType === 'windows') {
    try {
      const windowsCmd = getWindowsMetricsCommand();
      console.log('[Windows Metrics] Executing command on', serverConfig.host);
      const { stdout, stderr, code } = await executeCommand(serverConfig, windowsCmd);
      
      // Debug logging - always log for Windows
      console.log('[Windows Metrics] Exit code:', code);
      console.log('[Windows Metrics] Stdout length:', stdout?.length || 0);
      console.log('[Windows Metrics] Stdout preview:', stdout?.substring(0, 500));
      if (stderr) {
        console.log('[Windows Metrics] Stderr:', stderr);
      }
      
      // Check for empty output
      if (!stdout || stdout.trim() === '') {
        console.error('[Windows Metrics] Empty output from Windows server');
        return { error: 'Empty metrics output from Windows server' };
      }
      
      return parseWindowsMetrics(stdout);
    } catch (err) {
      console.error('[Windows Metrics] Collection error:', err.message);
      return { error: err.message };
    }
  }
  
  // Linux/Unix systems use multiple commands
  const results = [];
  for (const command of LINUX_METRICS_COMMANDS) {
    try {
      const { stdout, stderr, code } = await executeCommand(serverConfig, command);
      results.push(stdout.trim());
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  return parseMetrics(results);
}

/**
 * Get OS information from a server
 * @param {Object} serverConfig - Server configuration
 * @returns {Promise<Object>}
 */
async function getOsInfo(serverConfig) {
  const osType = serverConfig.osType || 'ubuntu-debian';
  
  if (osType === 'windows') {
    const command = 'powershell.exe -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).Caption"';
    const { stdout } = await executeCommand(serverConfig, command);
    return { name: stdout.trim(), id: 'windows' };
  }
  
  const command = 'cat /etc/os-release 2>/dev/null || lsb_release -a 2>/dev/null || echo "Unknown"';
  const { stdout } = await executeCommand(serverConfig, command);
  const { parseOsRelease } = require('./parser');
  
  return parseOsRelease(stdout);
}

/**
 * Get Windows PowerShell command for service status
 * Uses -EncodedCommand with Base64 to avoid shell escaping issues
 */
function getWindowsServiceCommand(serviceName) {
  // Base PowerShell script varies by service
  let psScript;
  
  switch (serviceName.toLowerCase()) {
    case 'docker':
      psScript = `
$dockerPath = (Get-Command docker -ErrorAction SilentlyContinue).Source
$dockerService = Get-Service -Name 'docker' -ErrorAction SilentlyContinue
$dockerVersion = if ($dockerPath) { (docker --version 2>$null) -replace 'Docker version ', '' -replace ',.*', '' } else { '' }
@{
  bin = if ($dockerPath) { $dockerPath } else { '' }
  status = if ($dockerService -and $dockerService.Status -eq 'Running') { 'active' } elseif ($dockerService) { 'inactive' } else { 'not_found' }
  version = $dockerVersion
} | ConvertTo-Json -Compress`;
      break;
    case 'nginx':
      psScript = `
$nginxPath = (Get-Command nginx -ErrorAction SilentlyContinue).Source
if (-not $nginxPath) { $nginxPath = if (Test-Path 'C:\\nginx\\nginx.exe') { 'C:\\nginx\\nginx.exe' } else { '' } }
$nginxService = Get-Service -Name 'nginx' -ErrorAction SilentlyContinue
$nginxVersion = ''
if ($nginxPath) { try { $nginxVersion = (& $nginxPath -v 2>&1) -replace 'nginx version: nginx/', '' } catch {} }
@{
  bin = if ($nginxPath) { $nginxPath } else { '' }
  status = if ($nginxService -and $nginxService.Status -eq 'Running') { 'active' } elseif ($nginxPath) { 'installed' } else { 'not_found' }
  version = $nginxVersion
} | ConvertTo-Json -Compress`;
      break;
    case 'nodejs':
      psScript = `
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
$nodeVersion = if ($nodePath) { (node --version 2>$null) -replace 'v', '' } else { '' }
@{
  bin = if ($nodePath) { $nodePath } else { '' }
  status = if ($nodePath) { 'installed' } else { 'not_found' }
  version = $nodeVersion
} | ConvertTo-Json -Compress`;
      break;
    case 'npm':
      // npm.ps1 may fail if script execution is disabled, use npm.cmd instead
      psScript = `
$npmPath = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$npmVersion = ''
if ($npmPath) { try { $npmVersion = (& cmd /c npm --version 2>$null).Trim() } catch {} }
@{
  bin = if ($npmPath) { $npmPath } else { '' }
  status = if ($npmPath) { 'installed' } else { 'not_found' }
  version = $npmVersion
} | ConvertTo-Json -Compress`;
      break;
    case 'git':
      psScript = `
$gitPath = (Get-Command git -ErrorAction SilentlyContinue).Source
$gitVersion = if ($gitPath) { (git --version 2>$null) -replace 'git version ', '' } else { '' }
@{
  bin = if ($gitPath) { $gitPath } else { '' }
  status = if ($gitPath) { 'installed' } else { 'not_found' }
  version = $gitVersion
} | ConvertTo-Json -Compress`;
      break;
    case 'iis':
      psScript = `
$iisService = Get-Service -Name 'W3SVC' -ErrorAction SilentlyContinue
$iisVersion = if ($iisService) { (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\InetStp' -ErrorAction SilentlyContinue).VersionString } else { '' }
@{
  bin = if ($iisService) { 'IIS' } else { '' }
  status = if ($iisService -and $iisService.Status -eq 'Running') { 'active' } elseif ($iisService) { 'inactive' } else { 'not_found' }
  version = $iisVersion
} | ConvertTo-Json -Compress`;
      break;
    case 'mysql':
      psScript = `
$mysqlPath = (Get-Command mysql -ErrorAction SilentlyContinue).Source
$mysqlService = Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue | Select-Object -First 1
$mysqlVersion = if ($mysqlPath) { try { ((mysql --version 2>$null) -split ' ')[4] -replace ',', '' } catch { '' } } else { '' }
@{
  bin = if ($mysqlPath) { $mysqlPath } else { '' }
  status = if ($mysqlService -and $mysqlService.Status -eq 'Running') { 'active' } elseif ($mysqlService -or $mysqlPath) { 'inactive' } else { 'not_found' }
  version = $mysqlVersion
} | ConvertTo-Json -Compress`;
      break;
    default:
      // Generic Windows service check
      psScript = `
$service = Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue
@{
  bin = if ($service) { $service.Name } else { '' }
  status = if ($service -and $service.Status -eq 'Running') { 'active' } elseif ($service) { 'inactive' } else { 'not_found' }
  version = ''
} | ConvertTo-Json -Compress`;
  }
  
  // Encode as Base64 (UTF-16LE as required by PowerShell)
  const base64 = Buffer.from(psScript, 'utf16le').toString('base64');
  return `powershell.exe -NoProfile -EncodedCommand ${base64}`;
}

/**
 * Check if a service is installed and running
 * @param {Object} serverConfig - Server configuration (includes osType)
 * @param {string} serviceName - Service name
 * @returns {Promise<Object>}
 */
async function getServiceStatus(serverConfig, serviceName) {
  const osType = serverConfig.osType || 'ubuntu-debian';
  
  // Windows uses PowerShell commands
  if (osType === 'windows') {
    const checkCommand = getWindowsServiceCommand(serviceName);
    try {
      const { stdout } = await executeCommand(serverConfig, checkCommand);
      const result = JSON.parse(stdout.trim());
      
      const isInstalled = result.bin !== '' || result.status !== 'not_found';
      const isRunning = result.status === 'active' || result.status === 'running';
      
      // For non-daemon tools (nodejs, npm, git), "running" means installed
      if (['nodejs', 'npm', 'git'].includes(serviceName.toLowerCase())) {
        return {
          installed: result.bin !== '' || result.version !== '',
          running: result.bin !== '' || result.version !== '',
          status: (result.bin !== '' || result.version !== '') ? 'installed' : 'not_installed',
          version: result.version || ''
        };
      }
      
      return {
        installed: isInstalled,
        running: isRunning,
        status: !isInstalled ? 'not_installed' : (isRunning ? 'running' : 'stopped'),
        version: result.version || ''
      };
    } catch (err) {
      console.error(`Windows service check failed for ${serviceName}:`, err.message);
      return { installed: false, running: false, status: 'unknown', version: '' };
    }
  }
  
  // Linux/Unix - existing logic
  let checkCommand;
  
  switch (serviceName.toLowerCase()) {
    case 'docker':
      checkCommand = `
        DOCKER_BIN=$(command -v docker 2>/dev/null)
        DOCKER_RUNNING=$(systemctl is-active docker 2>/dev/null || echo "inactive")
        DOCKER_VERSION=$(docker --version 2>/dev/null || echo "")
        echo "BIN:$DOCKER_BIN"
        echo "STATUS:$DOCKER_RUNNING"
        echo "VERSION:$DOCKER_VERSION"
      `;
      break;
    case 'nginx':
      checkCommand = `
        NGINX_BIN=$(command -v nginx 2>/dev/null)
        NGINX_RUNNING=$(systemctl is-active nginx 2>/dev/null || echo "inactive")
        NGINX_VERSION=$(nginx -v 2>&1 || echo "")
        echo "BIN:$NGINX_BIN"
        echo "STATUS:$NGINX_RUNNING"
        echo "VERSION:$NGINX_VERSION"
      `;
      break;
    case 'nodejs':
      checkCommand = `
        NODE_BIN=$(command -v node 2>/dev/null)
        NODE_VERSION=$(node --version 2>/dev/null || echo "")
        echo "BIN:$NODE_BIN"
        echo "STATUS:installed"
        echo "VERSION:$NODE_VERSION"
      `;
      break;
    case 'npm':
      checkCommand = `
        NPM_BIN=$(command -v npm 2>/dev/null)
        NPM_VERSION=$(npm --version 2>/dev/null || echo "")
        echo "BIN:$NPM_BIN"
        echo "STATUS:installed"
        echo "VERSION:$NPM_VERSION"
      `;
      break;
    case 'git':
      checkCommand = `
        GIT_BIN=$(command -v git 2>/dev/null)
        GIT_VERSION=$(git --version 2>/dev/null | sed 's/git version //' || echo "")
        echo "BIN:$GIT_BIN"
        echo "STATUS:installed"
        echo "VERSION:$GIT_VERSION"
      `;
      break;
    default:
      checkCommand = `
        SERVICE_RUNNING=$(systemctl is-active ${serviceName} 2>/dev/null || echo "not_found")
        SERVICE_ENABLED=$(systemctl is-enabled ${serviceName} 2>/dev/null || echo "not_found")
        echo "BIN:"
        echo "STATUS:$SERVICE_RUNNING"
        echo "VERSION:"
      `;
  }
  
  const { stdout } = await executeCommand(serverConfig, checkCommand);
  
  const lines = stdout.split('\n');
  let bin = '', status = '', version = '';
  
  for (const line of lines) {
    if (line.startsWith('BIN:')) bin = line.substring(4).trim();
    if (line.startsWith('STATUS:')) status = line.substring(7).trim();
    if (line.startsWith('VERSION:')) version = line.substring(8).trim();
  }
  
  const isInstalled = bin !== '' || (status !== 'not_found' && status !== '' && status !== 'inactive');
  const isRunning = status === 'active' || status === 'running' || status === 'installed';
  
  if (['nodejs', 'npm', 'git'].includes(serviceName.toLowerCase())) {
    return {
      installed: bin !== '' || version !== '',
      running: bin !== '' || version !== '',
      status: (bin !== '' || version !== '') ? 'installed' : 'not_installed',
      version: version
    };
  }
  
  return {
    installed: isInstalled || bin !== '',
    running: isRunning,
    status: !isInstalled && bin === '' ? 'not_installed' : (isRunning ? 'running' : 'stopped'),
    version: version
  };
}

/**
 * Check if ports are in use on a server
 * @param {Object} serverConfig - Server configuration
 * @param {Array<number>} ports - Ports to check
 * @returns {Promise<Object>}
 */
async function checkPortsAvailable(serverConfig, ports) {
  if (!ports || ports.length === 0) {
    return { available: true, conflicts: [] };
  }

  const osType = serverConfig.osType || 'ubuntu-debian';
  
  let command;
  if (osType === 'windows') {
    // Windows uses netstat
    command = `netstat -ano | findstr ":${ports.join(' :')}"`;
  } else {
    command = `sudo lsof -i :${ports.join(',')} 2>/dev/null || true`;
  }
  
  const { stdout } = await executeCommand(serverConfig, command);

  const lines = stdout.split('\n').filter(line => line.trim());
  const conflicts = [];

  ports.forEach(port => {
    const portInUse = lines.some(line => line.includes(`:${port}`));
    if (portInUse) {
      conflicts.push({
        port,
        inUse: true,
        details: lines.find(line => line.includes(`:${port}`)) || ''
      });
    }
  });

  return {
    available: conflicts.length === 0,
    conflicts
  };
}

module.exports = {
  collectMetrics,
  getOsInfo,
  getServiceStatus,
  checkPortsAvailable,
  LINUX_METRICS_COMMANDS
};
