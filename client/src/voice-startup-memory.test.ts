import { describe, expect, it } from 'vitest'
import { VoiceStartupMemoryError, voiceStartupMemoryInstructions } from './voice-startup-memory'

describe('Voice startup memory', () => {
  it('retains complete redacted memory and preferences without copying arbitrary metadata', () => {
    const content = 'A complete preference.\n' + 'synthetic long note '.repeat(200)
    const prompt = voiceStartupMemoryInstructions({ records: [
      { id: 'MEMORY.md', status: 'available', content, contentTruncated: false, privatePath: 'not-for-provider' },
      { id: 'USER.md', status: 'available', content: 'Use ordinary wording.' },
    ] })
    const records = JSON.parse(prompt.split('\n').at(-2)!)
    expect(records).toEqual([{ id: 'MEMORY.md', content }, { id: 'USER.md', content: 'Use ordinary wording.' }])
    expect(prompt).not.toContain('not-for-provider')
    expect(prompt).toContain('Recall is not required')
  })
  it('does not fabricate content for disabled, missing or empty notes', () => {
    expect(voiceStartupMemoryInstructions({ records: [{ status: 'disabled' }, { status: 'missing' }, { status: 'available', content: '' }] })).toBe('')
  })
  it.each([{}, null, { records: [null] }, { records: [{ status: 'available', content: 'partial', contentTruncated: true }] }])('fails visibly rather than claiming incomplete memory is preloaded', value => {
    expect(() => voiceStartupMemoryInstructions(value)).toThrow(VoiceStartupMemoryError)
  })
})
