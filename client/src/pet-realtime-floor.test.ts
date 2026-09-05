import { describe, expect, it } from 'vitest'
import { RealtimeFloor, realtimeWantsSilence } from './pet-realtime-floor'

function harness() {
  const sent: Record<string, unknown>[] = []
  const muted: boolean[] = []
  const floor = new RealtimeFloor(e => { sent.push(e); return true }, m => muted.push(m))
  const created = (id: string, epoch = floor.epoch) => floor.handle({
    type: 'response.created', response: { id, metadata: { pet_turn: String(epoch) } }
  })
  return { floor, sent, muted, created }
}

describe('Realtime floor ownership', () => {
  it('defers a tool continuation until the speaker buffer drains, not generation completion', () => {
    const { floor, sent, created } = harness()
    floor.request()
    created('prelude')
    floor.handle({ type: 'output_audio_buffer.started', response_id: 'prelude' })
    floor.handle({ type: 'response.done', response: { id: 'prelude' } })
    sent.length = 0
    expect(floor.request({ instructions: 'Continue after tool output' })).toBe(true)
    expect(sent).toEqual([])
    floor.handle({ type: 'output_audio_buffer.stopped', response_id: 'prelude' })
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('response.create')
  })

  it('drops a buffered continuation on interruption and ignores an older buffer stop', () => {
    const { floor, sent, created } = harness()
    created('one')
    floor.handle({ type: 'output_audio_buffer.started', response_id: 'one' })
    floor.handle({ type: 'response.done', response: { id: 'one' } })
    floor.request()
    floor.handle({ type: 'input_audio_buffer.speech_started', item_id: 'user' })
    sent.length = 0
    floor.handle({ type: 'output_audio_buffer.stopped', response_id: 'one' })
    expect(sent).toEqual([])
    floor.acceptInput({ item_id: 'user' })
    created('two')
    floor.handle({ type: 'output_audio_buffer.started', response_id: 'two' })
    created('three')
    floor.handle({ type: 'output_audio_buffer.started', response_id: 'three' })
    expect(floor.handle({ type: 'output_audio_buffer.stopped', response_id: 'two' })).toBe(false)
    expect(floor.speaking).toBe(true)
  })
  it('silences before transcription and clears audio even after generation completed', () => {
    const { floor, sent, muted, created } = harness()
    floor.request()
    created('reply')
    floor.handle({ type: 'output_audio_buffer.started', response_id: 'reply' })
    floor.handle({ type: 'response.done', response: { id: 'reply' } })
    expect(floor.speaking).toBe(true)
    sent.length = 0
    floor.handle({ type: 'input_audio_buffer.speech_started', item_id: 'input' })
    expect(muted.at(-1)).toBe(true)
    expect(sent).toEqual([{ type: 'output_audio_buffer.clear' }])
    expect(floor.request()).toBe(false)
    expect(floor.acceptInput({ item_id: 'input' })).toBe(true)
    expect(floor.request()).toBe(true)
    created('next')
    floor.handle({ type: 'output_audio_buffer.started', response_id: 'next' })
    expect(muted.at(-1)).toBe(false)
  })

  it('cancels a generating greeting and rejects its late events after the next reply starts', () => {
    const { floor, sent, created } = harness()
    const oldEpoch = floor.epoch
    floor.request({ instructions: 'Hey.' })
    floor.handle({ type: 'input_audio_buffer.speech_started', item_id: 'input' })
    expect(sent.slice(-2)).toEqual([{ type: 'response.cancel' }, { type: 'output_audio_buffer.clear' }])
    floor.acceptInput({ item_id: 'input' })
    floor.request()
    expect(created('old-greeting', oldEpoch)).toBe(false)
    expect(sent.at(-1)).toEqual({ type: 'response.cancel', response_id: 'old-greeting' })
    expect(created('new-answer')).toBe(true)
    expect(floor.handle({ type: 'response.done', response: { id: 'old-greeting' } })).toBe(false)
    expect(floor.handle({ type: 'response.output_audio_transcript.delta', response_id: 'old-greeting', delta: 'stale' })).toBe(false)
    expect(floor.handle({ type: 'output_audio_buffer.started', response_id: 'old-greeting' })).toBe(false)
    expect(floor.handle({ type: 'output_audio_buffer.started', response_id: 'new-answer' })).toBe(true)
  })

  it('does not let a late tool completion take back the floor', () => {
    const { floor } = harness()
    const epoch = floor.epoch
    floor.handle({ type: 'input_audio_buffer.speech_started', item_id: 'input' })
    floor.acceptInput({ item_id: 'input' })
    expect(floor.request({}, epoch)).toBe(false)
    expect(floor.request()).toBe(true)
    expect(floor.request()).toBe(false)
  })

  it('keeps noise and silence commands quiet without clearing captured microphone input', () => {
    const { floor, sent } = harness()
    floor.handle({ type: 'input_audio_buffer.speech_started', item_id: 'noise' })
    floor.acceptInput({ item_id: 'noise' })
    floor.stayQuiet()
    expect(floor.request()).toBe(false)
    expect(sent.some(e => e.type === 'input_audio_buffer.clear')).toBe(false)
    expect(sent.some(e => e.type === 'response.create')).toBe(false)
    expect(floor.handle({ type: 'error', error: { code: 'response_cancel_not_active' } })).toBe(false)
    expect(floor.handle({ type: 'error', error: { code: 'invalid_request_error' } })).toBe(true)
  })

  it('rejects duplicate and out-of-order transcription and invalidates work across reconnect', () => {
    const { floor } = harness()
    floor.handle({ type: 'input_audio_buffer.speech_started', item_id: 'first' })
    floor.handle({ type: 'input_audio_buffer.speech_started', item_id: 'second' })
    expect(floor.acceptInput({ item_id: 'first' })).toBe(false)
    expect(floor.acceptInput({ item_id: 'second' })).toBe(true)
    expect(floor.acceptInput({ item_id: 'second' })).toBe(false)
    const epoch = floor.epoch
    floor.reset()
    expect(floor.request({}, epoch)).toBe(false)
    expect(floor.request()).toBe(true)
  })

  it('assigns provider item ids to speech epochs when speech-start events omit them', () => {
    const { floor } = harness()
    floor.handle({ type: 'input_audio_buffer.speech_started' })
    floor.handle({ type: 'input_audio_buffer.committed', item_id: 'late-first' })
    floor.handle({ type: 'input_audio_buffer.speech_started' })
    floor.handle({ type: 'input_audio_buffer.committed', item_id: 'current-second' })
    expect(floor.acceptInput({ item_id: 'current-second' })).toBe(true)
    expect(floor.acceptInput({ item_id: 'late-first' })).toBe(false)
    expect(floor.acceptInput({ item_id: 'current-second' })).toBe(false)
  })
})

describe('Explicit silence commands', () => {
  it.each(['stop', 'Stop talking!', 'shut the fuck up', 'Please be quiet.', 'let me finish', 'okay stop now'])('silences %s', text => {
    expect(realtimeWantsSilence(text)).toBe(true)
  })
  it.each(["don't stop", 'stop the agent', 'ask Hermes to stop', 'why did you stop talking?', 'the button says "stop"', 'stop and explain this'])('does not swallow %s', text => {
    expect(realtimeWantsSilence(text)).toBe(false)
  })
})
