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

  // Initialize connection status
  window.api.getIpAddress().then(ip => {
    const ipElement = document.getElementById('ip-address');
    if (ipElement) {
      ipElement.textContent = ip;
      console.log(`IP Address detected: ${ip}`);
    }
  }).catch(err => {
    console.error('Error getting IP address:', err);
  });

  // Scan for VNC ports
  window.api.scanPortsExtended().then(ports => {
    console.log('Available VNC ports:', ports);
    if (ports.length > 0 && statusDot) {
      statusDot.classList.add('ready');
      
      // Display port information
      const portsInfo = ports.map(port => `${port.path} -> ${port.target}`).join(', ');
      console.log(`VNC ports configured: ${portsInfo}`);
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