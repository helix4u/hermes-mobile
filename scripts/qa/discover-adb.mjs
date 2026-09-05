// Emits one private runtime JSON object. Never scans, connects, enables ADB, or resets its server.
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { isIP } from 'node:net'
import { discover } from './adb-discovery.mjs'

const { values } = parseArgs({ options: {
  host: { type: 'string' }, adb: { type: 'string', default: 'adb' },
} })
if (!values.host || !isIP(values.host)) throw new Error('Required: --host <explicitly authorized device IP>')
const read = args => execFileSync(values.adb, args, {
  windowsHide: true, encoding: 'utf8', timeout: 10000,
  stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
})
try {
  const devices = read(['devices', '-l'])
  let mdns = '', mdnsAvailable = null
  // A connected device is sufficient; avoid unnecessary discovery work.
  let result = discover({ host: values.host, devices, mdns, mdnsAvailable })
  if (result.status !== 'connected') {
    try { mdns = read(['mdns', 'services']); mdnsAvailable = true } catch { mdnsAvailable = false }
    result = discover({ host: values.host, devices, mdns, mdnsAvailable })
  }
  console.log(JSON.stringify({ ...result, observedAt: new Date().toISOString(), validForMs: 15000 }))
  process.exitCode = result.connected ? 0 : 2
} catch {
  console.log(JSON.stringify({ schema: 1, status: 'unavailable', connected: false, reason: 'adb_inventory_failed', observedAt: new Date().toISOString(), validForMs: 0 }))
  process.exitCode = 2
}
