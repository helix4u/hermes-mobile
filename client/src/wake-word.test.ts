import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  activeTurnInputModePreferenceKey,
  loadActiveTurnInputMode,
  loadSherpaPetWakePhrase,
  loadSherpaVoiceWakePhrase,
  persistSherpaVoiceWakePhrase,
  resolveSherpaWakeRoute,
  releaseWakeForVoice,
  loadSherpaWakePhrase,
  loadWakeWordMode,
  loadWakeWordModelId,
  loadWakeWordProvider,
  persistActiveTurnInputMode,
  persistSherpaPetWakePhrase,
  persistSherpaWakePhrase,
  persistWakeWordMode,
  persistWakeWordModelId,
  persistWakeWordProvider,
  sherpaWakePhrasePreferenceKey,
  sherpaPetWakePhrasePreferenceKey,
  sherpaKeywordLabel,
  shouldListenForWakeWord,
  stripWakePhrase,
  wakeWordModePreferenceKey,
  wakeWordModelPreferenceKey,
  wakeWordProviderPreferenceKey,
  wakeWordPreferenceKey,
} from './wake-word'

describe('Mobile wake word', () => {
  test('voice starts only after native capture releases and never after cancellation', async () => {
    let release!: () => void
    let current = true
    const start = vi.fn()
    const pending = releaseWakeForVoice(() => new Promise<void>(resolve => { release = resolve }), () => current, start)
    expect(start).not.toHaveBeenCalled()
    release()
    await pending
    expect(start).toHaveBeenCalledOnce()
    start.mockClear()
    const cancelled = releaseWakeForVoice(() => new Promise<void>(resolve => { release = resolve }), () => current, start)
    current = false
    release()
    await cancelled
    expect(start).not.toHaveBeenCalled()
    await expect(releaseWakeForVoice(async () => { throw new Error('Capture still owned') }, () => true, start)).rejects.toThrow('Capture still owned')
    expect(start).not.toHaveBeenCalled()
  })
  test('routes live voice independently and scopes the editable phrase and opt-out', () => {
    expect(loadSherpaVoiceWakePhrase('local')).toBe('hey companion')
    expect(persistSherpaVoiceWakePhrase('local', 'Hello Companion')).toBe(true)
    expect(loadSherpaVoiceWakePhrase('local')).toBe('hello companion')
    expect(loadSherpaVoiceWakePhrase('cloud')).toBe('hey companion')
    expect(resolveSherpaWakeRoute('HELLO_COMPANION', 'hey pet', 'hello companion')).toBe('voice')
    expect(resolveSherpaWakeRoute('HEY_PET', 'hey pet', 'hello companion')).toBe('pet')
    expect(resolveSherpaWakeRoute('HEY_HERMES', 'hey pet', 'hello companion')).toBe('hermes')
    persistSherpaVoiceWakePhrase('local', '')
    expect(loadSherpaVoiceWakePhrase('local')).toBe('')
    expect(persistSherpaVoiceWakePhrase('local', '../invalid')).toBe(false)
  })
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

  test('persists a validated wake model per connection', () => {
    persistWakeWordModelId('workstation', 'hey_jarvis')
    persistWakeWordModelId('cloud-agent', 'alexa')
    expect(loadWakeWordModelId('workstation')).toBe('hey_jarvis')
    expect(loadWakeWordModelId('cloud-agent')).toBe('alexa')
    expect(wakeWordModelPreferenceKey('workstation')).not.toBe(
      wakeWordModelPreferenceKey('cloud-agent'),
    )

    window.localStorage.setItem(wakeWordModelPreferenceKey('bad'), 'unknown')
    expect(loadWakeWordModelId('bad')).toBe('hey_hermes')
  })

  test('persists wake providers and Sherpa phrases per connection', () => {
    persistWakeWordProvider('workstation', 'sherpa')
    persistWakeWordProvider('cloud-agent', 'openwakeword')
    expect(loadWakeWordProvider('workstation')).toBe('sherpa')
    expect(loadWakeWordProvider('cloud-agent')).toBe('openwakeword')
    expect(wakeWordProviderPreferenceKey('workstation')).not.toBe(
      wakeWordProviderPreferenceKey('cloud-agent'),
    )

    expect(persistSherpaWakePhrase('workstation', '  Computer  ')).toBe(true)
    expect(loadSherpaWakePhrase('workstation')).toBe('computer')

    expect(persistSherpaPetWakePhrase('workstation', '  Hey Alien  ')).toBe(true)
    expect(loadSherpaPetWakePhrase('workstation')).toBe('hey alien')
    expect(sherpaPetWakePhrasePreferenceKey('workstation')).not.toBe(
      sherpaPetWakePhrasePreferenceKey('cloud-agent'),
    )
    expect(sherpaKeywordLabel('hey alien')).toBe('HEY_ALIEN')
    expect(persistSherpaPetWakePhrase('workstation', '')).toBe(true)
    expect(loadSherpaPetWakePhrase('workstation')).toBe('')
    expect(sherpaWakePhrasePreferenceKey('workstation')).not.toBe(
      sherpaWakePhrasePreferenceKey('cloud-agent'),
    )
    expect(persistSherpaWakePhrase('workstation', '../bad')).toBe(false)
    expect(loadSherpaWakePhrase('workstation')).toBe('computer')
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
    expect(stripWakePhrase('Hey Jarvis, open the session.', 'hey_jarvis')).toBe(
      'open the session.',
    )
    expect(stripWakePhrase('Alexa: open the session.', 'alexa')).toBe(
      'open the session.',
    )
    expect(stripWakePhrase('Hermes should stay in this text.', 'alexa')).toBe(
      'Hermes should stay in this text.',
    )
    expect(
      stripWakePhrase('Computer, open the session.', 'hey_hermes', 'computer'),
    ).toBe('open the session.')
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
