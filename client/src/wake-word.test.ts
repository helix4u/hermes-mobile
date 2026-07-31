import { describe, expect, test } from 'vitest'
import {
  shouldListenForWakeWord,
  wakeWordPreferenceKey,
} from './wake-word'

describe('Mobile wake word', () => {
  test('scopes the toggle to the saved connection', () => {
    expect(wakeWordPreferenceKey('workstation')).not.toBe(
      wakeWordPreferenceKey('cloud-agent'),
    )
    expect(wakeWordPreferenceKey('workstation')).toContain('workstation')
  })

  test('listens only when native, connected, foregrounded, enabled, and idle', () => {
    const ready = {
      appActive: true,
      connected: true,
      enabled: true,
      nativeClient: true,
      voicePhase: 'idle' as const,
    }
    expect(shouldListenForWakeWord(ready)).toBe(true)
    expect(shouldListenForWakeWord({ ...ready, enabled: false })).toBe(false)
    expect(shouldListenForWakeWord({ ...ready, nativeClient: false })).toBe(
      false,
    )
    expect(shouldListenForWakeWord({ ...ready, connected: false })).toBe(false)
    expect(shouldListenForWakeWord({ ...ready, appActive: false })).toBe(false)
    expect(
      shouldListenForWakeWord({ ...ready, voicePhase: 'recording' }),
    ).toBe(false)
    expect(
      shouldListenForWakeWord({ ...ready, voicePhase: 'speaking' }),
    ).toBe(false)
  })
})
