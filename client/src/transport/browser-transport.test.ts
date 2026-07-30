import { afterEach, describe, expect, test, vi } from 'vitest'
import type { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import { BrowserHermesTransport } from './browser-transport'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('core gateway compatibility', () => {
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

  test('uses a standard core gateway for a direct Docker host without the plugin', async () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    const gateway = {
      connect,
      disconnect: vi.fn(),
    } as unknown as JsonRpcGatewayClient
    const responses = [
      new Response('{}', { status: 404 }),
      new Response('{"ok":true,"version":"0.9.0"}', { status: 200 }),
      new Response('{"ticket":"fresh","ttl_seconds":30}', { status: 200 }),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(responses.shift())),
    )

    const transport = new BrowserHermesTransport(
      {
        id: 'docker-direct',
        name: 'Docker Hermes',
        baseUrl: 'https://docker.example',
        profile: 'default',
        token: 'session-token',
        authMode: 'token',
        connectionType: 'direct',
      },
      gateway,
    )

    const capabilities = await transport.capabilities()
    await transport.connect()

    expect(capabilities).toMatchObject({
      hermes_version: '0.9.0',
      plugin_version: 'core-gateway',
      status: 'degraded',
    })
    expect(connect).toHaveBeenCalledWith(
      'wss://docker.example/api/ws?ticket=fresh',
    )
  })

  test('does not bypass an installed direct-host plugin that returns an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"detail":"plugin compatibility failed"}', { status: 500 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const transport = new BrowserHermesTransport({
      id: 'docker-direct',
      name: 'Docker Hermes',
      baseUrl: 'https://docker.example',
      profile: 'default',
      token: 'session-token',
      authMode: 'token',
      connectionType: 'direct',
    })

    await expect(transport.capabilities()).rejects.toThrow(
      'plugin compatibility failed',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('authenticated JSON requests', () => {
  test('downloads a remote file through the authenticated filesystem API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"dataUrl":"data:text/plain;base64,aGVsbG8="}', {
        status: 200,
      }),
    )
    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.fn()
    const anchor = {
      click,
      download: '',
      href: '',
      remove,
      style: { display: '' },
    }
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      body: { appendChild },
      createElement: vi.fn().mockReturnValue(anchor),
    })
    const transport = new BrowserHermesTransport({
      id: 'direct-home',
      name: 'Home',
      baseUrl: 'https://hermes.example',
      profile: 'default',
      token: 'local-test-token',
      authMode: 'token',
      connectionType: 'direct',
    })

    await expect(
      transport.downloadFile('/work/a b.txt', 'a b.txt'),
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hermes.example/api/fs/read-data-url?path=%2Fwork%2Fa%20b.txt',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer local-test-token',
        }),
      }),
    )
    expect(anchor).toMatchObject({
      download: 'a b.txt',
      href: 'data:text/plain;base64,aGVsbG8=',
    })
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
  })

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

  test('supports authenticated PUT requests for deep-merged host config', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
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

    await transport.requestJson(
      '/api/config',
      { config: { terminal: { cwd: '/workspace' } } },
      { method: 'PUT' },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hermes.example/api/config',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          config: { terminal: { cwd: '/workspace' } },
        }),
      }),
    )
  })
})
