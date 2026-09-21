import { describe, expect, it, vi } from 'vitest'
import { sendRequestResponse } from './request-response'
import { reduceGatewayEvent, type RequestTranscriptData } from './state/transcript'

const card = (requestId = 'srq-1'): RequestTranscriptData => ({
  kind: 'approval', requestId, sessionId: 'session-a', question: 'Synthetic command',
  choices: [], multiSelect: false, answered: false,
})

describe('exact card responses', () => {
  it('answers overlapping approvals by exact ID, even in reverse order', async () => {
    const gateway = { request: vi.fn(async () => ({ forwarded: true })) }
    await sendRequestResponse(gateway as never, card('srq-2'), 'approve', 'session-a')
    await sendRequestResponse(gateway as never, card('srq-1'), 'deny', 'session-a')
    expect(gateway.request.mock.calls).toEqual([
      ['approval.respond', { session_id: 'session-a', request_id: 'srq-2', choice: 'once' }],
      ['approval.respond', { session_id: 'session-a', request_id: 'srq-1', choice: 'deny' }],
    ])
  })

  it.each([
    { ...card(), expired: true }, { ...card(), answered: true }, card(''),
    { ...card(), sessionId: 'other-session' },
  ])('never sends an unavailable or foreign card', async request => {
    const gateway = { request: vi.fn() }
    await expect(sendRequestResponse(gateway, request, 'approve', 'session-a')).rejects.toThrow()
    expect(gateway.request).not.toHaveBeenCalled()
  })

  it('does not infer approval from arbitrary words', async () => {
    const gateway = { request: vi.fn() }
    await expect(sendRequestResponse(gateway, card(), 'yes please', 'session-a')).rejects.toThrow()
    expect(gateway.request).not.toHaveBeenCalled()
  })

  it.each([['clarify', 'answer'], ['sudo', 'password'], ['secret', 'value']] as const)(
    'keeps the exact ID for %s without retaining the answer on the card', async (kind, field) => {
      const gateway = { request: vi.fn() }
      const request = { ...card(), kind }
      const before = JSON.stringify(request)
      await sendRequestResponse(gateway, request, 'synthetic-value', 'session-a')
      expect(gateway.request).toHaveBeenCalledWith(`${kind}.respond`, { request_id: 'srq-1', [field]: 'synthetic-value' })
      expect(JSON.stringify(request)).toBe(before)
    },
  )

  it('expires the old card and allows the exact replacement after cancellation', async () => {
    const event = (id: string) => ({ type: 'approval.request', session_id: 'session-a', payload: { request_id: id, command: 'Synthetic command' } })
    let transcript = reduceGatewayEvent([], event('old'))
    transcript = reduceGatewayEvent(transcript, { type: 'approval.expire', session_id: 'session-a', payload: { request_id: 'old' } })
    transcript = reduceGatewayEvent(transcript, event('new'))
    const gateway = { request: vi.fn() }
    await expect(sendRequestResponse(gateway, transcript[0].request!, 'approve', 'session-a')).rejects.toThrow()
    await sendRequestResponse(gateway, transcript[1].request!, 'approve', 'session-a')
    expect(gateway.request).toHaveBeenCalledExactlyOnceWith('approval.respond', { session_id: 'session-a', request_id: 'new', choice: 'once' })
  })

  it('deduplicates replay without resurrecting cancelled cards', () => {
    const event = { type: 'approval.request', session_id: 'session-a', payload: { request_id: 'srq-1', command: 'Synthetic command' } }
    const first = reduceGatewayEvent([], event)
    expect(reduceGatewayEvent(first, event)).toBe(first)
    const expired = reduceGatewayEvent(first, { type: 'request.cancel', payload: { id: 'srq-1' }, session_id: 'session-a' })
    expect(reduceGatewayEvent(expired, event)).toBe(expired)
    expect(expired[0].request?.expired).toBe(true)
  })

  it('scopes duplicate IDs and cancellations to their session', () => {
    const event = { type: 'approval.request', session_id: 'session-a', payload: { request_id: 'srq-1' } }
    const first = reduceGatewayEvent([], event)
    const both = reduceGatewayEvent(first, { ...event, session_id: 'session-b' })
    expect(both).toHaveLength(2)
    const expired = reduceGatewayEvent(both, { type: 'approval.expire', session_id: 'session-a', payload: event.payload })
    expect(expired[0].request?.expired).toBe(true)
    expect(expired[1].request?.expired).toBeUndefined()
  })
})
