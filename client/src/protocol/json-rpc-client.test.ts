import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  JsonRpcGatewayClient,
  JsonRpcGatewayError,
  isSubmissionDeliveryUncertain,
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
  test('keys shared submissions without mutating callers and resets the capability on reconnect', async () => {
    const sockets = [new MockSocket(), new MockSocket()]
    let next = 0
    const client = new JsonRpcGatewayClient(() => sockets[next++])
    const opened = client.connect('ws://fixture.test/api/ws')
    sockets[0].open()
    await opened
    sockets[0].receive({ method: 'event', params: { type: 'gateway.ready', payload: { shared_runtime: true } } })
    const params = { session_id: 'fixture-runtime', text: 'synthetic request' }
    const first = client.request('prompt.submit', params)
    const frame = JSON.parse(sockets[0].sent.at(-1)!)
    expect(frame.params.submission_id).toMatch(/^[a-f0-9-]{36}$/)
    expect(params).not.toHaveProperty('submission_id')
    sockets[0].receive({ id: frame.id, result: { status: 'streaming' } })
    await first

    const keyed = client.request('prompt.submit', { ...params, submission_id: 'preserved-key' })
    const supplied = JSON.parse(sockets[0].sent.at(-1)!)
    expect(supplied.params.submission_id).toBe('preserved-key')
    sockets[0].receive({ id: supplied.id, result: { status: 'streaming' } })
    await keyed
    client.disconnect()

    const reopened = client.connect('ws://legacy.test/api/ws')
    sockets[1].open()
    await reopened
    const legacy = client.request('prompt.submit', params)
    const old = JSON.parse(sockets[1].sent.at(-1)!)
    expect(old.params).toEqual(params)
    sockets[1].receive({ id: old.id, result: { status: 'streaming' } })
    await legacy
    client.disconnect()
  })

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

interface RequestFrame {
  id: string
  jsonrpc: '2.0'
  method: string
  params: Record<string, unknown>
}

const frames = (socket: MockSocket): RequestFrame[] =>
  socket.sent.map(text => JSON.parse(text) as RequestFrame)

const ready = (socket: MockSocket, payload: unknown): void =>
  socket.receive({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready', payload } })

function dispatch(
  client: JsonRpcGatewayClient,
  socket: MockSocket,
  method: string,
  params?: Record<string, unknown>,
  timeoutMs?: number,
) {
  const before = socket.sent.length
  const outcome = client.request<unknown>(method, params, { timeoutMs }).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error: error as Error }),
  )
  const frame = frames(socket).slice(before).find(candidate => candidate.method === method)

  return { frame, outcome }
}

async function roundTrip(
  client: JsonRpcGatewayClient,
  socket: MockSocket,
  method: string,
  params?: Record<string, unknown>,
): Promise<RequestFrame> {
  const call = dispatch(client, socket, method, params)
  expect(call.frame).toMatchObject({ jsonrpc: '2.0', method })
  socket.receive({ jsonrpc: '2.0', id: call.frame!.id, result: { accepted: true } })
  expect(await call.outcome).toEqual({ ok: true, value: { accepted: true } })

  return call.frame!
}

