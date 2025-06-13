// Main renderer process code
document.addEventListener('DOMContentLoaded', () => {
  // Get references to UI elements
  const minimizeButton = document.getElementById('minimize-button');
  const maximizeButton = document.getElementById('maximize-button');
  const closeButton = document.getElementById('close-button');
  const versionSpan = document.getElementById('app-version');
  const statusDot = document.getElementById('status-indicator');
  const startButton = document.getElementById('start-button');
  const stopButton = document.getElementById('stop-button');
  const restartButton = document.getElementById('restart-button');
  const notificationArea = document.getElementById('notification-area');
  
  // Track connection state
  let isConnected = false;

  // Function to show notifications
  function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      <button class="notification-close">×</button>
    `;
    
    notificationArea.appendChild(notification);
    
    // Add event listener to close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.classList.add('notification-hiding');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    // Auto remove after duration
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('notification-hiding');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, duration);
  }

  // Copy to clipboard functionality
  document.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const targetId = e.target.getAttribute('data-target');
      const textToCopy = document.getElementById(targetId).textContent;
      
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          button.textContent = 'Copied!';
          setTimeout(() => {
            button.textContent = 'Copy';
          }, 2000);
          showNotification(`Copied ${textToCopy} to clipboard`, 'success', 3000);
        })
        .catch(err => {
          console.error('Error copying text: ', err);
          showNotification('Failed to copy text', 'error', 3000);
        });
    });
  });

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

  // Listen for tray actions
  window.api.onTrayAction((action) => {
    console.log('Received tray action:', action);
    if (action === 'start') {
      startSharing();
    } else if (action === 'stop') {
      stopSharing();
    }
  });

  // Start/Stop/Restart buttons with enhanced functionality
  function startSharing() {
    window.api.setTrayIcon('publish');
    if (statusDot) {
      statusDot.classList.remove('offline');
      statusDot.classList.add('online');
    }
    isConnected = true;
    window.api.updateTrayStatus(true);
    showNotification('VNC sharing started successfully', 'success');
    console.log('VNC sharing started');
    
    // Update UI elements
    startButton.disabled = true;
    stopButton.disabled = false;
  }
  
  function stopSharing() {
    window.api.setTrayIcon('stopped');
    if (statusDot) {
      statusDot.classList.remove('online');
      statusDot.classList.add('offline');
    }
    isConnected = false;
    window.api.updateTrayStatus(false);
    showNotification('VNC sharing stopped', 'info');
    console.log('VNC sharing stopped');
    
    // Update UI elements
    startButton.disabled = false;
    stopButton.disabled = true;
  }

  if (startButton) {
    startButton.addEventListener('click', startSharing);
  }

  if (stopButton) {
    stopButton.disabled = true; // Initially disabled
    stopButton.addEventListener('click', stopSharing);
  }

  if (restartButton) {
    restartButton.addEventListener('click', () => {
      showNotification('Restarting application...', 'info');
      setTimeout(() => {
        window.api.restartApp();
      }, 1000);
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
            showNotification(`Setting "${setting}" ${value ? 'enabled' : 'disabled'}`, 'info');
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
    
    showNotification('Host information detected', 'success');
    
    // Initialize checkbox states from config
    // Note: we're not explicitly setting the checkbox here since it's already 
    // set in HTML, but in a full implementation you would want to query the current config
  }).catch(err => {
    console.error('Error getting host information:', err);
    showNotification('Failed to detect host information', 'error');
  });

  // Create a reusable function for warning and error icons using SVG
  function createSVGIcon(type) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "40");
    svg.setAttribute("height", "40");
    svg.setAttribute("viewBox", "0 0 40 40");
    
    if (type === 'warning') {
      // Create warning triangle
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M20 5 L35 35 L5 35 Z");
      path.setAttribute("fill", "#ffc107");
      path.setAttribute("stroke", "#ff9800");
      path.setAttribute("stroke-width", "2");
      svg.appendChild(path);
      
      // Add exclamation mark
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", "20");
      text.setAttribute("y", "30");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "white");
      text.setAttribute("font-size", "20");
      text.setAttribute("font-weight", "bold");
      text.textContent = "!";
      svg.appendChild(text);
    } 
    else if (type === 'error') {
      // Create error circle
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "20");
      circle.setAttribute("cy", "20");
      circle.setAttribute("r", "17");
      circle.setAttribute("fill", "#dc3545");
      svg.appendChild(circle);
      
      // Add X mark
      const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line1.setAttribute("x1", "12");
      line1.setAttribute("y1", "12");
      line1.setAttribute("x2", "28");
      line1.setAttribute("y2", "28");
      line1.setAttribute("stroke", "white");
      line1.setAttribute("stroke-width", "3");
      svg.appendChild(line1);
      
      const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line2.setAttribute("x1", "28");
      line2.setAttribute("y1", "12");
      line2.setAttribute("x2", "12");
      line2.setAttribute("y2", "28");
      line2.setAttribute("stroke", "white");
      line2.setAttribute("stroke-width", "3");
      svg.appendChild(line2);
    }
    
    return svg;
  }

  // Scan for VNC ports with enhanced UI
  window.api.scanPortsExtended().then(ports => {
    console.log('Available VNC ports:', ports);
    
    const portsContainer = document.getElementById('vnc-ports-info');
    if (portsContainer) {
      // Clear loading spinner
      portsContainer.innerHTML = '';
      
      if (ports.length > 0) {
        if (statusDot) {
          statusDot.classList.add('ready');
        }
        
        // Check screen size for responsive layout
        const isSmallScreen = window.innerWidth <= 460;
        const isMediumScreen = window.innerWidth <= 650 && window.innerWidth > 460;
        
        // Create table header
        const table = document.createElement('table');
        table.className = 'vnc-ports-table';
        
        // Add header row with different columns based on screen size
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        let headerColumns;
        if (isSmallScreen) {
          headerColumns = ['#', 'Host:Port', 'Actions']; 
        } else if (isMediumScreen) {
          headerColumns = ['#', 'IP Address', 'Hostname', 'Actions'];
        } else {
          headerColumns = ['Screen', 'IP Address', 'Hostname', 'FQDN', 'Actions'];
        }
        
        headerColumns.forEach(headerText => {
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
          
          if (isSmallScreen) {
            // Combined info for small screens
            const combinedCell = document.createElement('td');
            const hostnameValue = `${port.hostnameLocal}:${port.port}`;
            combinedCell.textContent = hostnameValue;
            combinedCell.className = 'copy-value';
            combinedCell.title = 'Click to copy';
            combinedCell.addEventListener('click', () => {
              navigator.clipboard.writeText(hostnameValue);
              showNotification(`Copied ${hostnameValue} to clipboard`, 'success', 2000);
            });
            row.appendChild(combinedCell);
          } else {
            // IP:Port
            const ipCell = document.createElement('td');
            ipCell.textContent = port.target;
            ipCell.className = 'copy-value';
            ipCell.title = 'Click to copy';
            ipCell.addEventListener('click', () => {
              navigator.clipboard.writeText(port.target);
              showNotification(`Copied ${port.target} to clipboard`, 'success', 2000);
            });
            row.appendChild(ipCell);
            
            // Hostname:Port
            const hostnameCell = document.createElement('td');
            const hostnameValue = `${port.hostname}:${port.port}`;
            hostnameCell.textContent = hostnameValue;
            hostnameCell.className = 'copy-value';
            hostnameCell.title = 'Click to copy';
            hostnameCell.addEventListener('click', () => {
              navigator.clipboard.writeText(hostnameValue);
              showNotification(`Copied ${hostnameValue} to clipboard`, 'success', 2000);
            });
            row.appendChild(hostnameCell);
            
            // Only add FQDN column on larger screens
            if (!isMediumScreen) {
              // Hostname.local:Port
              const hostnameLocalCell = document.createElement('td');
              const hostnameLocalValue = `${port.hostnameLocal}:${port.port}`;
              hostnameLocalCell.textContent = hostnameLocalValue;
              hostnameLocalCell.className = 'copy-value';
              hostnameLocalCell.title = 'Click to copy';
              hostnameLocalCell.addEventListener('click', () => {
                navigator.clipboard.writeText(hostnameLocalValue);
                showNotification(`Copied ${hostnameLocalValue} to clipboard`, 'success', 2000);
              });
              row.appendChild(hostnameLocalCell);
            }
          }
          
          // Actions
          const actionsCell = document.createElement('td');
          const copyButton = document.createElement('button');
          copyButton.className = 'mini-button copy-button';
          copyButton.textContent = 'Copy';
          copyButton.addEventListener('click', () => {
            const valueToShare = port.hostnameLocal + ':' + port.port;
            navigator.clipboard.writeText(valueToShare);
            showNotification(`Copied ${valueToShare} to clipboard`, 'success', 2000);
          });
          actionsCell.appendChild(copyButton);
          row.appendChild(actionsCell);
          
          tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        portsContainer.appendChild(table);
        
        showNotification(`Found ${ports.length} VNC connection${ports.length > 1 ? 's' : ''}`, 'success');
      } else {
        // No ports found
        const noPortsMessage = document.createElement('div');
        noPortsMessage.className = 'no-ports-message';
        
        // Create SVG warning icon
        const warningIcon = createSVGIcon('warning');
        warningIcon.classList.add('warning-icon');
        
        noPortsMessage.appendChild(warningIcon);
        noPortsMessage.innerHTML += `
          <p>No VNC ports were found on this system.</p>
          <p>Make sure your VNC server is running and try again.</p>
          <button id="rescan-button" class="action-button">Scan Again</button>
        `;
        portsContainer.appendChild(noPortsMessage);
        
        // Add event listener to rescan button
        portsContainer.querySelector('#rescan-button').addEventListener('click', () => {
          portsContainer.innerHTML = `
            <div class="loading-spinner">
              <div class="spinner"></div>
              <p>Scanning for VNC ports...</p>
            </div>
          `;
          
          setTimeout(() => {
            window.api.scanPortsExtended().then(newPorts => {
              // Recursively call this function to update the UI
              ports = newPorts;
              window.api.scanPortsExtended();
            }).catch(err => {
              console.error('Error scanning ports:', err);
              showNotification('Failed to scan ports', 'error');
            });
          }, 1000);
        });
        
        showNotification('No VNC ports found', 'warning');
      }
    }
  }).catch(err => {
    console.error('Error scanning ports:', err);
    showNotification('Failed to scan for VNC ports', 'error');
    
    const portsContainer = document.getElementById('vnc-ports-info');
    if (portsContainer) {
      // Create error message with SVG
      portsContainer.innerHTML = '';
      const errorMessage = document.createElement('div');
      errorMessage.className = 'error-message';
      
      // Create SVG error icon
      const errorIcon = createSVGIcon('error');
      errorIcon.classList.add('error-icon');
      
      errorMessage.appendChild(errorIcon);
      errorMessage.innerHTML += `
        <p>Error scanning for VNC ports.</p>
        <p class="error-details">${err.message || 'Unknown error'}</p>
        <button id="retry-scan-button" class="action-button">Try Again</button>
      `;
      portsContainer.appendChild(errorMessage);
      
      portsContainer.querySelector('#retry-scan-button').addEventListener('click', () => {
        window.location.reload();
      });
    }
  });
  
  // Set current year in copyright
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
});