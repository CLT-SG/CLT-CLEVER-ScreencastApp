const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { getOrCreateDeviceId } = require('../lib/device-id')
const { detectMonitors, monitorsChanged, summarizeMonitors, describeMonitorChange } = require('../lib/monitors')
const { getCapabilities } = require('../lib/capabilities')
const { normalizeConfig, isManualConfigured, serviceBaseUrl, saveServerConfig, loadServerConfig } = require('../lib/server-config')
const { parseAnnouncement, buildAnnounce, isProbe, buildProbe } = require('../lib/discovery')
const { buildRegistrationPayload } = require('../lib/registration')

test('device id stays stable across reads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-id-'))
  const first = getOrCreateDeviceId(dir)
  const second = getOrCreateDeviceId(dir)
  assert.equal(first, second)
  assert.match(first, /[a-f0-9-]{8,}/i)
})

test('detectMonitors maps electron displays', () => {
  const screenApi = {
    getAllDisplays() {
      return [
        { id: 1, label: 'Primary Monitor', bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }
      ]
    },
    getPrimaryDisplay() {
      return { id: 1 }
    }
  }
  const monitors = detectMonitors(screenApi)
  assert.equal(monitors.length, 2)
  assert.equal(monitors[0].primary, true)
  assert.equal(monitors[1].x, 1920)
  assert.equal(monitors[1].name, 'Monitor 2')
  assert.equal(monitors[0].resolution, '1920x1080')
  assert.equal(monitorsChanged(monitors, monitors), false)
  assert.equal(monitorsChanged(monitors, [monitors[0]]), true)
  assert.match(summarizeMonitors(monitors), /Primary: Yes/)
  assert.match(describeMonitorChange([monitors[0]], monitors), /added/)
})

test('capabilities only include supported features', () => {
  const caps = getCapabilities({ audio: false, monitorCount: 2, platform: 'linux' })
  assert.equal(caps.multiMonitor, true)
  assert.equal(caps.monitorSelection, true)
  assert.equal(caps.screenCrop, true)
  assert.equal(caps.vnc.viewOnly, true)
  assert.equal(caps.vnc.reconnect, true)
  assert.equal(caps.vnc.audio, false)
  assert.equal(caps.webrtc_audio, true)
  assert.equal(caps.display.individualMonitorCapture, true)
  assert.equal(Object.prototype.hasOwnProperty.call(caps.vnc, 'encodings'), false)
})

test('manual config takes priority and persists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-cfg-'))
  const saved = saveServerConfig(dir, { mode: 'manual', host: 'clever.local', port: '8000', protocol: 'http' })
  assert.equal(isManualConfigured(saved), true)
  assert.equal(serviceBaseUrl(saved), 'http://clever.local:8000')
  const loaded = loadServerConfig(dir)
  assert.equal(loaded.host, 'clever.local')
  assert.equal(loaded.mode, 'manual')
  assert.equal(isManualConfigured(normalizeConfig({ mode: 'auto', host: 'x' })), false)
})

test('discovery announcement parsing ignores other UDP traffic', () => {
  const parsed = parseAnnouncement(Buffer.from(JSON.stringify(buildAnnounce({
    hostname: 'clever-host',
    ip: '10.0.0.5',
    port: 8000,
    protocol: 'http'
  }))), { address: '10.0.0.5' })
  assert.equal(parsed.host, '10.0.0.5')
  assert.equal(parsed.port, 8000)
  assert.equal(parseAnnouncement(Buffer.from('not-json')), null)
  assert.equal(parseAnnouncement(Buffer.from(JSON.stringify({ type: 'kvm' }))), null)
  assert.equal(isProbe(buildProbe()), true)
})

