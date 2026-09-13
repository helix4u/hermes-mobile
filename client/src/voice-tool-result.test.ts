import { describe, expect, it } from 'vitest'
import { voiceToolResultEvents } from './voice-tool-result'
import { VoiceResultPages } from './voice-result-pages'
import { liveToolResultEvent } from './live-tool-calls'

describe('complete voice tool transport', () => {
  it('keeps small outputs as one ordinary function result', () => {
    const events = voiceToolResultEvents('call_synthetic', { result: 'complete' })
    expect(events).toEqual([{ type: 'conversation.item.create', item: {
      type: 'function_call_output', call_id: 'call_synthetic', output: '{"result":"complete"}',
    } }])
  })
  it('preserves large Unicode results exactly with bounded wire frames and one completion', () => {
    const original = { content: ('Unicode 🌿漢字\\\n\" evidence ').repeat(12000), final: 'last record' }
    const store = new VoiceResultPages()
    let page = store.prepare(original) as Record<string, any>
    let complete = ''
    while (true) {
      const events = [...voiceToolResultEvents('call_synthetic', page), liveToolResultEvent('call_synthetic', page)] as any[]
      expect(events.every(event => new TextEncoder().encode(JSON.stringify(event)).length < 16384)).toBe(true)
      expect(events.every(event => event.item.type === 'function_call_output' && !event.item.role)).toBe(true)
      expect(page.offset).toBe(complete.length)
      complete += page.content
      if (page.nextOffset === null) break
      page = store.read({ resultId: page.resultId, offset: page.nextOffset })
    }
    expect(JSON.parse(complete)).toEqual(original)
    store.reset()
    expect(() => store.read({ resultId: page.resultId, offset: 0 })).toThrow('expired')
    expect(() => new VoiceResultPages().read({resultId: page.resultId, offset: 0})).toThrow('expired')
  })
})
