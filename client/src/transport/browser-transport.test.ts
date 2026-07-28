import { afterEach, describe, expect, test, vi } from 'vitest'
import type { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import { BrowserHermesTransport } from './browser-transport'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Cloud gateway compatibility', () => {
  test('falls back to the core Hermes gateway when the mobile plugin is absent', async () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    const gateway = {
      connect,
      disconnect: vi.fn(),
    } as unknown as JsonRpcGatewayClient
    const responses = [
      new Response('{}', { status: 404 }),
      new Response('{"status":"ok"}', { status: 200 }),
      new Response('{"ticket":"fresh","ttl_seconds":30}', { status: 200 }),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(responses.shift())),
    )

    const transport = new BrowserHermesTransport(
      {
        id: 'cloud-agent-1',
        name: 'Cloud Agent',
        baseUrl: 'https://agent.example/hermes',
        profile: 'default',
        token: '',
        authMode: 'oauth',
        connectionType: 'cloud',
      },
      gateway,
    )

    const capabilities = await transport.capabilities()
    await transport.connect()

    expect(capabilities.plugin_version).toBe('core-gateway')
    expect(capabilities.status).toBe('degraded')
    expect(connect).toHaveBeenCalledWith(
      'wss://agent.example/hermes/api/ws?ticket=fresh',
    )
  })
})

describe('authenticated JSON requests', () => {
  test('posts voice payloads through the selected Hermes connection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        '{"ok":true,"transcript":"hello","provider":"test-provider"}',
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const transport = new BrowserHermesTransport({
      id: 'direct-home',
      name: 'Home',
      baseUrl: 'https://hermes.example',
      profile: 'default',
      token: 'local-test-token',
      authMode: 'token',
      connectionType: 'direct',
    })

    const result = await transport.requestJson<{
      transcript: string
    }>('/api/audio/transcribe', {
      data_url: 'data:audio/webm;base64,AAAA',
      mime_type: 'audio/webm',
    })

    expect(result.transcript).toBe('hello')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hermes.example/api/audio/transcribe',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer local-test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          data_url: 'data:audio/webm;base64,AAAA',
          mime_type: 'audio/webm',
        }),
      }),
    )
  })
})