test('discovery prefers the UDP source IP over a loopback announcement', () => {
  const { pickReachableHost, serverKey, listLanInterfaces, directedBroadcast, isUsableLanIpv4, isVirtualInterfaceName, subnetHostAddresses, shouldAcceptDiscoveredHost } = require('../lib/discovery')
  const rewritten = parseAnnouncement(Buffer.from(JSON.stringify(buildAnnounce({
    hostname: 'clever-host',
    ip: '127.0.0.1',
    port: 8000,
    protocol: 'http'
  }))), { address: '192.168.1.44' })
  assert.equal(rewritten.host, '192.168.1.44')
  assert.equal(rewritten.ip, '192.168.1.44')
  assert.equal(rewritten.advertisedIp, '127.0.0.1')
  assert.equal(pickReachableHost({ advertisedIp: '127.0.0.1', sourceIp: '192.168.1.50' }), '192.168.1.50')
  assert.equal(pickReachableHost({ advertisedIp: '127.0.0.1', sourceIp: '127.0.0.1' }), '127.0.0.1')
  assert.equal(isUsableLanIpv4('127.0.0.1'), false)
  assert.equal(isUsableLanIpv4('192.168.1.44'), true)
  assert.equal(isVirtualInterfaceName('docker0'), true)
  assert.equal(isVirtualInterfaceName('veth1b2c'), true)
  assert.equal(isVirtualInterfaceName('eth0'), false)
  assert.equal(isVirtualInterfaceName('Wi-Fi'), false)
  assert.equal(isVirtualInterfaceName('vEthernet (External)'), false)
  assert.equal(directedBroadcast('192.168.1.44', 24), '192.168.1.255')
  assert.equal(directedBroadcast('10.0.0.50', 23), '10.0.1.255')
  const ifaces = listLanInterfaces({
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true, cidr: '127.0.0.1/8' }],
    docker0: [{ family: 'IPv4', address: '172.17.0.1', internal: false, cidr: '172.17.0.1/16' }],
    eth0: [{ family: 'IPv4', address: '192.168.1.100', internal: false, cidr: '192.168.1.100/24' }],
    'vEthernet (Default Switch)': [{ family: 'IPv4', address: '172.21.16.1', internal: false, cidr: '172.21.16.1/20' }]
  })
  assert.deepEqual(ifaces.map((iface) => iface.address), ['192.168.1.100'])
  assert.equal(serverKey({ hostname: 'clever-a', port: 8000, ip: '192.168.1.44' }), 'clever-a:8000')
  assert.equal(
    serverKey({ hostname: 'clever-a', port: 8000, ip: '192.168.1.44' }),
    serverKey({ hostname: 'CLEVER-A', port: 8000, ip: '10.0.0.8' })
  )
  const subnet = subnetHostAddresses({ address: '192.168.1.77', prefix: 24 })
  assert.equal(subnet.length, 254)
  assert.equal(subnet[0], '192.168.1.1')
  assert.equal(subnet.indexOf('192.168.1.44') !== -1, true)
  assert.equal(shouldAcceptDiscoveredHost('192.168.1.44'), true)
  assert.equal(shouldAcceptDiscoveredHost('127.0.1.1'), false)
  assert.equal(shouldAcceptDiscoveredHost('127.0.1.1', '127.0.1.1'), true)
})

test('http discovery maps the scanned LAN address not a loopback advertisement', () => {
  const { isCleverDiscoverBody, serverFromHttpBody, httpScanTargets } = require('../lib/http-discovery')
  assert.equal(isCleverDiscoverBody({ type: 'clever-service', hostname: 'svc', port: 80 }), true)
  assert.equal(isCleverDiscoverBody({ status: 'ok' }), false)
  const mapped = serverFromHttpBody({
    type: 'clever-service',
    hostname: 'clever-host',
    ip: '127.0.1.1',
    port: 8000
  }, '192.168.1.44', 80, 'http')
  assert.equal(mapped.host, '192.168.1.44')
  assert.equal(mapped.port, 80)
  assert.equal(mapped.advertisedIp, '127.0.1.1')
  const targets = httpScanTargets(['192.168.1.44'], [80, 8000])
  assert.equal(targets.length, 2)
  assert.equal(targets[0].port, 80)
})

