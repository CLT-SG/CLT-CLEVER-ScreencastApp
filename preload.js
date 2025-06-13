window.ipcRenderer = require('electron').ipcRenderer
window.remote = require('@electron/remote')
window.fs = require('fs')
window.path = require('path')
window.moment = require('moment')
window.os = require('os')
window.config = require(path.join(__dirname, 'config.js'))

var {
    Titlebar,
    TitlebarColor
} = require("custom-electron-titlebar")


var titleOptions = {
    backgroundColor: TitlebarColor.fromHex('#770055'),
    maximizable: false,
    hideWhenClickingClose: true,
    minimizable: false,
    titleHorizontalAlignment: 'right'
}

window.addEventListener('DOMContentLoaded', () => {
    new Titlebar(titleOptions)
})