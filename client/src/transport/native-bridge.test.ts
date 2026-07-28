import { beforeEach, describe, expect, test, vi } from 'vitest'

const nativePlugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  sendSocket: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
  registerPlugin: () => nativePlugin,
}))

import {
  NativeWebSocket,
  nativeSocketEventMatches,
} from './native-bridge'

beforeEach(() => {
  vi.clearAllMocks()
  nativePlugin.disconnectSocket.mockResolvedValue(undefined)
  nativePlugin.connectSocket.mockResolvedValue(undefined)
  vi.stubGlobal('WebSocket', {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  })
})

describe('nativeSocketEventMatches', () => {
  test('accepts an event from the current socket generation', () => {
    expect(
      nativeSocketEventMatches('host-1', 'host-1:100:2', {
        connectionId: 'host-1',
        socketId: 'host-1:100:2',
      }),
    ).toBe(true)
  })

  test('rejects a late event from a replaced socket generation', () => {
    expect(
      nativeSocketEventMatches('host-1', 'host-1:100:2', {
        connectionId: 'host-1',
        socketId: 'host-1:90:1',
      }),
    ).toBe(false)
  })

  test('rejects events from another saved connection', () => {
    expect(
      nativeSocketEventMatches('host-1', 'host-1:100:2', {
        connectionId: 'cloud-1',
        socketId: 'host-1:100:2',
      }),
    ).toBe(false)
  })

  test('does not open after being closed while listeners are registering', async () => {
    const listeners: Array<
      (handle: { remove: () => Promise<void> }) => void
    > = []
    const remove = vi.fn().mockResolvedValue(undefined)
    nativePlugin.addListener.mockImplementation(
      () =>
        new Promise(resolve => {
          listeners.push(resolve)
        }),
    )

    const socket = new NativeWebSocket(
      'host-1',
      'wss://host.example.test/api/ws',
    )
    socket.close()
    await Promise.resolve()

    for (const resolve of listeners) resolve({ remove })
    await Promise.resolve()
    await Promise.resolve()

    expect(nativePlugin.disconnectSocket).toHaveBeenCalledOnce()
    expect(nativePlugin.connectSocket).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(2)
    expect(socket.readyState).toBe(WebSocket.CLOSED)
  })
})
