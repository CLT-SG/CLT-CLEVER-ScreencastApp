function parseJson(data) {
  if (Buffer.isBuffer(data)) {
    data = data.toString('utf8')
  }
  if (typeof data !== 'string') {
    return null
  }
  try {
    return JSON.parse(data)
  } catch (err) {
    return null
  }
}

function isAudioPath(pathname) {
  const path = String(pathname || '')
  return path === '/audio' || path.indexOf('/audio/') === 0
}

module.exports = {
  parseJson,
  isAudioPath
}
