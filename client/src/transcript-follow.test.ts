import { describe, expect, it } from 'vitest'
import {
  pinTranscriptToBottom,
  shouldFollowTranscriptAfterScroll,
  transcriptDistanceFromBottom,
} from './transcript-follow'

describe('transcript follow ownership', () => {
  it('keeps following when streaming content grows without a user scroll', () => {
    expect(
      shouldFollowTranscriptAfterScroll({
        clientHeight: 600,
        manualScroll: false,
        previousScrollTop: 400,
        scrollHeight: 1400,
        scrollTop: 400,
        wasFollowing: true,
      }),
    ).toBe(true)
  })

  it('keeps following when a keyboard or composer resize changes the viewport', () => {
    expect(
      shouldFollowTranscriptAfterScroll({
        clientHeight: 420,
        manualScroll: false,
        previousScrollTop: 600,
        scrollHeight: 1200,
        scrollTop: 600,
        wasFollowing: true,
      }),
    ).toBe(true)
  })

  it('releases follow only for a real upward interaction away from the bottom', () => {
    expect(
      shouldFollowTranscriptAfterScroll({
        clientHeight: 600,
        manualScroll: true,
        previousScrollTop: 600,
        scrollHeight: 1400,
        scrollTop: 470,
        wasFollowing: true,
      }),
    ).toBe(false)
  })

  it('resumes follow when the user returns near the bottom', () => {
    expect(
      shouldFollowTranscriptAfterScroll({
        clientHeight: 600,
        manualScroll: true,
        previousScrollTop: 650,
        scrollHeight: 1400,
        scrollTop: 755,
        wasFollowing: false,
      }),
    ).toBe(true)
  })

  it('pins to the exact maximum scroll offset', () => {
    const target = {
      clientHeight: 600,
      scrollHeight: 1400,
      scrollTop: 100,
    }
    expect(pinTranscriptToBottom(target)).toBe(800)
    expect(target.scrollTop).toBe(800)
    expect(transcriptDistanceFromBottom(target)).toBe(0)
  })
})