describe('Mobile shared-runtime admission at the wire boundary', () => {
  const clients: JsonRpcGatewayClient[] = []
  const connectionSettlements: Promise<unknown>[] = []

  function makeClient(sockets: MockSocket[]): JsonRpcGatewayClient {
    let next = 0
    const client = new JsonRpcGatewayClient(() => sockets[next++])
    clients.push(client)

    return client
  }

  async function open(client: JsonRpcGatewayClient, socket: MockSocket, url = 'ws://source-a.test/api/ws') {
    const pending = client.connect(url)
    socket.open()
    await pending
  }

  beforeEach(() => {
    clients.length = 0
    connectionSettlements.length = 0
    vi.useFakeTimers()
    let sequence = 0
    const createKey = (): ReturnType<Crypto['randomUUID']> =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(createKey)
  })

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect()
    }
    await Promise.allSettled(connectionSettlements)
    connectionSettlements.length = 0
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('allocates independent keys per send and correlates out-of-order replies without mutating callers', async () => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    const params = Object.freeze({ session_id: 'session-a', text: 'Synthetic prompt' })
    const first = dispatch(client, socket, 'prompt.submit', params)
    const second = dispatch(client, socket, 'prompt.submit', params)

    expect(first.frame?.params).toEqual({ ...params, submission_id: '00000000-0000-4000-8000-000000000001' })
    expect(second.frame?.params).toEqual({ ...params, submission_id: '00000000-0000-4000-8000-000000000002' })
    expect(first.frame?.id).not.toBe(second.frame?.id)
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(2)
    expect(params).not.toHaveProperty('submission_id')
    socket.receive({ id: second.frame!.id, result: { accepted: 'second' } })
    socket.receive({ id: first.frame!.id, result: { accepted: 'first' } })
    expect(await first.outcome).toEqual({ ok: true, value: { accepted: 'first' } })
    expect(await second.outcome).toEqual({ ok: true, value: { accepted: 'second' } })
  })

  test.each([false, true])('preserves caller params and key with broker advertised=%s', async advertised => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: advertised })
    const params = Object.freeze({ session_id: 'session-a', submission_id: 'caller-owned-key', text: 'Synthetic prompt' })

    expect((await roundTrip(client, socket, 'prompt.submit', params)).params).toEqual(params)
    expect(params.submission_id).toBe('caller-owned-key')
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
  })

  test('leaves a fresh unadvertised prompt unchanged', async () => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    const params = { session_id: 'session-a', text: 'Legacy prompt' }

    expect((await roundTrip(client, socket, 'prompt.submit', params)).params).toEqual(params)
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
  })

  test.each(['', null, false, 0])('preserves explicit invalid key %s for broker rejection', async key => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    const params = Object.freeze({ session_id: 'session-a', submission_id: key, text: 'Synthetic prompt' })
    const call = dispatch(client, socket, 'prompt.submit', params)

    expect(call.frame?.params).toEqual(params)
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
    socket.receive({
      jsonrpc: '2.0', id: call.frame!.id,
      error: { code: -32602, message: 'Invalid submission_id' },
    })
    expect(await call.outcome).toMatchObject({
      ok: false, error: { message: 'Hermes RPC -32602: Invalid submission_id' },
    })
    expect(frames(socket).filter(frame => frame.method === 'prompt.submit')).toHaveLength(1)
    expect(params.submission_id).toBe(key)
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
  })

  test('generates a broker key for explicit undefined without changing the caller field', async () => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    const params = Object.freeze({ session_id: 'session-a', submission_id: undefined, text: 'Synthetic prompt' })
    const frame = await roundTrip(client, socket, 'prompt.submit', params)

    expect(frame.params).toEqual({
      session_id: 'session-a', submission_id: '00000000-0000-4000-8000-000000000001', text: 'Synthetic prompt',
    })
    expect(params).toHaveProperty('submission_id', undefined)
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledOnce()
  })

  test.each([
    ['missing flag', {}],
    ['false flag', { shared_runtime: false }],
    ['string flag', { shared_runtime: 'true' }],
    ['number flag', { shared_runtime: 1 }],
    ['null flag', { shared_runtime: null }],
    ['missing payload', undefined],
    ['null payload', null],
  ])('requires strict true and clears prior capability for %s', async (_label, payload) => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    ready(socket, payload)
    const params = { session_id: 'session-a', text: 'Synthetic prompt' }

    expect((await roundTrip(client, socket, 'prompt.submit', params)).params).toEqual(params)
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
  })

  test.each(['ws://source-a.test/api/ws', 'ws://source-b.test/api/ws'])(
    'resets capability and rejects old pending work on active replacement at %s',
    async url => {
      const first = new MockSocket()
      const second = new MockSocket()
      const client = makeClient([first, second])
      await open(client, first)
      ready(first, { shared_runtime: true })
      const old = dispatch(client, first, 'prompt.submit', { session_id: 'session-a' })
      const replacing = client.connect(url)
      // Handle both outcomes immediately. An earlier failing assertion must
      // not leave the connecting promise unhandled when teardown disconnects.
      const replacementOutcome = replacing.then(
        () => ({ ok: true as const }),
        error => ({ ok: false as const, error }),
      )
      connectionSettlements.push(replacementOutcome)
      const connecting = dispatch(client, second, 'prompt.submit', { session_id: 'session-b' })
      expect(connecting.frame).toBeUndefined()
      expect(await connecting.outcome).toMatchObject({ ok: false, error: { message: 'Hermes Mobile gateway is not connected' } })
      const failed = await old.outcome
      expect(failed).toMatchObject({ ok: false, error: {
        code: -32052,
        data: { reason: 'SUBMISSION_DELIVERY_UNCERTAIN', submission_id: old.frame!.params.submission_id },
      } })
      if (!failed.ok) expect(isSubmissionDeliveryUncertain(failed.error)).toBe(true)
      expect(client.isSharedRuntime).toBe(false)
      second.open()
      expect(await replacementOutcome).toEqual({ ok: true })
      const params = { session_id: 'session-b', text: 'Legacy prompt' }

      expect((await roundTrip(client, second, 'prompt.submit', params)).params).toEqual(params)
      ready(second, { shared_runtime: false })
      expect((await roundTrip(client, second, 'prompt.submit', params)).params).toEqual(params)
      expect(globalThis.crypto.randomUUID).toHaveBeenCalledOnce()
      expect(frames(first).filter(frame => frame.method === 'prompt.submit')).toHaveLength(1)
    },
  )

  test('ignores queued ready callbacks from a retired socket before and after replacement opens', async () => {
    const first = new DelayedCloseSocket()
    const second = new MockSocket()
    const registrations = vi.spyOn(first, 'addEventListener')
    const client = makeClient([first, second])
    await open(client, first)
    ready(first, { shared_runtime: true })
    await roundTrip(client, first, 'prompt.submit', { session_id: 'session-a' })
    const onMessage = registrations.mock.calls.find(([type]) => type === 'message')?.[1]
    expect(typeof onMessage).toBe('function')

    const lateReady = (advertised: boolean) => {
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          jsonrpc: '2.0', method: 'event',
          params: { type: 'gateway.ready', payload: { shared_runtime: advertised } },
        }),
      })
      // A callback already queued before removeEventListener must still be fenced.
      if (typeof onMessage === 'function') {
        onMessage.call(first, event)
      }
    }

    const replacing = client.connect('ws://source-b.test/api/ws')
    lateReady(true)
    second.open()
    await replacing
    const params = { session_id: 'session-b' }
    expect((await roundTrip(client, second, 'prompt.submit', params)).params).toEqual(params)
    lateReady(true)
    expect((await roundTrip(client, second, 'prompt.submit', params)).params).toEqual(params)
    ready(second, { shared_runtime: true })
    const current = await roundTrip(client, second, 'prompt.submit', params)
    expect(current.params.submission_id).toBe('00000000-0000-4000-8000-000000000002')
    lateReady(false)
    first.publishLateClose()
    expect(client.connected).toBe(true)
    const retained = await roundTrip(client, second, 'prompt.submit', params)
    expect(retained.params.submission_id).toBe('00000000-0000-4000-8000-000000000003')
  })

  test('does not share broker capability across client instances', async () => {
    const brokerSocket = new MockSocket()
    const legacySocket = new MockSocket()
    const broker = makeClient([brokerSocket])
    const legacy = makeClient([legacySocket])
    await open(broker, brokerSocket)
    ready(brokerSocket, { shared_runtime: true })
    await open(legacy, legacySocket, 'ws://source-b.test/api/ws')
    const params = { session_id: 'session-b' }

    expect((await roundTrip(legacy, legacySocket, 'prompt.submit', params)).params).toEqual(params)
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
  })

  test('does not allocate a key or send after disconnection', async () => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    client.disconnect()
    const call = dispatch(client, socket, 'prompt.submit', { session_id: 'session-a' })

    expect(call.frame).toBeUndefined()
    expect(await call.outcome).toMatchObject({ ok: false, error: { message: 'Hermes Mobile gateway is not connected' } })
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
  })

  test.each(['timeout', 'server close', 'client disconnect'])(
    'does not resend or replace a key after uncertain %s and reconnect',
    async failure => {
      const first = new MockSocket()
      const second = new MockSocket()
      const client = makeClient([first, second])
      await open(client, first)
      ready(first, { shared_runtime: true })
      const params = Object.freeze({ session_id: 'session-a', text: 'Synthetic prompt' })
      const call = dispatch(client, first, 'prompt.submit', params, 1000)
      const key = call.frame?.params.submission_id

      if (failure === 'timeout') {
        await vi.advanceTimersByTimeAsync(2000)
      } else if (failure === 'server close') {
        first.close()
      } else {
        client.disconnect()
      }
      const failed = await call.outcome
      expect(failed).toMatchObject({ ok: false, error: { code: -32052, data: {
        reason: 'SUBMISSION_DELIVERY_UNCERTAIN', submission_id: key,
      } } })
      first.receive({ id: call.frame!.id, result: { accepted: true } })
      await open(client, second, 'ws://source-b.test/api/ws')
      ready(second, { shared_runtime: true })
      await vi.advanceTimersByTimeAsync(2000)

      expect(frames(second).filter(frame => frame.method === 'prompt.submit')).toEqual([])
      expect(frames(first).filter(frame => frame.method === 'prompt.submit')).toHaveLength(1)
      expect(frames(first)[0].params.submission_id).toBe(key)
      expect(globalThis.crypto.randomUUID).toHaveBeenCalledOnce()
      expect(params).not.toHaveProperty('submission_id')
    },
  )

  test('keeps defaults, capabilities and approval params/results unchanged on a broker socket', async () => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    const events = vi.fn()
    client.onEvent(events)
    await open(client, socket)
    ready(socket, { shared_runtime: true })

    expect((await roundTrip(client, socket, 'session.list')).params).toEqual({})
    const capabilities = { server_requests: true }
    expect((await roundTrip(client, socket, 'client.capabilities', capabilities)).params).toEqual(capabilities)
    expect((await roundTrip(client, socket, 'prompt.submit.extra', { text: 'Unrelated' })).params).toEqual({ text: 'Unrelated' })
    const approval = Object.freeze({ decision: 'allow', request_id: 'approval-a', session_id: 'session-a' })
    const call = dispatch(client, socket, 'approval.respond', approval)
    expect(call.frame?.params).toEqual(approval)
    const result = { applied: true, ok: true }
    socket.receive({ id: call.frame!.id, result })
    expect(await call.outcome).toEqual({ ok: true, value: result })
    const event = { type: 'approval.request', session_id: 'session-a', payload: { request_id: 'approval-a' } }
    socket.receive({ method: 'event', params: event })
    expect(events).toHaveBeenLastCalledWith(event)
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
  })

  test('augments only default prompt.submit params after broker advertisement', async () => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: true })

    expect((await roundTrip(client, socket, 'prompt.submit')).params).toEqual({
      submission_id: '00000000-0000-4000-8000-000000000001',
    })
    expect((await roundTrip(client, socket, 'session.list')).params).toEqual({})
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledOnce()
  })

  test('keeps param and result adapters in the actual request path without mutating input', async () => {
    const socket = new MockSocket()
    const mapParams = vi.fn((params: Record<string, unknown>) => ({ ...params, profile: 'selected-profile' }))
    const mapResult = vi.fn((method: string, result: unknown) => ({ method, result }))
    const client = new JsonRpcGatewayClient(() => socket, 30_000, mapParams, mapResult)
    clients.push(client)
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    const params = Object.freeze({ session_id: 'session-a', text: 'Synthetic prompt' })
    const call = dispatch(client, socket, 'prompt.submit', params)
    expect(call.frame?.params).toEqual({
      ...params, profile: 'selected-profile', submission_id: '00000000-0000-4000-8000-000000000001',
    })
    expect(mapParams).toHaveBeenCalledOnce()
    expect(mapParams.mock.calls[0][0]).toBe(params)
    expect(mapParams.mock.calls[0][0]).not.toHaveProperty('submission_id')
    socket.receive({ id: call.frame!.id, result: { accepted: true } })
    expect(await call.outcome).toEqual({ ok: true, value: { method: 'prompt.submit', result: { accepted: true } } })
    expect(mapResult).toHaveBeenCalledWith('prompt.submit', { accepted: true })
    expect(params).not.toHaveProperty('submission_id')
  })

  test('keeps native RPC refusal code/data definite, even on a broker socket', async () => {
    const socket = new MockSocket()
    const client = makeClient([socket])
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    const call = dispatch(client, socket, 'prompt.submit', { session_id: 'session-a' })
    socket.receive({ id: call.frame!.id, error: { code: 4009, message: 'session busy', data: { reason: 'BUSY' } } })
    const failed = await call.outcome
    expect(failed.ok).toBe(false)
    if (!failed.ok) {
      expect(failed.error).toBeInstanceOf(JsonRpcGatewayError)
      expect(failed.error).toMatchObject({ code: 4009, data: { reason: 'BUSY' } })
      expect(isSubmissionDeliveryUncertain(failed.error)).toBe(false)
    }
    expect(frames(socket)).toHaveLength(1)
  })

  test('legacy timeout and ordinary broker requests do not acquire uncertainty markers', async () => {
    for (const broker of [false, true]) {
      const socket = new MockSocket()
      const client = makeClient([socket])
      await open(client, socket)
      ready(socket, { shared_runtime: broker })
      const call = dispatch(client, socket, broker ? 'session.list' : 'prompt.submit', {}, 1000)
      await vi.advanceTimersByTimeAsync(2000)
      const failed = await call.outcome
      if (!failed.ok) expect(isSubmissionDeliveryUncertain(failed.error)).toBe(false)
      expect(frames(socket)).toHaveLength(1)
    }
  })

  test('refuses a mapped scope failure before allocating a key or sending a frame', async () => {
    const socket = new MockSocket()
    const client = new JsonRpcGatewayClient(() => socket, 1000, () => { throw new Error('Synthetic scope refusal') })
    clients.push(client)
    await open(client, socket)
    ready(socket, { shared_runtime: true })
    await expect(client.request('prompt.submit', { session_id: 'session-a' })).rejects.toThrow('Synthetic scope refusal')
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled()
    expect(socket.sent).toEqual([])
  })
})
