import { describe, expect, test, vi } from 'vitest'
import {
  adaptiveSpeechBufferAhead,
  adaptiveSpeechChunkChars,
  adaptiveStartupSpeechChars,
  configuredSpeechTimingProvider,
  DEFAULT_ADAPTIVE_BUFFER_AHEAD,
  DEFAULT_STARTUP_SPEECH_CHARS,
  HOST_DEFAULT_SPEECH_PROVIDER,
  loadSpeechTimingStore,
  recordSpeechAudioTiming,
  recordSpeechSynthesisTiming,
  speechTimingStorageKey,
  type SpeechTimingStorage,
} from './speech-timing'

class MemoryStorage implements SpeechTimingStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('connection-scoped speech timing', () => {
  test('stores only provider timing aggregates under the active connection', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(123_456)
    const storage = new MemoryStorage()

    recordSpeechSynthesisTiming('workstation', 'OpenAI', 1_000, 100, storage)
    recordSpeechSynthesisTiming('workstation', 'OpenAI', 3_000, 100, storage)
    recordSpeechAudioTiming('workstation', 'OpenAI', 8_000, 100, storage)

    const store = loadSpeechTimingStore('workstation', storage)
    expect(store.providers.openai).toEqual({
      synthesisSamples: 2,
      averageSynthesisMsPerChar: 20,
      audioSamples: 1,
      averageAudioMsPerChar: 80,
      updatedAt: 123_456,
    })
    expect(loadSpeechTimingStore('cloud-agent', storage).providers).toEqual({})

    const persisted = storage.values.get(
      speechTimingStorageKey('workstation'),
    )
    expect(persisted).toContain('"averageSynthesisMsPerChar":20')
    expect(persisted).not.toContain('spoken text')
    now.mockRestore()
  })

  test('uses provider history to tune startup size and synthesis lookahead', () => {
    const storage = new MemoryStorage()
    recordSpeechSynthesisTiming('fast', 'openai', 200, 100, storage)
    recordSpeechAudioTiming('fast', 'openai', 5_000, 100, storage)
    const fast = loadSpeechTimingStore('fast', storage)
    expect(adaptiveStartupSpeechChars(fast, 'openai', 1.5)).toBe(1_050)
    expect(adaptiveSpeechChunkChars(fast, 'openai', 1.5, 1_050)).toBe(
      1_200,
    )
    expect(adaptiveSpeechBufferAhead(fast, 'openai', 1.5)).toBe(2)

    recordSpeechSynthesisTiming('slow', 'qwen', 2_000, 100, storage)
    recordSpeechAudioTiming('slow', 'qwen', 1_000, 100, storage)
    const slow = loadSpeechTimingStore('slow', storage)
    expect(adaptiveStartupSpeechChars(slow, 'qwen', 1.5)).toBe(1_400)
    expect(adaptiveSpeechChunkChars(slow, 'qwen', 1.5, 1_400)).toBe(480)
    expect(adaptiveSpeechBufferAhead(slow, 'qwen', 1.5)).toBe(4)
  })

  test('keeps safe defaults until the selected provider has enough history', () => {
    const empty = loadSpeechTimingStore('new-connection', new MemoryStorage())
    expect(adaptiveStartupSpeechChars(empty, 'edge')).toBe(
      DEFAULT_STARTUP_SPEECH_CHARS,
    )
    expect(adaptiveStartupSpeechChars(empty, 'edge', 1.5)).toBe(1_050)
    expect(adaptiveSpeechChunkChars(empty, 'edge', 1.5, 1_050)).toBe(900)
    expect(adaptiveSpeechBufferAhead(empty, 'edge', 1.5)).toBe(
      DEFAULT_ADAPTIVE_BUFFER_AHEAD,
    )
    expect(configuredSpeechTimingProvider(undefined)).toBe(
      HOST_DEFAULT_SPEECH_PROVIDER,
    )
    expect(configuredSpeechTimingProvider({ provider: 'F5 TTS' })).toBe(
      'f5-tts',
    )
  })
})
