'use strict'

const { Menu, Tray, shell } = require('electron')

const NOTIFY_TITLE = 'Video Wall Screencast & VNC Notification'
const CACHE_INTERVALS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hour', minutes: 180 }
]

/**
 * System tray icon: reflects casting state and hosts the app menu
 * (the main window is frameless, so there is no menu bar).
 */
class TrayManager {
  /**
   * @param {object} options
   * @param {string} options.idleIcon      path to the idle tray icon
   * @param {string} options.publishIcon   path to the casting tray icon
   * @param {object} options.settings      Settings instance
   * @param {object} options.actions       { onShow, onQuit, onCheckUpdate, onSetCacheInterval }
   */
  constructor ({ idleIcon, publishIcon, settings, actions }) {
    this._idleIcon = idleIcon
    this._publishIcon = publishIcon
    this._tray = new Tray(idleIcon)
    this._tray.setToolTip('Cast not started.')
    this._tray.on('double-click', actions.onShow)

    const selectedMinutes = settings.get('cacheClearMinutes')
    this._tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show App', click: actions.onShow },
      { type: 'separator' },
      {
        label: 'Clear cache every',
        submenu: CACHE_INTERVALS.map(({ label, minutes }) => ({
          label,
          type: 'radio',
          checked: minutes === selectedMinutes,
          click: () => actions.onSetCacheInterval(minutes)
        }))
      },
      { label: 'Check for update', click: actions.onCheckUpdate },
      {
        label: 'About',
        click: () => shell.openExternal('https://www.closed-loop.biz/contact.html')
      },
      { type: 'separator' },
      { label: 'Quit', click: actions.onQuit }
    ]))
  }

  /** Update the icon/tooltip and show a balloon for the casting state. */
  setCasting (casting) {
    if (casting) {
      this._tray.setImage(this._publishIcon)
      this._tray.setToolTip('Screencast & VNC is running.')
      this._balloon('Screencast & VNC start to sharing.')
    } else {
      this._tray.setImage(this._idleIcon)
      this._tray.setToolTip('Cast not started.')
      this._balloon('Screencast & VNC stop to sharing.')
    }
  }

  _balloon (content) {
    if (process.platform === 'win32') {
      this._tray.displayBalloon({ title: NOTIFY_TITLE, content })
    }
  }

  destroy () {
    this._tray.destroy()
  }
}

module.exports = { TrayManager }
