document.addEventListener('DOMContentLoaded', () => {
  const DashboardState = window.dashboardState || {};
  const minimizeButton = document.getElementById('minimize-button');
  const maximizeButton = document.getElementById('maximize-button');
  const closeButton = document.getElementById('close-button');
  const versionSpan = document.getElementById('app-version');
  const statusDot = document.getElementById('status-indicator');
  const startButton = document.getElementById('start-button');
  const stopButton = document.getElementById('stop-button');
  const restartButton = document.getElementById('restart-button');
  const notificationArea = document.getElementById('notification-area');
  const checkUpdatesButton = document.getElementById('check-updates-button');
  const downloadUpdateButton = document.getElementById('download-update-button');
  const installUpdateButton = document.getElementById('install-update-button');

  let isConnected = false;
  let serviceSnapshot = null;
  let vncPorts = [];
  let updateStatus = null;
  let heartbeatTimer = null;

  function showNotification(message, type = 'info', duration = 5000) {
    if (!notificationArea) return;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      <button class="notification-close" type="button">×</button>
    `;
    notificationArea.appendChild(notification);
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.classList.add('notification-hiding');
      setTimeout(() => notification.remove(), 300);
    });
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('notification-hiding');
        setTimeout(() => {
          if (notification.parentNode) notification.remove();
        }, 300);
      }
    }, duration);
  }

  function copyText(value, label) {
    if (!value || value === '—' || value === 'Checking…') return;
    navigator.clipboard.writeText(value).then(() => {
      showNotification(`Copied ${label || value} to clipboard`, 'success', 2500);
    }).catch(() => {
      showNotification('Failed to copy text', 'error', 3000);
    });
  }

  document.querySelectorAll('.copy-value').forEach((element) => {
    element.addEventListener('click', () => copyText(element.textContent, element.id));
  });

  if (versionSpan) {
    window.api.getAppVersion().then((version) => {
      versionSpan.textContent = `v${version}`;
    }).catch((err) => {
      console.error('Error fetching app version:', err);
    });
  }

  const settings = window.api.config || {};
  ['autostartup', 'autoshare'].forEach((name) => {
    const checkbox = document.getElementById(name);
    if (checkbox && typeof settings[name] === 'boolean') {
      checkbox.checked = settings[name];
    }
  });

  if (minimizeButton) minimizeButton.addEventListener('click', () => window.api.minimize());
  if (maximizeButton) maximizeButton.addEventListener('click', () => window.api.maximize());
  if (closeButton) closeButton.addEventListener('click', () => window.api.close());

  window.api.onTrayAction((action) => {
    if (action === 'start') startSharing();
    if (action === 'stop') stopSharing();
  });

  function refreshHeader() {
    const overall = DashboardState.overallStatusView
      ? DashboardState.overallStatusView({
          sharing: isConnected,
          connection: serviceSnapshot,
          updater: updateStatus
        })
      : {
          tone: isConnected ? 'success' : 'neutral',
          label: isConnected ? 'Sharing' : 'Idle',
          sharingLabel: isConnected ? 'Sharing' : 'Idle',
          sharingTone: isConnected ? 'success' : 'neutral'
        };

    const overallEl = document.getElementById('overall-status');
    const sharingEl = document.getElementById('sharing-status');
    const updateBadge = document.getElementById('update-badge');
    const vncBadge = document.getElementById('vnc-sharing-badge');

    if (overallEl) {
      overallEl.className = `badge tone-${overall.tone}`;
      overallEl.textContent = overall.label;
    }
    if (sharingEl) {
      sharingEl.className = `badge tone-${overall.sharingTone}`;
      sharingEl.textContent = overall.sharingLabel;
    }
    if (vncBadge) {
      vncBadge.className = `badge tone-${overall.sharingTone}`;
      vncBadge.textContent = overall.sharingLabel;
    }
    if (statusDot) {
      statusDot.className = `status-dot ${isConnected ? 'online' : 'offline'}`;
    }
    if (updateBadge && DashboardState.updaterStatusView) {
      const updaterView = DashboardState.updaterStatusView(updateStatus);
      const show = ['available', 'downloading', 'ready', 'error'].includes(updaterView.state);
      updateBadge.hidden = !show;
      updateBadge.className = `badge tone-${updaterView.tone}`;
      updateBadge.textContent = updaterView.message;
    }
  }

  function startSharing() {
    window.api.setTrayIcon('publish');
    isConnected = true;
    window.api.updateTrayStatus(true);
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
    refreshHeader();
    applyVncInfo();
    showNotification('VNC sharing started successfully', 'success');
  }

  function stopSharing() {
    window.api.setTrayIcon('stopped');
    isConnected = false;
    window.api.updateTrayStatus(false);
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    refreshHeader();
    applyVncInfo();
    showNotification('VNC sharing stopped', 'info');
  }

  if (startButton) startButton.addEventListener('click', startSharing);
  if (stopButton) {
    stopButton.disabled = true;
    stopButton.addEventListener('click', stopSharing);
  }
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      showNotification('Restarting application...', 'info');
      setTimeout(() => window.api.restartApp(), 1000);
    });
  }

  document.querySelectorAll('.settings-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const setting = e.target.getAttribute('data-setting');
      const value = e.target.checked;
      if (!setting) return;
      window.api.saveConfig(setting, `exports.${setting} = ${value}`, value);
      showNotification(`Setting "${setting}" ${value ? 'enabled' : 'disabled'}`, 'info');
    });
  });

  function applyServiceSnapshot(snapshot) {
    serviceSnapshot = snapshot;
    const view = DashboardState.connectionStatusView
      ? DashboardState.connectionStatusView(snapshot)
      : { label: 'Disconnected', tone: 'danger', source: 'Not configured', baseUrl: 'Searching...', deviceId: '', registered: false, lastHeartbeatLabel: 'Never' };

    const dot = document.getElementById('service-status-dot');
    const label = document.getElementById('service-status-label');
    const sourceLabel = document.getElementById('service-source-label');
    const urlLabel = document.getElementById('service-url-label');
    const registrationLabel = document.getElementById('service-registration-label');
    const heartbeatLabel = document.getElementById('service-heartbeat-label');
    const deviceIdLabel = document.getElementById('device-id');
    const autoRadio = document.getElementById('service-mode-auto');
    const manualRadio = document.getElementById('service-mode-manual');
    const hostInput = document.getElementById('service-host');
    const portInput = document.getElementById('service-port');
    const protocolInput = document.getElementById('service-protocol');
    const manualFields = document.getElementById('service-manual-fields');

    if (dot) dot.className = `status-dot ${view.state || view.tone}`;
    if (label) label.textContent = view.label;
    if (sourceLabel) sourceLabel.textContent = view.source;
    if (urlLabel) urlLabel.textContent = view.baseUrl;
    if (registrationLabel) {
      registrationLabel.textContent = view.registered ? 'Registered' : 'Not registered';
    }
    if (heartbeatLabel) {
      heartbeatLabel.textContent = DashboardState.formatTimestamp
        ? DashboardState.formatTimestamp(view.lastHeartbeatAt)
        : view.lastHeartbeatLabel;
    }
    if (deviceIdLabel && view.deviceId) deviceIdLabel.textContent = view.deviceId;
    if (snapshot && snapshot.config) {
      if (autoRadio) autoRadio.checked = snapshot.config.mode !== 'manual';
      if (manualRadio) manualRadio.checked = snapshot.config.mode === 'manual';
      if (hostInput && document.activeElement !== hostInput) hostInput.value = snapshot.config.host || '';
      if (portInput && document.activeElement !== portInput) portInput.value = snapshot.config.port || 8000;
      if (protocolInput && document.activeElement !== protocolInput) protocolInput.value = snapshot.config.protocol || 'http';
    }
    if (manualFields && manualRadio) {
      manualFields.hidden = !manualRadio.checked;
    }
    applyVncInfo();
    refreshHeader();
  }

  function renderMonitors(monitors) {
    const container = document.getElementById('monitors-info');
    const count = document.getElementById('monitor-count');
    const rows = DashboardState.monitorRows ? DashboardState.monitorRows(monitors) : (monitors || []);
    if (count) count.textContent = `${rows.length} display${rows.length === 1 ? '' : 's'}`;
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<p class="muted">No monitors detected.</p>';
      return;
    }
    container.innerHTML = `
      <table class="dashboard-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>ID</th>
            <th>Primary</th>
            <th>Resolution</th>
            <th>X</th>
            <th>Y</th>
            <th>W</th>
            <th>H</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((monitor) => `
            <tr class="${monitor.primary ? 'primary' : ''}">
              <td>${monitor.name}</td>
              <td>${monitor.id}</td>
              <td>${monitor.primary ? 'Yes' : 'No'}</td>
              <td>${monitor.resolution}</td>
              <td>${monitor.x}</td>
              <td>${monitor.y}</td>
              <td>${monitor.width}</td>
              <td>${monitor.height}</td>
              <td>${monitor.online ? 'Online' : 'Offline'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function applyVncInfo() {
    const view = DashboardState.vncView
      ? DashboardState.vncView(serviceSnapshot, vncPorts)
      : { port: 5900, wsPort: 8840, wsPath: '/screen0', connections: vncPorts };
    const portLabel = document.getElementById('vnc-port-label');
    const wsPortLabel = document.getElementById('ws-port-label');
    const wsPathLabel = document.getElementById('ws-path-label');
    const sourceLabel = document.getElementById('vnc-source-label');
    if (portLabel) portLabel.textContent = String(view.port);
    if (wsPortLabel) wsPortLabel.textContent = String(view.wsPort);
    if (wsPathLabel) wsPathLabel.textContent = view.wsPath;
    if (sourceLabel) {
      if (view.connections && view.connections[0]) {
        const first = view.connections[0];
        sourceLabel.textContent = `${first.hostnameLocal || first.hostname || first.target}:${first.port || view.port}`;
      } else {
        sourceLabel.textContent = isConnected ? 'Sharing' : 'No VNC source';
      }
    }
  }

  function renderVncPorts(ports) {
    vncPorts = ports || [];
    applyVncInfo();
    const portsContainer = document.getElementById('vnc-ports-info');
    if (!portsContainer) return;
    portsContainer.innerHTML = '';

    if (vncPorts.length > 0) {
      if (statusDot && !isConnected) statusDot.classList.add('ready');
      const table = document.createElement('table');
      table.className = 'vnc-ports-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Screen</th>
            <th>IP</th>
            <th>Hostname</th>
            <th>FQDN</th>
            <th></th>
          </tr>
        </thead>
      `;
      const tbody = document.createElement('tbody');
      vncPorts.forEach((port) => {
        const row = document.createElement('tr');
        const hostnameValue = `${port.hostname}:${port.port}`;
        const fqdnValue = `${port.hostnameLocal}:${port.port}`;
        row.innerHTML = `
          <td>${String(port.path || '').replace('/screen', '')}</td>
          <td class="copy-value">${port.target}</td>
          <td class="copy-value">${hostnameValue}</td>
          <td class="copy-value">${fqdnValue}</td>
          <td><button class="mini-button copy-button" type="button">Copy</button></td>
        `;
        row.querySelectorAll('.copy-value').forEach((cell) => {
          cell.addEventListener('click', () => copyText(cell.textContent));
        });
        row.querySelector('.copy-button').addEventListener('click', () => copyText(fqdnValue, 'FQDN'));
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      portsContainer.appendChild(table);
      updateConnectionInfo(vncPorts[0]);
      showNotification(`Found ${vncPorts.length} VNC connection${vncPorts.length > 1 ? 's' : ''}`, 'success');
      return;
    }

    const empty = document.createElement('div');
    empty.className = 'no-ports-message';
    empty.innerHTML = `
      <p>No VNC ports were found on this system.</p>
      <p>Make sure your VNC server is running and try again.</p>
      <button id="rescan-button" class="action-button reset-button" type="button">Scan Again</button>
    `;
    portsContainer.appendChild(empty);
    portsContainer.querySelector('#rescan-button').addEventListener('click', scanVncPorts);
    showNotification('No VNC ports found', 'warning');
  }

  function updateConnectionInfo(port) {
    if (!port) return;
    const ipElement = document.getElementById('ip-address');
    const hostnameElement = document.getElementById('hostname');
    const hostnameLocalElement = document.getElementById('hostname-local');
    if (ipElement) ipElement.textContent = port.target;
    if (hostnameElement) hostnameElement.textContent = `${port.hostname}:${port.port}`;
    if (hostnameLocalElement) hostnameLocalElement.textContent = `${port.hostnameLocal}:${port.port}`;
  }

  function scanVncPorts() {
    const portsContainer = document.getElementById('vnc-ports-info');
    if (portsContainer) {
      portsContainer.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Scanning for VNC ports…</p>
        </div>
      `;
    }
    window.api.scanPortsExtended().then(renderVncPorts).catch((err) => {
      console.error('Error scanning ports:', err);
      showNotification('Failed to scan for VNC ports', 'error');
      if (!portsContainer) return;
      portsContainer.innerHTML = `
        <div class="error-message">
          <p>Error scanning for VNC ports.</p>
          <p class="error-details">${err.message || 'Unknown error'}</p>
          <button id="retry-scan-button" class="action-button reset-button" type="button">Try Again</button>
        </div>
      `;
      portsContainer.querySelector('#retry-scan-button').addEventListener('click', scanVncPorts);
    });
  }

  function refreshServiceConnection() {
    if (!window.api.getServiceConnection) return;
    window.api.getServiceConnection().then(applyServiceSnapshot).catch((err) => {
      console.error('Error reading CLEVER-Service connection:', err);
    });
  }

  function refreshMonitors() {
    if (!window.api.getMonitors) return;
    window.api.getMonitors().then(renderMonitors).catch((err) => {
      console.error('Error reading monitors:', err);
    });
  }

  function applyUpdateStatus(status) {
    updateStatus = status;
    const view = DashboardState.updaterStatusView
      ? DashboardState.updaterStatusView(status)
      : { message: 'Idle', canDownload: false, canInstall: false, progress: 0, error: null, busy: false };
    const label = document.getElementById('update-status-label');
    const errorLabel = document.getElementById('update-error-label');
    const progressTrack = document.getElementById('update-progress-track');
    const progressFill = document.getElementById('update-progress-fill');
    if (label) label.textContent = view.message;
    if (errorLabel) {
      errorLabel.hidden = !view.error;
      errorLabel.textContent = view.error || '';
    }
    if (progressTrack && progressFill) {
      const showProgress = view.state === 'downloading' || view.state === 'ready';
      progressTrack.hidden = !showProgress;
      progressFill.style.width = `${view.progress || 0}%`;
    }
    if (checkUpdatesButton) checkUpdatesButton.disabled = !!view.busy;
    if (downloadUpdateButton) downloadUpdateButton.hidden = !view.canDownload;
    if (installUpdateButton) installUpdateButton.hidden = !view.canInstall;
    refreshHeader();
  }

  if (window.api.onServiceConnection) {
    window.api.onServiceConnection((snapshot) => {
      applyServiceSnapshot(snapshot);
      if (snapshot && snapshot.monitors) renderMonitors(snapshot.monitors);
    });
  }
  if (window.api.onMonitorsUpdated) {
    window.api.onMonitorsUpdated(renderMonitors);
  }
  if (window.api.onUpdateStatus) {
    window.api.onUpdateStatus(applyUpdateStatus);
  }

  const AUDIO_STATES = {
    disabled: { text: 'Disabled', css: 'offline' },
    starting: { text: 'Starting', css: 'searching' },
    enabled: { text: 'Enabled', css: 'ready' },
    connected: { text: 'Connected', css: 'online' },
    reconnecting: { text: 'Reconnecting', css: 'reconnecting' },
    error: { text: 'Error', css: 'offline' },
    unsupported: { text: 'Unsupported', css: 'offline' }
  };

  function applyAudioSnapshot(snapshot) {
    if (!snapshot) return;
    const state = snapshot.state || 'disabled';
    const info = AUDIO_STATES[state] || AUDIO_STATES.disabled;
    const dot = document.getElementById('audio-status-dot');
    const label = document.getElementById('audio-status-label');
    const captureLabel = document.getElementById('audio-capture-label');
    const capsLabel = document.getElementById('audio-caps-label');
    const errorLabel = document.getElementById('audio-error-label');
    const systemBox = document.getElementById('audio-system');
    const micBox = document.getElementById('audio-microphone');
    const speakerBox = document.getElementById('audio-speaker');
    const twoWayBox = document.getElementById('audio-twoway');
    const cfg = snapshot.config || {};
    if (dot) {
      dot.className = `status-dot ${info.css}`;
    }
    if (label) label.textContent = info.text;
    if (systemBox && document.activeElement !== systemBox) systemBox.checked = !!cfg.systemAudio;
    if (micBox && document.activeElement !== micBox) micBox.checked = !!cfg.microphone;
    if (speakerBox && document.activeElement !== speakerBox) speakerBox.checked = cfg.speakerOutput !== false;
    if (twoWayBox && document.activeElement !== twoWayBox) twoWayBox.checked = !!cfg.twoWayAudio;
    if (captureLabel) {
      const capturing = snapshot.capturing || {};
      if (!snapshot.clients) {
        captureLabel.textContent = 'Idle (no remote audio client)';
      } else {
        const parts = [];
        if (capturing.systemAudio) parts.push('system');
        if (capturing.microphone) parts.push('microphone');
        captureLabel.textContent = parts.length ? ('Capturing ' + parts.join(' + ')) : 'Waiting for capture';
      }
    }
    if (capsLabel) {
      const caps = snapshot.capabilities || {};
      const parts = [
        caps.system_audio ? 'system audio' : 'no system audio',
        caps.microphone_capture ? 'microphone' : 'no microphone',
        caps.microphone_injection ? 'mic injection' : 'no mic injection'
      ];
      capsLabel.textContent = parts.join(', ');
    }
    if (errorLabel) {
      if (snapshot.error) {
        errorLabel.hidden = false;
        errorLabel.textContent = snapshot.error;
      } else {
        errorLabel.hidden = true;
        errorLabel.textContent = '';
      }
    }
  }

  function refreshAudioStatus() {
    if (!window.api.getAudioStatus) return;
    window.api.getAudioStatus().then(applyAudioSnapshot).catch((err) => {
      console.error('Error reading audio status:', err);
    });
  }

  if (window.api.onAudioStatus) {
    window.api.onAudioStatus(applyAudioSnapshot);
  }

  function bindAudioToggle(id, key) {
    const box = document.getElementById(id);
    if (!box || !window.api.setAudioConfig) return;
    box.addEventListener('change', () => {
      window.api.setAudioConfig({ [key]: box.checked }).then((snapshot) => {
        applyAudioSnapshot(snapshot);
        showNotification('Audio setting updated (VNC is unchanged)', 'info');
      }).catch((err) => {
        console.error(err);
        showNotification('Failed to update audio setting', 'error');
      });
    });
  }
  bindAudioToggle('audio-system', 'systemAudio');
  bindAudioToggle('audio-microphone', 'microphone');
  bindAudioToggle('audio-speaker', 'speakerOutput');
  bindAudioToggle('audio-twoway', 'twoWayAudio');

  const saveServiceButton = document.getElementById('service-save-button');
  if (saveServiceButton) {
    saveServiceButton.addEventListener('click', () => {
      const host = document.getElementById('service-host').value.trim();
      const port = parseInt(document.getElementById('service-port').value, 10);
      const protocol = document.getElementById('service-protocol').value;
      if (!host) {
        showNotification('Enter a CLEVER-Service hostname or IP address', 'warning');
        return;
      }
      window.api.saveServiceConfig({ mode: 'manual', host, port, protocol }).then((snapshot) => {
        applyServiceSnapshot(snapshot);
        showNotification('Manual CLEVER-Service configuration saved', 'success');
      }).catch((err) => {
        console.error(err);
        showNotification('Failed to save server configuration', 'error');
      });
    });
  }

  const searchButton = document.getElementById('service-search-button');
  if (searchButton) {
    searchButton.addEventListener('click', () => {
      window.api.startServiceDiscovery().then((snapshot) => {
        applyServiceSnapshot(snapshot);
        showNotification('Searching for CLEVER-Service...', 'info');
      }).catch((err) => {
        console.error(err);
        showNotification('Could not start discovery', 'error');
      });
    });
  }

  const autoRadio = document.getElementById('service-mode-auto');
  const manualRadio = document.getElementById('service-mode-manual');
  if (autoRadio) {
    autoRadio.addEventListener('change', () => {
      if (autoRadio.checked) window.api.startServiceDiscovery();
    });
  }
  if (manualRadio) {
    manualRadio.addEventListener('change', () => {
      const fields = document.getElementById('service-manual-fields');
      if (fields) fields.hidden = !manualRadio.checked;
    });
  }

  if (checkUpdatesButton) {
    checkUpdatesButton.addEventListener('click', () => {
      if (!window.api.checkForUpdates) return;
      window.api.checkForUpdates().then(applyUpdateStatus).catch((err) => {
        console.error(err);
        showNotification('Update check failed', 'error');
      });
    });
  }
  if (downloadUpdateButton) {
    downloadUpdateButton.addEventListener('click', () => {
      window.api.downloadUpdate().then(applyUpdateStatus).catch((err) => {
        console.error(err);
        showNotification('Update download failed', 'error');
      });
    });
  }
  if (installUpdateButton) {
    installUpdateButton.addEventListener('click', () => {
      window.api.installUpdate();
    });
  }

  window.api.getHostInfo().then((hostInfo) => {
    const ipElement = document.getElementById('ip-address');
    const hostnameElement = document.getElementById('hostname');
    const hostnameLocalElement = document.getElementById('hostname-local');
    if (ipElement) ipElement.textContent = hostInfo.ip;
    if (hostnameElement) hostnameElement.textContent = hostInfo.hostname;
    if (hostnameLocalElement) hostnameLocalElement.textContent = hostInfo.hostnameLocal;
    showNotification('Host information detected', 'success');
    refreshServiceConnection();
    refreshMonitors();
    refreshAudioStatus();
  }).catch((err) => {
    console.error('Error getting host information:', err);
    showNotification('Failed to detect host information', 'error');
  });

  scanVncPorts();
  if (window.api.getUpdateStatus) {
    window.api.getUpdateStatus().then(applyUpdateStatus).catch(() => {});
  }

  heartbeatTimer = setInterval(() => {
    if (serviceSnapshot && DashboardState.formatTimestamp) {
      const heartbeatLabel = document.getElementById('service-heartbeat-label');
      if (heartbeatLabel) {
        heartbeatLabel.textContent = DashboardState.formatTimestamp(serviceSnapshot.lastHeartbeatAt);
      }
    }
  }, 5000);

  const yearElement = document.getElementById('current-year');
  if (yearElement) yearElement.textContent = new Date().getFullYear();

  window.addEventListener('beforeunload', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  });
});
