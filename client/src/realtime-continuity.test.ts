import { describe, expect, it } from 'vitest'
import { realtimePersonality, VoiceContextDelta, voiceHistoryEvents, voiceTail, voiceToolPhase } from './realtime-continuity'
import type { PetPersonalityData } from './pet'

describe('live voice continuity', () => {
  it('keeps older whole rows known past 256 records and notices role changes', () => {
    const rows = Array.from({length:300}, (_,i) => ({id:String(i),role:'user' as const,content:`record ${i}`}))
    const delta = new VoiceContextDelta()
    delta.reset([])
    expect(delta.take(rows)).toEqual(rows)
    expect(delta.take(rows)).toEqual([])
    expect(delta.take([{...rows[0],role:'assistant'}])).toEqual([{...rows[0],role:'assistant'}])
  })
  it('uses content-free diagnostic phases accepted by the native bridge', () => {
    expect(voiceToolPhase('read_attached_context', 'completed')).toBe('tool.read_attached_context.completed')
    expect(voiceToolPhase('private-string-or-url', 'failed')).toBe('tool.unknown.failed')
    expect(voiceToolPhase('get_pet_sidechat_history', 'started')).toMatch(/^[a-z_.]{1,64}$/)
  })
  it('never promotes observer instructions to live conversation instructions', () => {
    const personality = { displayName: 'Detective', description: 'Dry, observant and curious.', commentary: { prompt: 'Produce exactly one aside. Do not answer the user.' } } as PetPersonalityData
    const prompt = realtimePersonality(personality)
    expect(prompt).toContain('Dry, observant and curious.')
    expect(prompt).not.toContain('Produce exactly one aside')
    expect(prompt).not.toContain('Do not answer the user')
    expect(personality.commentary?.prompt).toContain('Produce exactly one aside')
  })
  it('preserves explicit conversation personality without changing its source', () => {
    const p = { sidechat: { prompt: 'Be a curious engineer.' } } as PetPersonalityData
    expect(realtimePersonality(p)).toContain(p.sidechat!.prompt)
    expect(realtimePersonality(p)).toContain('Never append an aside')
  })
  it('replays complete chronological user/assistant pairs without generating a response', () => {
    const turns = [{ id: 'a', user: 'Explain this.', assistant: 'Here is the answer.' }, { id: 'b', user: 'Shorter please.', assistant: 'Short answer.' }]
    const events = voiceHistoryEvents(turns) as any[]
    expect(events.map(e => e.item.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(events.every(e => e.type === 'conversation.item.create')).toBe(true)
    const copied = voiceTail(turns)
    expect(copied).toEqual(turns)
    expect(copied).not.toBe(turns)
    expect(copied[0]).not.toBe(turns[0])
    const large = [{ id: 'big', user: 'x'.repeat(17000), assistant: 'answer' }]
    expect(voiceTail(large)).toEqual(large)
  })
  it('does not resend unchanged rows when the rolling window moves', () => {
    const delta = new VoiceContextDelta()
    const a = { id: 'a', role: 'user' as const, content: 'A' }
    const b = { id: 'b', role: 'assistant' as const, content: 'B' }
    delta.reset([a, b])
    expect(delta.take([b])).toEqual([])
    expect(delta.take([b, { ...b, id: 'c', content: 'C' }])).toEqual([{ ...b, id: 'c', content: 'C' }])
    expect(delta.take([{ ...b, content: 'B completed' }])).toEqual([{ ...b, content: 'B completed' }])
    expect(delta.take([{ ...b, content: 'B completed' }])).toEqual([])
  })
  it('resets identity for a different attached session', () => {
    const delta = new VoiceContextDelta()
    const item = { id: 'same', role: 'user' as const, content: 'hello' }
    delta.reset([item]); delta.reset([])
    expect(delta.take([item])).toEqual([item])
  })
})
