/**
 * Detect and compare display layouts. The Electron `screen` API is injected
 * so this module can be unit-tested without starting Electron.
 */

function detectMonitors(screenApi) {
  if (!screenApi || typeof screenApi.getAllDisplays !== 'function') {
    return []
  }

  const displays = screenApi.getAllDisplays() || []
  const primary = typeof screenApi.getPrimaryDisplay === 'function'
    ? screenApi.getPrimaryDisplay()
    : displays[0]

  return displays.map((display, index) => {
    const bounds = display.bounds || { x: 0, y: 0, width: 0, height: 0 }
    const width = Number(bounds.width) || 0
    const height = Number(bounds.height) || 0
    const name = display.label || display.name || `Monitor ${index + 1}`
    return {
      id: String(display.id != null ? display.id : index),
      name,
      label: name,
      index,
      x: Number(bounds.x) || 0,
      y: Number(bounds.y) || 0,
      width,
      height,
      resolution: `${width}x${height}`,
      primary: !!(primary && display.id === primary.id) || (index === 0 && !primary),
      online: true,
      scaleFactor: Number(display.scaleFactor) || 1,
      rotation: Number(display.rotation) || 0
    }
  })
}

function summarizeMonitors(monitors) {
  return (monitors || []).map((monitor, index) => {
    const name = monitor.name || `Monitor ${index + 1}`
    const primary = monitor.primary ? 'Yes' : 'No'
    return [
      name,
      `X: ${monitor.x}`,
      `Y: ${monitor.y}`,
      `Width: ${monitor.width}`,
      `Height: ${monitor.height}`,
      `Primary: ${primary}`
    ].join('\n')
  }).join('\n\n')
}

function monitorsSignature(monitors) {
  return JSON.stringify((monitors || []).map((monitor) => ({
    id: String(monitor.id),
    x: Number(monitor.x) || 0,
    y: Number(monitor.y) || 0,
    width: Number(monitor.width) || 0,
    height: Number(monitor.height) || 0,
    primary: !!monitor.primary,
    online: monitor.online !== false
  })))
}

function monitorsChanged(previous, next) {
  return monitorsSignature(previous) !== monitorsSignature(next)
}

function describeMonitorChange(previous, next) {
  const before = previous || []
  const after = next || []
  const beforeIds = new Set(before.map((m) => String(m.id)))
  const afterIds = new Set(after.map((m) => String(m.id)))
  const added = after.filter((m) => !beforeIds.has(String(m.id)))
  const removed = before.filter((m) => !afterIds.has(String(m.id)))
  const changed = after.filter((m) => {
    const old = before.find((item) => String(item.id) === String(m.id))
    if (!old) return false
    return old.x !== m.x || old.y !== m.y || old.width !== m.width ||
      old.height !== m.height || !!old.primary !== !!m.primary
  })

  const parts = []
  if (added.length) parts.push(`added ${added.map((m) => m.name || m.id).join(', ')}`)
  if (removed.length) parts.push(`removed ${removed.map((m) => m.name || m.id).join(', ')}`)
  if (changed.length) parts.push(`updated ${changed.map((m) => m.name || m.id).join(', ')}`)
  return parts.join('; ') || 'layout changed'
}

function watchMonitors(screenApi, onChange, logger) {
  if (!screenApi || typeof screenApi.on !== 'function') {
    return () => {}
  }

  const emit = (reason) => {
    const monitors = detectMonitors(screenApi)
    if (logger) logger.info(`Monitor ${reason}: ${monitors.length} display(s)`)
    onChange(monitors, reason)
  }

  const onAdded = () => emit('connected')
  const onRemoved = () => emit('disconnected')
  const onMetrics = (_event, _display, changedMetrics) => {
    const reason = (changedMetrics || []).includes('bounds') ? 'moved-or-resized' : 'metrics-changed'
    emit(reason)
  }

  screenApi.on('display-added', onAdded)
  screenApi.on('display-removed', onRemoved)
  screenApi.on('display-metrics-changed', onMetrics)

  return () => {
    if (typeof screenApi.off === 'function') {
      screenApi.off('display-added', onAdded)
      screenApi.off('display-removed', onRemoved)
      screenApi.off('display-metrics-changed', onMetrics)
    } else if (typeof screenApi.removeListener === 'function') {
      screenApi.removeListener('display-added', onAdded)
      screenApi.removeListener('display-removed', onRemoved)
      screenApi.removeListener('display-metrics-changed', onMetrics)
    }
  }
}

module.exports = {
  detectMonitors,
  summarizeMonitors,
  monitorsSignature,
  monitorsChanged,
  describeMonitorChange,
  watchMonitors
}