test('discovery collects multiple servers and ignores duplicates', () => {
  const { serverKey } = require('../lib/discovery')
  const a = parseAnnouncement(Buffer.from(JSON.stringify(buildAnnounce({
    hostname: 'clever-a',
    ip: '192.168.1.44',
    port: 8000
  }))), { address: '192.168.1.44' })
  const b = parseAnnouncement(Buffer.from(JSON.stringify(buildAnnounce({
    hostname: 'clever-b',
    ip: '192.168.1.50',
    port: 8000
  }))), { address: '192.168.1.50' })
  const duplicate = parseAnnouncement(Buffer.from(JSON.stringify(buildAnnounce({
    hostname: 'clever-a',
    ip: '192.168.1.44',
    port: 8000
  }))), { address: '192.168.1.44' })
  const keys = new Set([serverKey(a), serverKey(b), serverKey(duplicate)])
  assert.equal(keys.size, 2)
  assert.equal(a.host, '192.168.1.44')
  assert.equal(b.host, '192.168.1.50')
})

test('discovery round accepts a unicast announcement and then stops', async () => {
  const dgram = require('dgram')
  const { ServiceDiscovery, buildAnnounce } = require('../lib/discovery')
  const port = 18842
  const found = []
  const discovery = new ServiceDiscovery({
    port,
    timeoutMs: 400,
    retryIntervalMs: 5000,
    fallbackAddresses: ['127.0.0.1'],
    httpScan: false,
    onFound: (server) => found.push(server)
  })
  discovery.start()
  await new Promise((resolve) => setTimeout(resolve, 120))
  const socket = dgram.createSocket('udp4')
  await new Promise((resolve, reject) => {
    socket.bind(0, '127.0.0.1', () => resolve())
    socket.on('error', reject)
  })
  const payload = Buffer.from(JSON.stringify(buildAnnounce({
    hostname: 'clever-local',
    ip: '127.0.0.1',
    port: 8000
  })))
  const listenPort = discovery.listenSocket ? discovery.listenSocket.address().port : port
  await new Promise((resolve, reject) => {
    socket.send(payload, 0, payload.length, listenPort, '127.0.0.1', (err) => err ? reject(err) : resolve())
  })
  await new Promise((resolve) => setTimeout(resolve, 200))
  socket.close()
  discovery.stop()
  assert.ok(found.length >= 1)
  assert.equal(found[0].hostname, 'clever-local')
})

test('registration payload includes monitors and capabilities', () => {
  const payload = buildRegistrationPayload({
    deviceId: 'abc',
    hostname: 'CLT-PC-01',
    hostnameLocal: 'CLT-PC-01.local',
    ip: '192.168.1.100',
    appVersion: '2.1.0',
    os: 'win32',
    monitors: [{ id: '1', x: 0, y: 0, width: 1920, height: 1080, primary: true, online: true }],
    capabilities: { multiMonitor: false }
  })
  assert.equal(payload.deviceId, 'abc')
  assert.equal(payload.hostname, 'CLT-PC-01')
  assert.equal(payload.hostnameLocal, 'CLT-PC-01.local')
  assert.equal(payload.vncPort, 5900)
  assert.equal(payload.wsPort, 8840)
  assert.equal(payload.wsPath, '/screen0')
})

test('mdns hostname is reported without doubling .local', () => {
  const { mdnsHostname } = require('../lib/host-names')
  assert.equal(mdnsHostname('CLT-27AIO'), 'CLT-27AIO.local')
  assert.equal(mdnsHostname('CLT-27AIO.local'), 'CLT-27AIO.local')
  assert.equal(mdnsHostname('192.168.1.100'), '')
})

test('connection candidates keep registered addresses in order', () => {
  const { connectionCandidates, preferredHostname, deriveHostnameLocal } = require('../lib/screencast-target')
  assert.deepEqual(
    connectionCandidates('CLT-27AIO', 'CLT-27AIO.local', '192.168.1.100'),
    ['CLT-27AIO', 'CLT-27AIO.local', '192.168.1.100']
  )
  assert.equal(preferredHostname('CLT-27AIO', 'CLT-27AIO.local'), 'CLT-27AIO')
  assert.equal(deriveHostnameLocal('CLT-27AIO', null), null)
})
