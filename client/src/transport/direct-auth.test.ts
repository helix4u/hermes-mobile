import { describe, expect, it, vi } from 'vitest'
import type { BrowserConnection } from './browser-transport'
import {
  prepareDirectAuthentication,
  type DirectGatewayAuthBridge,
} from './direct-auth'

function connection(
  overrides: Partial<BrowserConnection> = {},
): BrowserConnection {
  return {
    id: 'docker-host',
    name: 'Docker Hermes',
    baseUrl: 'docker.example/',
    profile: 'default',
    token: 'session-token',
    authMode: 'token',
    connectionType: 'direct',
    ...overrides,
  }
}

function bridge(
  overrides: Partial<DirectGatewayAuthBridge> = {},
): DirectGatewayAuthBridge {
  return {
    gatewayStatus: vi.fn().mockResolvedValue({
      baseUrl: 'https://docker.example',
      authRequired: false,
      signedIn: false,
      version: '0.9.0',
    }),
    gatewayLogin: vi.fn(),
    ...overrides,
  }
}

describe('direct gateway authentication', () => {
  it('keeps legacy token mode for an ungated Docker gateway', async () => {
    const native = bridge()

    const result = await prepareDirectAuthentication(connection(), true, native)

    expect(result).toMatchObject({
      authMode: 'token',
      baseUrl: 'https://docker.example',
      token: 'session-token',
    })
    expect(native.gatewayStatus).toHaveBeenCalledWith({
      connectionId: 'docker-host',
      baseUrl: 'https://docker.example',
    })
    expect(native.gatewayLogin).not.toHaveBeenCalled()
  })

  it('reuses a live signed-in session for a gated Docker gateway', async () => {
    const native = bridge({
      gatewayStatus: vi.fn().mockResolvedValue({
        baseUrl: 'https://docker.example',
        authRequired: true,
        signedIn: true,
        version: '0.9.0',
      }),
    })

    const result = await prepareDirectAuthentication(connection(), true, native)

    expect(result).toMatchObject({
      authMode: 'oauth',
      baseUrl: 'https://docker.example',
      token: '',
    })
    expect(native.gatewayLogin).not.toHaveBeenCalled()
  })

  it('opens host sign-in when a gated Docker session is absent', async () => {
    const gatewayLogin = vi.fn().mockResolvedValue({
      baseUrl: 'https://docker.example',
      connected: true,
    })
    const native = bridge({
      gatewayStatus: vi.fn().mockResolvedValue({
        baseUrl: 'https://docker.example',
        authRequired: true,
        signedIn: false,
        version: '0.9.0',
      }),
      gatewayLogin,
    })

    const result = await prepareDirectAuthentication(connection(), true, native)

    expect(gatewayLogin).toHaveBeenCalledWith({
      connectionId: 'docker-host',
      baseUrl: 'https://docker.example',
    })
    expect(result.authMode).toBe('oauth')
    expect(result.token).toBe('')
  })

  it('does not run native gateway discovery for the browser client', async () => {
    const native = bridge()
    const target = connection()

    const result = await prepareDirectAuthentication(target, false, native)

    expect(result).toBe(target)
    expect(native.gatewayStatus).not.toHaveBeenCalled()
  })
})
