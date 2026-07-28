import { describe, expect, test, vi } from 'vitest'
import {
  JsonRpcGatewayClient,
  WebSocketLike,
} from './json-rpc-client'

class MockSocket extends EventTarget implements WebSocketLike {
  readyState = 0
  sent: string[] = []

  open() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }

  receive(value: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: typeof value === 'string' ? value : JSON.stringify(value),
      }),
    )
  }

  close() {
    this.readyState = 3
    this.dispatchEvent(new Event('close'))
  }

  send(data: string) {
    this.sent.push(data)
  }
}

class DelayedCloseSocket extends MockSocket {
  close() {
    this.readyState = 2
  }

  publishLateClose() {
    this.readyState = 3
    this.dispatchEvent(new Event('close'))
  }
}

describe('JsonRpcGatewayClient', () => {
  test('resolves a request and forwards gateway events', async () => {
    const socket = new MockSocket()
    const client = new JsonRpcGatewayClient(() => socket)
    const listener = vi.fn()
    client.onEvent(listener)

    const connected = client.connect('ws://example.test')
    socket.open()
    await connected

    const resultPromise = client.request<{ ok: boolean }>('fast.ping')
    const outbound = JSON.parse(socket.sent[0]) as { id: string }

    socket.receive(
      [
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'event',
          params: { type: 'gateway.ready', payload: {} },
        }),
        JSON.stringify({
          jsonrpc: '2.0',
          id: outbound.id,
          result: { ok: true },
        }),
      ].join('\n'),
    )

    await expect(resultPromise).resolves.toEqual({ ok: true })
    expect(listener).toHaveBeenCalledWith({
      type: 'gateway.ready',
      payload: {},
    })
  })

  test('rejects pending work when disconnected', async () => {
    const socket = new MockSocket()
    const client = new JsonRpcGatewayClient(() => socket)
    const connected = client.connect('ws://example.test')
    socket.open()
    await connected

    const pending = client.request('slow.method')
    client.disconnect()

    await expect(pending).rejects.toThrow('Gateway disconnected')
  })

  test('supports a short timeout for foreground connection probes', async () => {
    vi.useFakeTimers()
    try {
      const socket = new MockSocket()
      const client = new JsonRpcGatewayClient(() => socket)
      const connected = client.connect('ws://example.test')
      socket.open()
      await connected

      const pending = client.request(
        'session.list',
        {},
        { timeoutMs: 25 },
      )
      const rejection = expect(pending).rejects.toThrow(
        'session.list timed out after 25ms',
      )
      await vi.advanceTimersByTimeAsync(25)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  test('ignores delayed lifecycle events from a replaced socket', async () => {
    const first = new DelayedCloseSocket()
    const second = new MockSocket()
    const sockets = [first, second]
    const states: string[] = []
    const client = new JsonRpcGatewayClient(() => sockets.shift()!)
    client.onState(state => states.push(state))

    const firstConnect = client.connect('ws://first.example.test')
    const firstRejection = expect(firstConnect).rejects.toThrow(
      'Gateway connection replaced',
    )
    const secondConnect = client.connect('ws://second.example.test')
    second.open()
    await secondConnect
    await firstRejection

    const statesAfterReplacement = [...states]
    first.open()
    first.publishLateClose()

    expect(client.connected).toBe(true)
    expect(states).toEqual(statesAfterReplacement)

    const pending = client.request<{ ok: boolean }>('still.current')
    const outbound = JSON.parse(second.sent[0]) as { id: string }
    second.receive({
      jsonrpc: '2.0',
      id: outbound.id,
      result: { ok: true },
    })
    await expect(pending).resolves.toEqual({ ok: true })
  })
})
