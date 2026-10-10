import { afterEach, expect, test, vi } from 'vitest'
import { JsonRpcGatewayClient, type WebSocketLike } from './json-rpc-client'

class Socket extends EventTarget implements WebSocketLike {
  readyState = 0
  frames: Array<{ id: string; method: string; params: Record<string, unknown> }> = []
  send(raw: string) { this.frames.push(JSON.parse(raw)) }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')) }
  receive(frame: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) })) }
  reply(result: unknown) { this.receive({ id: this.frames.at(-1)!.id, result }) }
}
const clients: JsonRpcGatewayClient[] = []
afterEach(() => clients.splice(0).forEach(client => client.disconnect()))

async function opened() {
  const socket = new Socket()
  const client = new JsonRpcGatewayClient(() => socket, 1000, params => ({ ...params, profile: 'writer' }))
  clients.push(client)
  client.expectProtocol('hermes-gateway-v1')
  const connecting = client.connect('wss://synthetic.test/gateway')
  socket.readyState = 1
  socket.dispatchEvent(new Event('open'))
  await connecting
  return { socket, client }
}

const snapshot = (sessionId = 'logical') => ({ session_id: sessionId, stored_session_id: sessionId,
  revision: 1, execution_generation: 5, running: false, prompts: [], pending: [], messages: [],
  info: { profile_name: 'writer', model: 'synthetic-model' } })

test('verified capability prepares the first create before ready and retains its admission ID', async () => {
  const { socket, client } = await opened()
  const created = client.request('session.create', { source: 'hermes-mobile', cols: 100, preview: 'display preview', fast: true })
  expect(socket.frames.at(-1)).toMatchObject({ method: 'session.create', params: {
    source: 'mobile', profile: 'writer', service_tier: 'priority', request_id: expect.any(String) } })
  expect(socket.frames.at(-1)!.params).not.toHaveProperty('preview')
  socket.reply(snapshot())
  await created
  const submitted = client.request<Record<string, unknown>>('prompt.submit', { session_id: 'logical', text: 'synthetic request', busy_mode: 'interrupt' })
  const frame = socket.frames.at(-1)!
  expect(frame.method).toBe('prompt.submit')
  expect(frame.params).not.toHaveProperty('busy_mode')
  socket.reply({ admission_id: 'admitted', ref: { session_id: 'logical', profile_id: '/synthetic/writer' }, status: 'queued' })
  await expect(submitted).resolves.toMatchObject({ session_id: 'logical', admission_id: 'admitted', submission_id: frame.params.submission_id })
})

test('active steering uses the observed generation and stale idle frames cannot redirect it', async () => {
  const { socket, client } = await opened()
  const resumed = client.request('session.resume', { session_id: 'logical' })
  socket.reply(snapshot())
  await resumed
  socket.receive({ method: 'event', params: { type: 'session.info', session_id: 'logical', profile: 'writer',
    execution_generation: 6, payload: { running: true, execution_generation: 6 } } })
  socket.receive({ method: 'event', params: { type: 'session.info', session_id: 'logical', profile: 'writer',
    execution_generation: 5, payload: { running: false, execution_generation: 5 } } })
  const steered = client.request('prompt.submit', { session_id: 'logical', text: 'correction', busy_mode: 'steer' })
  expect(socket.frames.at(-1)).toMatchObject({ method: 'session.steer', params: { execution_generation: 6, profile: 'writer', text: 'correction' } })
  expect(socket.frames.at(-1)!.params).not.toHaveProperty('submission_id')
  socket.reply({ status: 'queued', execution_generation: 6 })
  await expect(steered).resolves.toMatchObject({ session_id: 'logical', status: 'queued' })
})

test.each(['interrupt', 'steer'])('reviewed voice requests preserve admission fields while busy mode is %s', async mode => {
  const { socket, client } = await opened()
  const resumed = client.request('session.resume', { session_id: 'logical' })
  socket.reply({ ...snapshot(), running: true })
  await resumed
  const submitted = client.request('prompt.submit', {
    session_id: 'logical', text: 'Synthetic reviewed request', busy_mode: mode,
    submission_id: 'reviewed-request', reject_if_busy: true,
    pet_realtime_handoff: true, delegation_limit: 0, surface: 'app',
  })
  expect(socket.frames.at(-1)!.method).toBe('prompt.lookup')
  socket.reply({ receipt: null })
  await vi.waitFor(() => expect(socket.frames.at(-1)!.method).toBe('prompt.submit'))
  expect(socket.frames.at(-1)).toMatchObject({ method: 'prompt.submit', params: {
    session_id: 'logical', text: 'Synthetic reviewed request', submission_id: 'reviewed-request',
    reject_if_busy: true, pet_realtime_handoff: true, delegation_limit: 0, surface: 'app', profile: 'writer',
  } })
  expect(socket.frames.at(-1)!.params).not.toHaveProperty('busy_mode')
  socket.receive({ id: socket.frames.at(-1)!.id, error: { code: 4001, message: 'session_busy', data: { reason: 'session_busy' } } })
  await expect(submitted).rejects.toThrow('session_busy')
})

