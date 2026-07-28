import { describe, expect, test, vi } from 'vitest'
import type { SessionCreateResult } from '../protocol/types'
import type { HermesTransport } from './hermes-transport'
import {
  reconcileForegroundConnection,
  shouldSurfaceGatewayStateError,
} from './foreground-reconnect'

function fakeTransport(
  request: ReturnType<typeof vi.fn>,
): HermesTransport {
  return {
    kind: 'native',
    gateway: {
      request,
      connected: true,
    },
    capabilities: vi.fn(),
    requestJson: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  } as unknown as HermesTransport
}

describe('reconcileForegroundConnection', () => {
  test('leaves a healthy foreground connection and runtime untouched', async () => {
    const request = vi.fn().mockResolvedValue({ sessions: [] })
    const transport = fakeTransport(request)

    const result = await reconcileForegroundConnection({
      transport,
      profile: 'default',
      storedSessionId: 'stored-1',
      probeTimeoutMs: 42,
    })

    expect(result).toEqual({
      reconnected: false,
      resumed: null,
      messages: null,
    })
    expect(request).toHaveBeenCalledWith(
      'session.list',
      { profile: '', limit: 1 },
      { timeoutMs: 42 },
    )
    expect(transport.disconnect).not.toHaveBeenCalled()
    expect(transport.connect).not.toHaveBeenCalled()
  })

  test('reconnects and reattaches the same durable session after a failed probe', async () => {
    const resumed: SessionCreateResult = {
      session_id: 'runtime-2',
      stored_session_id: 'stored-1',
      message_count: 1,
      messages: [{ role: 'assistant', content: 'resume fallback' }],
    }
    const history = [{ role: 'assistant', content: 'current history' }]
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('stale socket'))
      .mockRejectedValueOnce(new Error('still stale'))
      .mockResolvedValueOnce(resumed)
      .mockResolvedValueOnce({ messages: history })
    const transport = fakeTransport(request)

    const result = await reconcileForegroundConnection({
      transport,
      profile: 'work',
      storedSessionId: 'stored-1',
    })

    expect(transport.disconnect).toHaveBeenCalledOnce()
    expect(transport.connect).toHaveBeenCalledOnce()
    expect(request).toHaveBeenNthCalledWith(3, 'session.resume', {
      session_id: 'stored-1',
      profile: 'work',
      source: 'hermes-mobile',
      cols: 100,
    })
    expect(request).toHaveBeenNthCalledWith(4, 'session.history', {
      session_id: 'runtime-2',
    })
    expect(result).toEqual({
      reconnected: true,
      resumed,
      messages: history,
    })
  })

  test('reconnects without manufacturing a session when no chat is selected', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('closed'))
      .mockRejectedValueOnce(new Error('still closed'))
    const transport = fakeTransport(request)

    const result = await reconcileForegroundConnection({
      transport,
      profile: 'default',
      storedSessionId: '',
    })

    expect(transport.disconnect).toHaveBeenCalledOnce()
    expect(transport.connect).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.resumed).toBeNull()
  })

  test('keeps the current socket after one transiently slow probe', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('slow response'))
      .mockResolvedValueOnce({ sessions: [] })
    const transport = fakeTransport(request)

    const result = await reconcileForegroundConnection({
      transport,
      profile: 'default',
      storedSessionId: 'stored-1',
      probeTimeoutMs: 25,
      confirmTimeoutMs: 50,
    })

    expect(request).toHaveBeenNthCalledWith(
      1,
      'session.list',
      { profile: '', limit: 1 },
      { timeoutMs: 25 },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      'session.list',
      { profile: '', limit: 1 },
      { timeoutMs: 50 },
    )
    expect(transport.disconnect).not.toHaveBeenCalled()
    expect(transport.connect).not.toHaveBeenCalled()
    expect(result.reconnected).toBe(false)
  })
})

describe('shouldSurfaceGatewayStateError', () => {
  test('keeps expected background socket failures silent', () => {
    expect(shouldSurfaceGatewayStateError(false, true)).toBe(false)
    expect(shouldSurfaceGatewayStateError(false, false)).toBe(false)
  })

  test('only surfaces a gateway failure during a foreground connection attempt', () => {
    expect(shouldSurfaceGatewayStateError(true, true)).toBe(true)
    expect(shouldSurfaceGatewayStateError(true, false)).toBe(false)
  })
})
