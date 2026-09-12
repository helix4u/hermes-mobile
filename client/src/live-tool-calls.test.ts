import { describe, expect, it } from 'vitest'
import { LiveToolCalls, liveToolResultEvent } from './live-tool-calls'

const envelope = (event: unknown, delegation_id = 'delegation-a') => ({ type: 'response.event', delegation_id, event })
const start = (id = 'response-a') => envelope({ type: 'response.created', response: { id, output: [] } })
const done = (id = 'response-a') => envelope({ type: 'response.completed', response: { id, output: [] } })
const call = (call_id = 'call-a', name = 'draft_hermes_request') => envelope({
  type: 'response.output_item.done', item: { type: 'function_call', call_id, name, arguments: '{"message":"Inspect the build."}' }
})

describe('Live structured tool boundary', () => {
  it('ignores captions, opaque client delegations and partial arguments', () => {
    const state = new LiveToolCalls()
    state.accept(start())
    expect(state.accept({ type: 'session.output_transcript.delta', delta: 'Hmm. Send it?' })).toBeNull()
    expect(state.accept({ type: 'session.delegation.created', delegation: { target: 'client', id: 'old' } })).toBeNull()
    expect(state.accept(envelope({ type: 'response.function_call_arguments.done', arguments: '{"message":"Hmm"}' }))).toBeNull()
    expect(state.accept(done())).toEqual([])
  })
  it('collects every completed function item before one continuation, even with empty terminal output', () => {
    const state = new LiveToolCalls()
    state.accept(start())
    expect(state.accept(call())).toBeNull()
    state.accept(call('call-b', 'recall_voice_memory'))
    expect(state.accept(done())?.map(x => x.callId)).toEqual(['call-a', 'call-b'])
    expect(state.accept(done())).toBeNull()
  })
  it('deduplicates lifecycle delivery and supports the next response on the same delegation', () => {
    const state = new LiveToolCalls()
    state.accept(start())
    state.accept(call())
    state.accept(start())
    state.accept(call())
    expect(state.accept(done())).toHaveLength(1)
    state.accept(start())
    state.accept(call())
    expect(state.accept(done())).toBeNull()
    state.accept(start('response-b'))
    state.accept(call('call-b'))
    expect(state.accept(done('response-b'))?.[0]?.callId).toBe('call-b')
  })
  it('does not execute failed, incomplete, foreign or disconnected responses', () => {
    for (const terminal of ['response.failed', 'response.incomplete']) {
      const state = new LiveToolCalls()
      state.accept(start())
      state.accept(call())
      expect(state.accept(envelope({ type: terminal, response: { id: 'response-a' } }))).toBeNull()
      expect(state.accept(done())).toBeNull()
    }
    const state = new LiveToolCalls()
    state.accept(start())
    state.accept(call())
    expect(state.accept(done('other-response'))).toBeNull()
    state.reset()
    expect(state.accept(done())).toBeNull()
  })
  it('returns exactly one lossless function result through the Live protocol', () => {
    const output = { history: 'whole record '.repeat(5000) }
    const event = liveToolResultEvent('call-a', output)
    expect(event.type).toBe('response.item.create')
    expect(JSON.parse((event.item as { output: string }).output)).toEqual(output)
  })
})