test('an older local Mobile conversation is adopted without creating a replacement', async () => {
  const { socket, client } = await opened()
  const resumed = client.request('session.resume', { session_id: 'old-mobile' })
  socket.receive({ id: socket.frames.at(-1)!.id, error: { code: 4001, message: 'not_found', data: { reason: 'not_found' } } })
  await vi.waitFor(() => expect(socket.frames.at(-1)).toMatchObject({ method: 'session.resume', params: {
    session_id: 'old-mobile', title: 'old-mobile', profile: 'writer' } }))
  socket.receive({ id: socket.frames.at(-1)!.id, error: { code: 4001, message: 'not_found', data: { reason: 'not_found' } } })
  await vi.waitFor(() => expect(socket.frames.at(-1)!.method).toBe('session.adopt'))
  expect(socket.frames.at(-1)).toMatchObject({ method: 'session.adopt', params: {
    session_id: 'old-mobile', source: 'mobile', legacy_source: 'hermes-mobile', profile: 'writer' } })
  socket.reply(snapshot('old-mobile'))
  await expect(resumed).resolves.toMatchObject({ session_id: 'old-mobile' })
  expect(socket.frames.map(frame => frame.method)).toEqual(['session.resume', 'session.resume', 'session.adopt'])
  const stopped = client.request('session.interrupt', { session_id: 'old-mobile' })
  expect(socket.frames.at(-1)!.params.execution_generation).toBe(5)
  socket.reply({ session_id: 'old-mobile' })
  await stopped
})

test('session model confirmation retains its original mutation fences', async () => {
  const { socket, client } = await opened()
  const resumed = client.request('session.resume', { session_id: 'logical' })
  socket.reply(snapshot())
  await resumed
  const value = 'synthetic-next --provider custom --session'
  const switching = client.request('config.set', { session_id: 'logical', key: 'model', value })
  const original = socket.frames.at(-1)!
  expect(original).toMatchObject({ method: 'session.mutate', params: {
    operation: 'model', expected_revision: 1, expected_generation: 5, payload: { model: value }, profile: 'writer' } })
  socket.reply({ session_id: 'logical', operation: 'model', status: 'confirmation',
    confirm_required: true, confirm_message: 'Synthetic large context' })
  await expect(switching).resolves.toMatchObject({ confirm_required: true })
  socket.receive({ method: 'event', params: { type: 'session.info', session_id: 'logical', profile: 'writer',
    payload: { revision: 2, execution_generation: 6, running: false } } })
  const confirmed = client.request('config.set', { session_id: 'logical', key: 'model', value, confirm_expensive_model: true })
  const retry = socket.frames.at(-1)!
  expect(retry.params).toMatchObject({ expected_revision: 1, expected_generation: 5,
    payload: { model: value, confirm_expensive_model: true } })
  expect(retry.params.request_id).not.toBe(original.params.request_id)
  socket.receive({ id: retry.id, error: { code: 4001, message: 'revision_conflict', data: { reason: 'revision_conflict' } } })
  await expect(confirmed).rejects.toThrow('revision_conflict')
})

test.each(['not_found', 'storage_unavailable'])('a compressed physical ID recovers %s without adoption', async reason => {
  const { socket, client } = await opened()
  const resumed = client.request('session.resume', { session_id: 'physical-tip', lazy: true })
  expect(socket.frames.at(-1)!.params).not.toHaveProperty('lazy')
  socket.receive({ id: socket.frames.at(-1)!.id, error: { code: 4001, message: reason, data: { reason } } })
  await vi.waitFor(() => expect(socket.frames.at(-1)!.params.title).toBe('physical-tip'))
  expect(socket.frames.at(-1)!.params.profile).toBe('writer')
  socket.reply(snapshot('logical-owner'))
  await expect(resumed).resolves.toMatchObject({ session_id: 'logical-owner' })
  expect(socket.frames.map(frame => frame.method)).toEqual(['session.resume', 'session.resume'])
  const stopped = client.request('session.interrupt', { session_id: 'logical-owner' })
  expect(socket.frames.at(-1)!.params).toMatchObject({ session_id: 'logical-owner', execution_generation: 5, profile: 'writer' })
  socket.reply({ session_id: 'logical-owner' })
  await stopped
})

test('an unresolved storage refusal does not adopt or replace a transcript', async () => {
  const { socket, client } = await opened()
  const resumed = client.request('session.resume', { session_id: 'physical-tip' })
  const rejected = expect(resumed).rejects.toThrow('storage_unavailable')
  socket.receive({ id: socket.frames.at(-1)!.id, error: { code: 4001, message: 'storage_unavailable', data: { reason: 'storage_unavailable' } } })
  await vi.waitFor(() => expect(socket.frames.at(-1)!.params.title).toBe('physical-tip'))
  socket.receive({ id: socket.frames.at(-1)!.id, error: { code: 4001, message: 'not_found', data: { reason: 'not_found' } } })
  await rejected
  expect(socket.frames.map(frame => frame.method)).toEqual(['session.resume', 'session.resume'])
})

test('session recovery retains the original timeout budget', async () => {
  vi.useFakeTimers()
  try {
    const { socket, client } = await opened()
    const resumed = client.request('session.resume', { session_id: 'physical-tip' }, { timeoutMs: 1000 })
    const rejected = expect(resumed).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(700)
    socket.receive({ id: socket.frames.at(-1)!.id, error: { code: 4001, message: 'not_found', data: { reason: 'not_found' } } })
    await vi.advanceTimersByTimeAsync(0)
    expect(socket.frames.at(-1)!.params.title).toBe('physical-tip')
    await vi.advanceTimersByTimeAsync(300)
    await rejected
    expect(socket.frames.map(frame => frame.method)).toEqual(['session.resume', 'session.resume'])
  } finally {
    vi.useRealTimers()
  }
})
