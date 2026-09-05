import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discover, endpointHost, parseDevices, parseMdns } from './adb-discovery.mjs'

const host = '192.0.2.8'
test('connected current port beats historical offline port and unrelated devices', () => {
  const result = discover({ host, devices: `List of devices attached\n${host}:40001 offline\n${host}:40002 device model:Example_Phone transport_id:3\n192.0.2.9:40003 device model:Other`, mdns: '' })
  assert.equal(result.endpoint, `${host}:40002`)
  assert.equal(result.status, 'connected')
  assert.equal(result.connected, true)
  assert.equal(result.mdnsAvailable, null, 'A skipped discovery probe is not a successful probe')
})
test('a changed advertised connect port remains unverified', () => {
  const result = discover({ host, devices: `${host}:40001 offline`, mdns: `example _adb-tls-connect._tcp. ${host}:41001` })
  assert.equal(result.endpoint, `${host}:41001`)
  assert.equal(result.connected, false)
  assert.equal(result.status, 'advertised')
})
test('pairing ports and unrelated hosts are excluded', () => {
  assert.deepEqual(parseMdns(`example _adb-tls-pairing._tcp. ${host}:42001`), [])
  const result = discover({ host, devices: '', mdns: 'example _adb-tls-connect._tcp. 192.0.2.9:42001' })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.endpoint, undefined)
})
test('never selects an ambiguous connected or advertised device', () => {
  for (const input of [
    { devices: `${host}:41001 device\n${host}:41002 device`, mdns: '' },
    { devices: '', mdns: `a _adb-tls-connect._tcp. ${host}:41001\nb _adb-tls-connect._tcp. ${host}:41002` },
  ]) {
    const result = discover({ host, ...input })
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.endpoint, undefined)
  }
})
test('duplicate discovery rows do not create false ambiguity', () => {
  assert.equal(discover({ host, devices: `${host}:41001 device\n${host}:41001 device`, mdns: '' }).status, 'connected')
  assert.equal(discover({ host, devices: '', mdns: `a _adb-tls-connect._tcp. ${host}:41001\na _adb-tls-connect._tcp. ${host}:41001` }).status, 'advertised')
})
test('authorization failure is not represented as a usable endpoint', () => {
  const result = discover({ host, devices: `${host}:41001 unauthorized`, mdns: '', mdnsAvailable: false })
  assert.equal(result.reason, 'authorization_required')
  assert.equal(result.endpoint, undefined)
  assert.equal(result.mdnsAvailable, false)
})
test('rejects invalid ports, serials and caller hosts', () => {
  for (const value of [`${host}:0`, `${host}:65536`, `${host}:abc`, 'emulator-5554', 'host;command:42']) assert.equal(endpointHost(value), null)
  assert.deepEqual(parseDevices('emulator-5554 device\nnoise\n'), [])
  assert.throws(() => discover({ host: 'arbitrary-host', devices: '', mdns: '' }))
})
test('bracketed IPv6 endpoints are supported without splitting address colons', () => {
  assert.equal(endpointHost('[2001:db8::8]:40000'), '2001:db8::8')
  assert.equal(discover({ host: '2001:db8::8', devices: '[2001:db8::8]:40000 device', mdns: '' }).status, 'connected')
})
