// Read-only discovery. An advertised endpoint is not proof of a connected device.
import { isIP } from 'node:net'

export function endpointHost(serial) {
  const match = /^(?:\[([^\]]+)\]|([^:\s]+)):(\d+)$/.exec(serial)
  if (!match || Number(match[3]) < 1 || Number(match[3]) > 65535) return null
  const host = match[1] || match[2]
  return isIP(host) ? host : null
}

export function parseDevices(text) {
  return String(text).split(/\r?\n/).flatMap(line => {
    const [serial, state, ...metadata] = line.trim().split(/\s+/)
    if (!endpointHost(serial) || !['device', 'offline', 'unauthorized'].includes(state)) return []
    const model = metadata.find(field => field.startsWith('model:'))?.slice(6) ?? null
    return [{ endpoint: serial, state, model }]
  })
}

export function parseMdns(text) {
  return String(text).split(/\r?\n/).flatMap(line => {
    const fields = line.trim().split(/\s+/)
    // Pairing advertisements must never be mistaken for the connect port.
    if (fields.length !== 3 || !/^_adb-tls-connect\._tcp\.?$/.test(fields[1])) return []
    return endpointHost(fields[2]) ? [fields[2]] : []
  })
}

export function discover({ host, devices, mdns, mdnsAvailable = null }) {
  if (!isIP(host)) throw new Error('Expected one explicitly configured IP address.')
  const relevant = parseDevices(devices).filter(row => endpointHost(row.endpoint) === host)
  const connected = [...new Map(relevant.filter(row => row.state === 'device').map(row => [row.endpoint, row])).values()]
  const advertised = [...new Set(parseMdns(mdns).filter(endpoint => endpointHost(endpoint) === host))]
  const base = { schema: 1, source: 'adb-discovery', mdnsAvailable, connected: false }
  if (connected.length === 1) return { ...base, status: 'connected', connected: true, ...connected[0] }
  if (connected.length > 1) return { ...base, status: 'ambiguous', reason: 'multiple_connected_endpoints', candidates: connected.map(row => row.endpoint) }
  if (advertised.length === 1) return { ...base, status: 'advertised', endpoint: advertised[0], reason: 'connection_not_verified' }
  if (advertised.length > 1) return { ...base, status: 'ambiguous', reason: 'multiple_advertised_endpoints', candidates: advertised }
  return { ...base, status: 'unavailable', reason: relevant.some(row => row.state === 'unauthorized') ? 'authorization_required' : 'no_connected_or_advertised_endpoint' }
}
