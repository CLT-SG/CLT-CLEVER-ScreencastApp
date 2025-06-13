// Main renderer process code
document.addEventListener('DOMContentLoaded', () => {
  // Get references to window control buttons if they exist
  const minimizeButton = document.getElementById('minimize-button');
  const maximizeButton = document.getElementById('maximize-button');
  const closeButton = document.getElementById('close-button');
  const reloadButton = document.getElementById('reload-button');
  const versionSpan = document.getElementById('app-version');
  const statusDot = document.querySelector('.status-dot');
  const startButton = document.getElementById('start-button');
  const stopButton = document.getElementById('stop-button');
  const restartButton = document.getElementById('restart-button');

  // Fetch version and update UI
  if (versionSpan) {
    window.api.getAppVersion().then(version => {
      versionSpan.textContent = version;
    }).catch(err => {
      console.error('Error fetching app version:', err);
    });
  }

  // Window control buttons
  if (minimizeButton) {
    minimizeButton.addEventListener('click', () => {
      window.api.minimize();
    });
  }

  if (maximizeButton) {
    maximizeButton.addEventListener('click', () => {
      window.api.maximize();
    });
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.api.close();
    });
  }

  if (reloadButton) {
    reloadButton.addEventListener('click', () => {
      window.api.reloadPage();
    });
  }

  // Start/Stop/Restart buttons with simplified functionality
  if (startButton) {
    startButton.addEventListener('click', () => {
      window.api.setTrayIcon('publish');
      if (statusDot) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
      }
      console.log('VNC sharing started');
    });
  }

  if (stopButton) {
    stopButton.addEventListener('click', () => {
      window.api.setTrayIcon('stopped');
      if (statusDot) {
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
      }
      console.log('VNC sharing stopped');
    });
  }

  if (restartButton) {
    restartButton.addEventListener('click', () => {
      window.api.restartApp();
    });
  }

  // Handle settings checkboxes
  const settingsCheckboxes = document.querySelectorAll('.settings-checkbox');
  if (settingsCheckboxes.length > 0) {
    settingsCheckboxes.forEach(checkbox => {
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          const setting = e.target.getAttribute('data-setting');
          const value = e.target.checked;
          if (setting) {
            window.api.saveConfig(setting, `exports.${setting} = ${value}`, value);
          }
        });
      }
    });
  }

  // Initialize connection status and hostname information
  window.api.getHostInfo().then(hostInfo => {
    const ipElement = document.getElementById('ip-address');
    const hostnameElement = document.getElementById('hostname');
    const hostnameLocalElement = document.getElementById('hostname-local');
    
    if (ipElement) {
      ipElement.textContent = hostInfo.ip;
      console.log(`IP Address detected: ${hostInfo.ip}`);
    }
    
    if (hostnameElement) {
      hostnameElement.textContent = hostInfo.hostname;
      console.log(`Hostname detected: ${hostInfo.hostname}`);
    }
    
    if (hostnameLocalElement) {
      hostnameLocalElement.textContent = hostInfo.hostnameLocal;
      console.log(`Hostname.local detected: ${hostInfo.hostnameLocal}`);
    }
  }).catch(err => {
    console.error('Error getting host information:', err);
  });

  // Scan for VNC ports
  window.api.scanPortsExtended().then(ports => {
    console.log('Available VNC ports:', ports);
    if (ports.length > 0 && statusDot) {
      statusDot.classList.add('ready');
      
      // Display port information
      const portsContainer = document.getElementById('vnc-ports-info');
      if (portsContainer) {
        // Clear previous content
        portsContainer.innerHTML = '';
        
        // Create table header
        const table = document.createElement('table');
        table.className = 'vnc-ports-table';
        
        // Add header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Screen', 'IP Address', 'Hostname', 'Hostname.local'].forEach(headerText => {
          const th = document.createElement('th');
          th.textContent = headerText;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Add data rows
        const tbody = document.createElement('tbody');
        ports.forEach(port => {
          const row = document.createElement('tr');
          
          // Screen number
          const screenCell = document.createElement('td');
          screenCell.textContent = port.path.replace('/screen', '');
          row.appendChild(screenCell);
          
          // IP:Port
          const ipCell = document.createElement('td');
          ipCell.textContent = port.target;
          row.appendChild(ipCell);
          
          // Hostname:Port
          const hostnameCell = document.createElement('td');
          hostnameCell.textContent = `${port.hostname}:${port.port}`;
          row.appendChild(hostnameCell);
          
          // Hostname.local:Port
          const hostnameLocalCell = document.createElement('td');
          hostnameLocalCell.textContent = `${port.hostnameLocal}:${port.port}`;
          row.appendChild(hostnameLocalCell);
          
          tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        portsContainer.appendChild(table);
      }
      
      // Log ports info
      const portsInfo = ports.map(port => `${port.path} -> IP: ${port.target}, Hostname: ${port.hostname}:${port.port}, FQDN: ${port.hostnameLocal}:${port.port}`).join('\n');
      console.log(`VNC ports configured:\n${portsInfo}`);
    }
  }).catch(err => {
    console.error('Error scanning ports:', err);
  });
  
  // Set current year in copyright
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
});