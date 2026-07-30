import { beforeEach, describe, expect, test, vi } from 'vitest'

const { httpRequest } = vi.hoisted(() => ({
  httpRequest: vi.fn(),
}))

vi.mock('./native-bridge', () => ({
  HermesNative: {
    hasCredential: vi.fn(),
    httpRequest,
    setCredential: vi.fn(),
  },
  isNativeHermesClient: () => true,
  NativeWebSocket: class {},
}))

import { NativeHermesTransport } from './hermes-transport'

beforeEach(() => {
  httpRequest.mockReset()
})

describe('native core gateway compatibility', () => {
  test('accepts Cloud status metadata when health is unavailable', async () => {
    httpRequest
      .mockResolvedValueOnce({ status: 404, body: '{}', headers: {} })
      .mockResolvedValueOnce({ status: 404, body: '{}', headers: {} })
      .mockResolvedValueOnce({
        status: 200,
        body: '{"version":"0.19.0","gateway_running":true}',
        headers: {},
      })

    const transport = new NativeHermesTransport({
      id: 'cloud-agent',
      name: 'Cloud agent',
      baseUrl: 'https://agent.agents.nousresearch.com',
      profile: 'default',
      token: '',
      authMode: 'oauth',
      connectionType: 'cloud',
    })

    await expect(transport.capabilities()).resolves.toMatchObject({
      hermes_version: '0.19.0',
      plugin_version: 'core-gateway',
    })
    expect(httpRequest).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        connectionId: 'cloud-agent',
        url: 'https://agent.agents.nousresearch.com/api/status',
      }),
    )
  })
})
