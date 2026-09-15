document.addEventListener('DOMContentLoaded', () => {
  const closeButton = document.getElementById('close-button')
  const versionSpan = document.getElementById('app-version')
  const titleVersion = document.getElementById('title-version')
  const statusDot = document.getElementById('status-indicator')
  const statusPill = document.getElementById('app-status-pill')
  const statusLabel = document.getElementById('app-status-label')
  const shareStateLabel = document.getElementById('share-state-label')
  const runtimeState = document.getElementById('app-runtime-state')
  const startButton = document.getElementById('start-button')
  const stopButton = document.getElementById('stop-button')
  const restartButton = document.getElementById('restart-button')
  const notificationArea = document.getElementById('notification-area')
  const updateMessage = document.getElementById('update-message')
  const updateStateLabel = document.getElementById('update-state-label')
  const updateProgressTrack = document.getElementById('update-progress-track')
  const updateProgressFill = document.getElementById('update-progress-fill')
  const checkUpdateButton = document.getElementById('check-update-button')
  const downloadUpdateButton = document.getElementById('download-update-button')
  const installUpdateButton = document.getElementById('install-update-button')

  let isConnected = false

  function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div')
    notification.className = `notification ${type}`
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      <button class="notification-close">×</button>
    `
    notificationArea.appendChild(notification)
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.remove()
    })
    setTimeout(() => {
      if (notification.parentNode) notification.remove()
    }, duration)
  }

  function setSharingState(sharing) {
    isConnected = sharing
    if (statusDot) {
      statusDot.classList.toggle('online', sharing)
      statusDot.classList.toggle('offline', !sharing)
    }
    if (statusPill) {
      statusPill.classList.toggle('sharing', sharing)
      statusPill.classList.toggle('idle', !sharing)
    }
    if (statusLabel) statusLabel.textContent = sharing ? 'Sharing' : 'Idle'
    if (shareStateLabel) shareStateLabel.textContent = sharing ? 'Sharing active' : 'Not sharing'
    if (runtimeState) runtimeState.textContent = sharing ? 'Screencast running' : 'Ready'
    if (startButton) startButton.disabled = sharing
    if (stopButton) stopButton.disabled = !sharing
  }

  document.querySelectorAll('.copy-button').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target')
      const textToCopy = document.getElementById(targetId).textContent
      navigator.clipboard.writeText(textToCopy).then(() => {
        button.textContent = 'Copied'
        setTimeout(() => { button.textContent = 'Copy' }, 1600)
        showNotification(`Copied ${textToCopy} to clipboard`, 'success', 2500)
      }).catch(() => {
        showNotification('Failed to copy text', 'error', 2500)
      })
    })
  })

  if (versionSpan) {
    window.api.getAppVersion().then((version) => {
      versionSpan.textContent = version
      if (titleVersion) titleVersion.textContent = 'v' + version
    }).catch((err) => {
      console.error('Error fetching app version:', err)
    })
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => window.api.close())
  }

  window.api.onTrayAction((action) => {
    if (action === 'start') startSharing()
    else if (action === 'stop') stopSharing()
  })

  function startSharing() {
    window.api.setTrayIcon('publish')
    window.api.updateTrayStatus(true)
    setSharingState(true)
    showNotification('VNC sharing started successfully', 'success')
  }

  function stopSharing() {
    window.api.setTrayIcon('stopped')
    window.api.updateTrayStatus(false)
    setSharingState(false)
    showNotification('VNC sharing stopped', 'info')
  }

  if (startButton) startButton.addEventListener('click', startSharing)
  if (stopButton) stopButton.addEventListener('click', stopSharing)
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      if (isConnected) {
        showNotification('Stop sharing before restarting the application.', 'warning')
        return
      }
      showNotification('Restarting application...', 'info')
      setTimeout(() => window.api.restartApp(), 800)
    })
  }

  document.querySelectorAll('.settings-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const setting = event.target.getAttribute('data-setting')
      const value = event.target.checked
      if (setting) {
        window.api.saveConfig(setting, `exports.${setting} = ${value}`, value)
        showNotification(`Setting "${setting}" ${value ? 'enabled' : 'disabled'}`, 'info')
      }
    })
  })

  if (window.api.getAppSettings) {
    window.api.getAppSettings().then((settings) => {
      Object.keys(settings || {}).forEach((key) => {
        const checkbox = document.getElementById(key)
        if (checkbox) checkbox.checked = !!settings[key]
      })
    }).catch(() => {})
  }

  window.api.getHostInfo().then((hostInfo) => {
    setText('ip-address', hostInfo.ip)
    setText('hostname', hostInfo.hostname)
    setText('hostname-local', hostInfo.hostnameLocal)
  }).catch((err) => {
    console.error('Error getting host information:', err)
    showNotification('Failed to detect host information', 'error')
  })

  if (window.api.getSystemInfo) {
    window.api.getSystemInfo().then((info) => {
      setText('app-platform', [info.os, info.arch].filter(Boolean).join(' · '))
      setText('app-packaged', info.packaged ? 'Release build' : 'Development')
      setText('device-os', [info.os, info.release].filter(Boolean).join(' '))
      renderMonitors(info.displays || [])
      if (runtimeState && runtimeState.textContent === 'Starting') {
        runtimeState.textContent = 'Ready'
      }
    }).catch((err) => {
      console.error('Error getting system information:', err)
      setText('monitor-summary', 'Unavailable')
    })
  }

  if (window.api.checkCleverServers) {
    window.api.checkCleverServers().then(renderCleverServers).catch(() => {
      setText('clever-summary', 'Unavailable')
      document.getElementById('clever-servers').innerHTML = '<div class="empty-state">Unable to reach CLEVER-Service hosts.</div>'
    })
  }

  function renderCleverServers(result) {
    const list = document.getElementById('clever-servers')
    const servers = (result && result.servers) || []
    if (!servers.length) {
      setText('clever-summary', 'No hosts configured')
      list.innerHTML = '<div class="empty-state">Add CLEVER-Service addresses in config.js.</div>'
      return
    }
    setText('clever-summary', `${result.onlineCount}/${servers.length} online`)
    list.innerHTML = servers.map((server) => `
      <div class="stack-item">
        <strong>${server.host}</strong>
        <span class="${server.online ? 'online-chip' : 'offline-chip'}">${server.online ? 'Online' : 'Offline'}</span>
      </div>
    `).join('')
  }

  function renderMonitors(displays) {
    const list = document.getElementById('monitor-list')
    if (!displays.length) {
      setText('monitor-summary', 'None detected')
      list.innerHTML = '<div class="empty-state">No displays were reported by the operating system.</div>'
      return
    }
    setText('monitor-summary', `${displays.length} connected`)
    list.innerHTML = displays.map((display) => `
      <div class="stack-item">
        <div>
          <strong>${display.model || 'Display ' + display.id}</strong>
          <div class="source-sub">${display.resolution || 'Unknown resolution'}${display.connection ? ' · ' + display.connection : ''}</div>
        </div>
        <span class="online-chip">${display.builtin ? 'Built-in' : 'External'}</span>
      </div>
    `).join('')
  }

  function createSVGIcon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '40')
    svg.setAttribute('height', '40')
    svg.setAttribute('viewBox', '0 0 40 40')
    if (type === 'warning') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M20 5 L35 35 L5 35 Z')
      path.setAttribute('fill', '#f59e0b')
      svg.appendChild(path)
    } else {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('cx', '20')
      circle.setAttribute('cy', '20')
      circle.setAttribute('r', '17')
      circle.setAttribute('fill', '#ef4444')
      svg.appendChild(circle)
    }
    return svg
  }

  function renderPorts(ports) {
    const portsContainer = document.getElementById('vnc-ports-info')
    portsContainer.innerHTML = ''
    if (!ports.length) {
      setText('vnc-summary', 'None found')
      const noPortsMessage = document.createElement('div')
      noPortsMessage.className = 'no-ports-message'
      noPortsMessage.appendChild(createSVGIcon('warning'))
      noPortsMessage.innerHTML += `
        <p>No VNC ports were found on this system.</p>
        <p>Make sure your VNC server is running and try again.</p>
        <button id="rescan-button" class="ghost-button">Scan Again</button>
      `
      portsContainer.appendChild(noPortsMessage)
      portsContainer.querySelector('#rescan-button').addEventListener('click', rescanPorts)
      showNotification('No VNC ports found', 'warning')
      return
    }

    if (statusDot && !isConnected) statusDot.classList.add('ready')
    setText('vnc-summary', `${ports.length} endpoint${ports.length > 1 ? 's' : ''}`)

    const table = document.createElement('table')
    table.className = 'vnc-ports-table'
    table.innerHTML = `
      <thead>
        <tr>
          <th>Screen</th>
          <th>IP Address</th>
          <th>Hostname</th>
          <th>FQDN</th>
          <th>Actions</th>
        </tr>
      </thead>
    `
    const tbody = document.createElement('tbody')
    ports.forEach((port) => {
      const row = document.createElement('tr')
      const hostnameValue = `${port.hostname}:${port.port}`
      const hostnameLocalValue = `${port.hostnameLocal}:${port.port}`
      row.innerHTML = `
        <td>${port.path.replace('/screen', '')}</td>
        <td class="copy-value">${port.target}</td>
        <td class="copy-value">${hostnameValue}</td>
        <td class="copy-value">${hostnameLocalValue}</td>
        <td><button class="mini-button copy-button">Copy</button></td>
      `
      row.querySelectorAll('.copy-value').forEach((cell) => {
        cell.addEventListener('click', () => {
          navigator.clipboard.writeText(cell.textContent)
          showNotification(`Copied ${cell.textContent} to clipboard`, 'success', 2000)
        })
      })
      row.querySelector('.mini-button').addEventListener('click', () => {
        navigator.clipboard.writeText(hostnameLocalValue)
        showNotification(`Copied ${hostnameLocalValue} to clipboard`, 'success', 2000)
      })
      tbody.appendChild(row)
    })
    table.appendChild(tbody)
    portsContainer.appendChild(table)
    updateConnectionInfo(ports[0])
    showNotification(`Found ${ports.length} VNC connection${ports.length > 1 ? 's' : ''}`, 'success')
  }

  function rescanPorts() {
    const portsContainer = document.getElementById('vnc-ports-info')
    portsContainer.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Scanning for VNC ports…</p>
      </div>
    `
    window.api.scanPortsExtended().then(renderPorts).catch((err) => {
      console.error('Error scanning ports:', err)
      showNotification('Failed to scan ports', 'error')
    })
  }

  window.api.scanPortsExtended().then(renderPorts).catch((err) => {
    console.error('Error scanning ports:', err)
    showNotification('Failed to scan for VNC ports', 'error')
    setText('vnc-summary', 'Scan failed')
    const portsContainer = document.getElementById('vnc-ports-info')
    portsContainer.innerHTML = ''
    const errorMessage = document.createElement('div')
    errorMessage.className = 'error-message'
    errorMessage.appendChild(createSVGIcon('error'))
    errorMessage.innerHTML += `
      <p>Error scanning for VNC ports.</p>
      <p class="error-details">${err.message || 'Unknown error'}</p>
      <button id="retry-scan-button" class="ghost-button">Try Again</button>
    `
    portsContainer.appendChild(errorMessage)
    portsContainer.querySelector('#retry-scan-button').addEventListener('click', () => window.location.reload())
  })

  function updateConnectionInfo(port) {
    if (!port) return
    setText('ip-address', port.target)
    setText('hostname', `${port.hostname}:${port.port}`)
    setText('hostname-local', `${port.hostnameLocal}:${port.port}`)
  }

  function applyUpdateStatus(status) {
    if (!status) return
    if (updateMessage) updateMessage.textContent = status.message || ''
    if (updateStateLabel) updateStateLabel.textContent = status.state || 'idle'
    if (updateProgressTrack) {
      const downloading = status.state === 'downloading'
      updateProgressTrack.hidden = !downloading
      if (downloading && updateProgressFill) {
        updateProgressFill.style.width = Math.round(status.percent || 0) + '%'
      }
    }
    if (checkUpdateButton) checkUpdateButton.disabled = status.state === 'checking' || status.state === 'downloading'
    if (downloadUpdateButton) downloadUpdateButton.hidden = !status.canDownload
    if (installUpdateButton) installUpdateButton.hidden = !status.canInstall
  }

  if (window.api.onUpdateStatus) {
    window.api.onUpdateStatus(applyUpdateStatus)
  }
  if (window.api.getUpdateStatus) {
    window.api.getUpdateStatus().then(applyUpdateStatus).catch(() => {})
  }
  if (checkUpdateButton) {
    checkUpdateButton.addEventListener('click', () => {
      window.api.checkForUpdates().then(applyUpdateStatus)
    })
  }
  if (downloadUpdateButton) {
    downloadUpdateButton.addEventListener('click', () => {
      window.api.downloadUpdate().then(applyUpdateStatus)
    })
  }
  if (installUpdateButton) {
    installUpdateButton.addEventListener('click', () => {
      if (isConnected) {
        showNotification('Update downloaded. Stop sharing before restarting to install.', 'warning')
      }
      window.api.installUpdate().then(applyUpdateStatus)
    })
  }

  const yearElement = document.getElementById('current-year')
  if (yearElement) yearElement.textContent = new Date().getFullYear()

  function setText(id, value) {
    const el = document.getElementById(id)
    if (el && value != null) el.textContent = value
  }
})
