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

  it('recovers a starting host before choosing authentication, without opening sign-in', async () => {
    vi.useFakeTimers()
    try {
      const native = bridge()
      vi.mocked(native.gatewayStatus).mockRejectedValueOnce(
        new Error('Hermes gateway health returned HTTP 502'),
      )
      const onRetry = vi.fn()
      const pending = prepareDirectAuthentication(connection(), true, native, { onRetry })
      await vi.advanceTimersByTimeAsync(249)
      expect(native.gatewayStatus).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(await pending).toMatchObject({ id: 'docker-host', authMode: 'token' })
      expect(native.gatewayStatus).toHaveBeenCalledTimes(2)
      expect(onRetry).toHaveBeenCalledOnce()
      expect(native.gatewayLogin).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([401, 403, 429, 500])('does not retry HTTP %s or open sign-in after a failed probe', async (status) => {
    const error = new Error(`Hermes gateway health returned HTTP ${status}`)
    const native = bridge({ gatewayStatus: vi.fn().mockRejectedValue(error) })
    await expect(prepareDirectAuthentication(connection(), true, native)).rejects.toBe(error)
    expect(native.gatewayStatus).toHaveBeenCalledOnce()
    expect(native.gatewayLogin).not.toHaveBeenCalled()
  })

  it('cancels a delayed retry when the user disconnects or selects another host', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const native = bridge({ gatewayStatus: vi.fn().mockRejectedValue(new Error('Hermes gateway health returned HTTP 503')) })
      const pending = prepareDirectAuthentication(connection(), true, native, { signal: controller.signal })
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await vi.advanceTimersByTimeAsync(0)
      controller.abort()
      await rejected
      await vi.runAllTimersAsync()
      expect(native.gatewayStatus).toHaveBeenCalledOnce()
      expect(native.gatewayLogin).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not open sign-in from a late probe after cancellation', async () => {
    const controller = new AbortController()
    let finish!: (value: Awaited<ReturnType<DirectGatewayAuthBridge['gatewayStatus']>>) => void
    const native = bridge({ gatewayStatus: vi.fn(() => new Promise<Awaited<ReturnType<DirectGatewayAuthBridge['gatewayStatus']>>>(resolve => { finish = resolve })) })
    const pending = prepareDirectAuthentication(connection(), true, native, { signal: controller.signal })
    controller.abort()
    finish({ baseUrl: 'https://docker.example', authRequired: true, signedIn: false, version: '1' })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(native.gatewayLogin).not.toHaveBeenCalled()
  })

  it('exhausts a bounded startup retry budget instead of waiting forever', async () => {
    vi.useFakeTimers()
    try {
      const error = new Error('Hermes gateway health returned HTTP 504')
      const native = bridge({ gatewayStatus: vi.fn().mockRejectedValue(error) })
      const pending = prepareDirectAuthentication(connection(), true, native)
      const rejected = expect(pending).rejects.toBe(error)
      await vi.runAllTimersAsync()
      await rejected
      expect(native.gatewayStatus).toHaveBeenCalledTimes(8)
      expect(native.gatewayLogin).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
