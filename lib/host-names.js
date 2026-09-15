'use strict'

function isIp(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || '').trim())
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\.+$/, '')
}

function mdnsHostname(hostname) {
  const host = normalizeName(hostname)
  if (!host || isIp(host)) {
    return ''
  }
  if (/\.local$/i.test(host)) {
    return host
  }
  return host + '.local'
}

function websockifyPath(vncPort) {
  return 'screen' + Math.max(0, Number(vncPort || 5900) - 5900)
}

module.exports = {
  isIp,
  normalizeName,
  mdnsHostname,
  websockifyPath
}
