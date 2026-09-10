import { afterEach, describe, expect, test, vi } from 'vitest'
import { JsonRpcGatewayClient, type WebSocketLike } from '../protocol/json-rpc-client'
import { scopedRpcParams, verifyProfileResult } from '../profiles'
import { BrowserHermesTransport, type BrowserConnection } from './browser-transport'

const { httpRequest } = vi.hoisted(() => ({ httpRequest: vi.fn() }))
vi.mock('./native-bridge', () => ({
  HermesNative: { httpRequest }, isNativeHermesClient: () => true, NativeWebSocket: class {},
}))
import { NativeHermesTransport } from './hermes-transport'

const connection: BrowserConnection = { id: 'host', name: 'Host', profile: 'writer', baseUrl: 'https://example.test/base', token: '', authMode: 'oauth', connectionType: 'cloud' }
afterEach(() => { vi.unstubAllGlobals(); httpRequest.mockReset() })

describe('profile transport routing', () => {
  test('browser HTTP actually sends the selected profile without changing authentication', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    const transport = new BrowserHermesTransport(connection)
    await transport.requestJson('/api/config', { config: { model: 'synthetic' } }, { method: 'PUT' })
    expect(fetch).toHaveBeenCalledWith('https://example.test/base/api/config?profile=writer', expect.objectContaining({ method: 'PUT', credentials: 'include' }))
  })
  test('native HTTP uses the original credential identity and selected profile', async () => {
    httpRequest.mockResolvedValue({ status: 200, body: '{}' })
    const transport = new NativeHermesTransport(connection)
    await transport.requestJson('/api/config')
    expect(httpRequest).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'host', url: 'https://example.test/base/api/config?profile=writer' }))
  })
  test.each([BrowserHermesTransport, NativeHermesTransport])('workspace defaults use the scoped configuration resolver', async (Transport) => {
    const transport = new Transport(connection)
    const request = vi.spyOn(transport.gateway, 'request').mockResolvedValue({ cwd: '/synthetic/writer' })
    await expect(transport.requestJson('/api/fs/default-cwd')).resolves.toEqual({ cwd: '/synthetic/writer' })
    expect(request).toHaveBeenCalledWith('config.get', { key: 'project' })
    expect(httpRequest).not.toHaveBeenCalled()
  })
  test('RPC wire frames retain profile for config and session creation and reject foreign routing', async () => {
    class Socket extends EventTarget implements WebSocketLike {
      readyState = 1
      frames: Record<string, unknown>[] = []
      resultProfile = 'writer'
      send(raw: string) {
        const frame = JSON.parse(raw); this.frames.push(frame)
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { info: { profile_name: this.resultProfile } } }) })))
      }
      close() { this.readyState = 3 }
    }
    const socket = new Socket()
    const gateway = new JsonRpcGatewayClient(() => socket, 1000, params => scopedRpcParams('writer', params), (method, result) => verifyProfileResult('writer', method, result))
    const connecting = gateway.connect('wss://example.test')
    socket.dispatchEvent(new Event('open')); await connecting
    await gateway.request('session.create', { profile: '', source: 'hermes-mobile' })
    await gateway.request('config.get')
    await expect(gateway.request('session.resume', { profile: 'other' })).rejects.toThrow('different profile')
    expect(socket.frames.map(frame => frame.params)).toEqual([{ profile: 'writer', source: 'hermes-mobile' }, { profile: 'writer' }])
    socket.resultProfile = 'other'
    await expect(gateway.request('session.activate', { session_id: 'foreign-runtime' })).rejects.toThrow('did not confirm')
    gateway.disconnect()
  })
})
