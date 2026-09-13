import { describe, expect, it } from 'vitest'
import { shouldAutoplay } from './voice-autoplay'
describe('automatic reply playback during voice', () => {
  it('suppresses only configured autoplay and resumes after the voice lease ends', () => {
    expect(shouldAutoplay(true, true, true)).toBe(false)
    expect(shouldAutoplay(true, true, false)).toBe(true)
    expect(shouldAutoplay(true, false, true)).toBe(true)
    expect(shouldAutoplay(false, false, false)).toBe(false)
  })
})
