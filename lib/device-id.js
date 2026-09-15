const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')

const FILE_NAME = 'device-id.json'

function deviceIdPath(userDataDir) {
  return path.join(userDataDir, FILE_NAME)
}

/**
 * Stable device identifier persisted in the app userData directory.
 * Falls back to a hostname-based id only when the directory is not writable.
 */
function getOrCreateDeviceId(userDataDir, logger) {
  const filePath = deviceIdPath(userDataDir)
  try {
    if (fs.existsSync(filePath)) {
      const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (stored && typeof stored.deviceId === 'string' && stored.deviceId.length > 0) {
        if (logger) logger.info(`Loaded stable device id from ${filePath}`)
        return stored.deviceId
      }
    }
  } catch (err) {
    if (logger) logger.warn(`Could not read device id file: ${err.message}`)
  }

  const deviceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({
      deviceId,
      hostname: os.hostname(),
      createdAt: new Date().toISOString()
    }, null, 2), 'utf8')
    if (logger) logger.info(`Created stable device id at ${filePath}`)
  } catch (err) {
    if (logger) logger.error(`Could not persist device id: ${err.message}`)
  }
  return deviceId
}

module.exports = {
  getOrCreateDeviceId,
  deviceIdPath
}
