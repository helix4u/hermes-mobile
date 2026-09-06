import { describe, expect, it } from 'vitest'
import { voiceToolResultEvents } from './voice-tool-result'

describe('complete voice tool transport', () => {
  it('keeps small outputs as one ordinary function result', () => {
    const events = voiceToolResultEvents('call_synthetic', { result: 'complete' })
    expect(events).toEqual([{ type: 'conversation.item.create', item: {
      type: 'function_call_output', call_id: 'call_synthetic', output: '{"result":"complete"}',
    } }])
  })
  it('preserves large Unicode results exactly with bounded wire frames and one completion', () => {
    const original = { content: ('Unicode 🌿漢字\\\n\" evidence ').repeat(12000), final: 'last record' }
    const events = voiceToolResultEvents('call_synthetic', original) as any[]
    expect(events.every(event => new TextEncoder().encode(JSON.stringify(event)).length < 16384)).toBe(true)
    expect(events.filter(event => event.item.type === 'function_call_output')).toHaveLength(1)
    const fragments = events.slice(0, -1).map(event => JSON.parse(event.item.content[0].text))
    expect(fragments.every((frame, index) => frame.callId === 'call_synthetic' && frame.index === index && frame.total === fragments.length)).toBe(true)
    expect(JSON.parse(fragments.map(frame => frame.body).join(''))).toEqual(original)
    expect(JSON.parse(events.at(-1).item.output).contentTruncated).toBe(false)
  })
})
