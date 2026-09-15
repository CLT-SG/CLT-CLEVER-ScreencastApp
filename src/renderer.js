'use strict'

// Renderer UI logic. All privileged work happens in the main process;
// this file only renders state received through the preload bridge.
/* global clever */

const $ = (id) => document.getElementById(id)

const els = {
  vncStatus: $('vnc-status'),
  castStatus: $('cast-status'),
  viewers: $('viewers'),
  hostname: $('hostname'),
  ipAddress: $('ip-address'),
  castError: $('cast-error'),
  autoConnect: $('auto-connect'),
  startOnBoot: $('start-on-boot'),
  startCast: $('start-cast'),
  stopCast: $('stop-cast'),
  restartCast: $('restart-cast'),
  copyright: $('copyright'),
  notification: $('notification'),
  notificationMessage: $('notification-message'),
  notificationClose: $('notification-close'),
  notificationRestart: $('notification-restart')
}

function setBadge (el, text, level) {
  el.textContent = text
  el.className = 'value badge' + (level ? ' ' + level : '')
}

function render (state) {
  if (!state) {
    return
  }

  if (state.vncReachable) {
    setBadge(els.vncStatus, 'Online', 'ok')
  } else {
    setBadge(els.vncStatus, 'Waiting\u2026', 'warn')
  }

  if (state.casting) {
    setBadge(els.castStatus, 'Sharing', 'ok')
  } else {
    setBadge(els.castStatus, 'Stopped', '')
  }

  els.viewers.textContent = String(state.viewers)
  els.hostname.textContent = state.hostname || '\u2014'
  els.ipAddress.textContent = state.ipAddress || '\u2014'

  els.castError.textContent = state.castError || ''
  els.castError.classList.toggle('visible', !!state.castError)

  els.autoConnect.checked = !!state.settings.autoConnect
  els.startOnBoot.checked = !!state.settings.startOnBoot

  els.startCast.disabled = state.casting
  els.stopCast.disabled = !state.casting
  els.restartCast.disabled = !state.casting

  els.copyright.textContent = 'Copyright \u00a9 2000-' + new Date().getFullYear() +
    ', Closed-loop. All rights reserved. Version ' + state.version +
    ' | www.closed-loop.biz'
}

async function init () {
  $('titlebar-minimize').addEventListener('click', () => clever.hideWindow())
  $('titlebar-close').addEventListener('click', () => clever.hideWindow())

  els.startCast.addEventListener('click', async () => render(await clever.startCast()))
  els.stopCast.addEventListener('click', async () => render(await clever.stopCast()))
  els.restartCast.addEventListener('click', async () => render(await clever.restartCast()))

  els.autoConnect.addEventListener('change', async () => {
    const state = await clever.setSetting('autoConnect', els.autoConnect.checked)
    if (els.autoConnect.checked && !state.casting) {
      render(await clever.startCast())
    } else if (!els.autoConnect.checked && state.casting) {
      render(await clever.stopCast())
    } else {
      render(state)
    }
  })
  els.startOnBoot.addEventListener('change', async () => {
    render(await clever.setSetting('startOnBoot', els.startOnBoot.checked))
  })

  els.notificationClose.addEventListener('click', () => {
    els.notification.classList.add('hidden')
  })
  els.notificationRestart.addEventListener('click', () => clever.installUpdate())

  clever.onState(render)
  clever.onUpdateEvent((info) => {
    if (info.status === 'available') {
      els.notificationMessage.textContent = 'A new update is available. Downloading now\u2026'
      els.notificationRestart.classList.add('hidden')
    } else if (info.status === 'downloaded') {
      els.notificationMessage.textContent =
        'Update downloaded. It will be installed on restart. Restart now?'
      els.notificationRestart.classList.remove('hidden')
    }
    els.notification.classList.remove('hidden')
  })

  render(await clever.getState())
}

document.addEventListener('DOMContentLoaded', init)
