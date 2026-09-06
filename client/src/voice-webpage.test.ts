import { describe, expect, it } from 'vitest'
import { voiceWebpageUrl } from './voice-webpage'

describe('voice webpage offers', () => {
  it('preserves the complete ordinary web address without opening it', () => {
    expect(voiceWebpageUrl('https://example.test/report?q=complete#tail')).toBe('https://example.test/report?q=complete#tail')
  })
  it.each(['javascript:alert(1)', 'file:///private', 'https://user:secret@example.test', '', null])('rejects unsafe or missing addresses: %s', value => {
    expect(() => voiceWebpageUrl(value)).toThrow()
  })
})
