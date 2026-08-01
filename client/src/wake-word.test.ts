import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  activeTurnInputModePreferenceKey,
  loadActiveTurnInputMode,
  loadWakeWordMode,
  persistActiveTurnInputMode,
  persistWakeWordMode,
  shouldListenForWakeWord,
  stripWakePhrase,
  wakeWordModePreferenceKey,
  wakeWordPreferenceKey,
} from './wake-word'

describe('Mobile wake word', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('scopes the toggle to the saved connection', () => {
    expect(wakeWordPreferenceKey('workstation')).not.toBe(
      wakeWordPreferenceKey('cloud-agent'),
    )
    expect(wakeWordPreferenceKey('workstation')).toContain('workstation')
    expect(wakeWordModePreferenceKey('workstation')).not.toBe(
      wakeWordModePreferenceKey('cloud-agent'),
    )
  })

  test('persists review and automatic-send modes per connection', () => {
    persistWakeWordMode('workstation', 'send')
    persistWakeWordMode('cloud-agent', 'review')
    expect(loadWakeWordMode('workstation')).toBe('send')
    expect(loadWakeWordMode('cloud-agent')).toBe('review')
  })

  test('persists active-turn steering independently per connection', () => {
    persistActiveTurnInputMode('workstation', 'steer')
    persistActiveTurnInputMode('cloud-agent', 'interrupt')

    expect(loadActiveTurnInputMode('workstation')).toBe('steer')
    expect(loadActiveTurnInputMode('cloud-agent')).toBe('interrupt')
    expect(activeTurnInputModePreferenceKey('workstation')).not.toBe(
      activeTurnInputModePreferenceKey('cloud-agent'),
    )
    expect(loadActiveTurnInputMode('new-host')).toBe('interrupt')
  })

  test('migrates the earlier enabled toggle to review mode', () => {
    window.localStorage.setItem(wakeWordPreferenceKey('legacy'), 'true')
    expect(loadWakeWordMode('legacy')).toBe('review')
  })

  test('removes the wake phrase from a captured request', () => {
    expect(stripWakePhrase('Hey, Hermes. What is the weather?')).toBe(
      'What is the weather?',
    )
    expect(stripWakePhrase('Okay Hermes, Pet, explain that tool call.')).toBe(
      'Pet, explain that tool call.',
    )
    expect(stripWakePhrase('OK, Hermes: steer toward the new result.')).toBe(
      'steer toward the new result.',
    )
    expect(stripWakePhrase('Okay Hermes')).toBe('')
    expect(stripWakePhrase('Hermes set a timer for ten minutes')).toBe(
      'set a timer for ten minutes',
    )
    expect(stripWakePhrase('What is the weather?')).toBe(
      'What is the weather?',
    )
  })

  test('listens only when native, connected, foregrounded, enabled, and idle', () => {
    const ready = {
      appActive: true,
      available: true,
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
    expect(shouldListenForWakeWord({ ...ready, available: false })).toBe(false)
    expect(
      shouldListenForWakeWord({ ...ready, voicePhase: 'recording' }),
    ).toBe(false)
    expect(
      shouldListenForWakeWord({ ...ready, voicePhase: 'speaking' }),
    ).toBe(false)
  })
})
