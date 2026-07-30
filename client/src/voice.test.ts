import { describe, expect, test, vi } from 'vitest'
import type { GatewayEvent } from './protocol/types'
import {
  applySpeechPlaybackRate,
  createSerialSpeechTaskQueue,
  completedAssistantText,
  maintainSpeechPlaybackRate,
  normalizeSpeechSequenceBufferAhead,
  runBufferedSpeechQueue,
  SPEECH_REQUEST_TIMEOUT_MS,
  speechConfigAttempts,
  speechItemForInteractivePlayback,
  speechPlaybackRate,
  splitSpeechText,
  synthesizeSpeechItem,
  voicePreferenceKey,
} from './voice'

describe('voice helpers', () => {
  test('extracts only completed assistant text', () => {
    expect(
      completedAssistantText({
        type: 'message.complete',
        payload: {
          content: [{ type: 'text', text: 'Ready.' }],
        },
      } as GatewayEvent),
    ).toBe('Ready.')
    expect(
      completedAssistantText({
        type: 'message.delta',
        payload: { text: 'partial' },
      } as GatewayEvent),
    ).toBe('')
  })

  test('scopes auto-speak preferences by connection', () => {
    expect(voicePreferenceKey('tailnet-home')).toBe(
      'hermes-mobile.voice.tailnet-home.auto-speak',
    )
    expect(voicePreferenceKey('cloud-agent')).not.toBe(
      voicePreferenceKey('tailnet-home'),
    )
  })

  test('splits long speech on readable boundaries below the provider-safe cap', () => {
    const text = `${'First sentence. '.repeat(90)}${'word '.repeat(500)}`
    const chunks = splitSpeechText(text, 420)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every(chunk => chunk.length <= 420)).toBe(true)
    expect(chunks.join(' ').replace(/\s+/g, ' ').trim()).toBe(
      text.replace(/\s+/g, ' ').trim(),
    )
  })

  test('normalizes speech queue buffering to the supported range', () => {
    expect(normalizeSpeechSequenceBufferAhead(undefined)).toBe(3)
    expect(normalizeSpeechSequenceBufferAhead(0)).toBe(0)
    expect(normalizeSpeechSequenceBufferAhead('bad')).toBe(3)
    expect(normalizeSpeechSequenceBufferAhead(-1)).toBe(0)
    expect(normalizeSpeechSequenceBufferAhead(2.6)).toBe(3)
    expect(normalizeSpeechSequenceBufferAhead(20)).toBe(6)
  })

  test('deduplicates configured voice attempts while retaining host fallback', () => {
    const primary = { provider: 'openai', openai: { voice: 'cedar' } }
    expect(
      speechConfigAttempts({
        id: 'one',
        text: 'Hello',
        ttsConfig: primary,
        fallbackTtsConfigs: [
          { openai: { voice: 'cedar' }, provider: 'openai' },
          { provider: 'edge', edge: { voice: 'en-CA-LiamNeural' } },
          undefined,
          undefined,
        ],
      }),
    ).toEqual([
      primary,
      { provider: 'edge', edge: { voice: 'en-CA-LiamNeural' } },
      undefined,
    ])
  })

  test('applies one clamped client playback rate and removes it from interactive synthesis', () => {
    const item = {
      id: 'normal-listen',
      text: 'Hello',
      ttsConfig: {
        provider: 'qwen',
        qwen: { voice: 'saved-clone' },
        speed: 1.35,
      },
      fallbackTtsConfigs: [
        { provider: 'openai', speed: 1.35 },
        { speed: 1.35 },
      ],
    }

    expect(speechPlaybackRate(item)).toBe(1.35)
    expect(speechItemForInteractivePlayback(item)).toEqual({
      ...item,
      ttsConfig: {
        provider: 'qwen',
        qwen: { voice: 'saved-clone' },
      },
      fallbackTtsConfigs: [{ provider: 'openai' }, undefined],
    })

    const audio = {
      defaultPlaybackRate: 1,
      playbackRate: 1,
      preservesPitch: false,
    }
    applySpeechPlaybackRate(audio, 2)
    expect(audio).toEqual({
      defaultPlaybackRate: 1.5,
      playbackRate: 1.5,
      preservesPitch: true,
    })
  })

  test('reapplies 1.5x pet speech when Android media readiness resets the element', () => {
    const listeners = new Map<string, () => void>()
    const audio = {
      defaultPlaybackRate: 1,
      playbackRate: 1,
      preservesPitch: false,
      addEventListener: vi.fn((name: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(name, listener as () => void)
      }),
      removeEventListener: vi.fn((name: string) => {
        listeners.delete(name)
      }),
    }
    const release = maintainSpeechPlaybackRate(
      audio as unknown as HTMLAudioElement,
      1.5,
    )

    expect(audio.playbackRate).toBe(1.5)
    audio.playbackRate = 1
    listeners.get('loadedmetadata')?.()
    expect(audio.playbackRate).toBe(1.5)
    audio.playbackRate = 1
    listeners.get('playing')?.()
    expect(audio.playbackRate).toBe(1.5)

    release()
    expect(listeners.size).toBe(0)
  })

  test('buffers synthesis ahead while preserving playback order', async () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>(done => {
        resolve = done
      })
      return { promise, resolve }
    }
    const items = ['zero', 'one', 'two', 'three'].map(id => ({
      id,
      text: id,
    }))
    const gates = items.map(() => deferred<string>())
    const starts: number[] = []
    const plays: number[] = []
    const playback = runBufferedSpeechQueue(items, {
      bufferAhead: 2,
      synthesize: async (_item, index) => {
        starts.push(index)
        return gates[index].promise
      },
      play: async (_item, _value, index) => {
        plays.push(index)
      },
    })
    await Promise.resolve()
    expect(starts).toEqual([0, 1, 2])
    gates[0].resolve('zero')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(plays).toEqual([0])
    expect(starts).toEqual([0, 1, 2, 3])
    gates[1].resolve('one')
    gates[2].resolve('two')
    gates[3].resolve('three')
    await expect(playback).resolves.toBe(true)
    expect(plays).toEqual([0, 1, 2, 3])
  })

  test('queues separate speech requests without interrupting active playback', async () => {
    let releaseFirst!: () => void
    const firstFinished = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const starts: string[] = []
    const queue = createSerialSpeechTaskQueue()

    const first = queue.enqueue(async () => {
      starts.push('first')
      await firstFinished
    })
    const second = queue.enqueue(async () => {
      starts.push('second')
    })

    await Promise.resolve()
    expect(starts).toEqual(['first'])
    releaseFirst()
    await Promise.all([first, second])
    expect(starts).toEqual(['first', 'second'])
  })

  test('clears waiting speech without disrupting queue reuse', async () => {
    let releaseFirst!: () => void
    const firstFinished = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const starts: string[] = []
    const queue = createSerialSpeechTaskQueue()

    const first = queue.enqueue(async () => {
      starts.push('first')
      await firstFinished
    })
    const discarded = queue.enqueue(async () => {
      starts.push('discarded')
    })
    await Promise.resolve()
    queue.clear()
    const replacement = queue.enqueue(async () => {
      starts.push('replacement')
    })

    await Promise.resolve()
    expect(starts).toEqual(['first', 'replacement'])
    releaseFirst()
    await Promise.all([first, discarded, replacement])
    expect(starts).toEqual(['first', 'replacement'])
  })

  test('retries a failed prefetched item once when it becomes active', async () => {
    const attempts: number[] = []
    const played: string[] = []
    await expect(
      runBufferedSpeechQueue(
        [
          { id: 'first', text: 'First' },
          { id: 'second', text: 'Second' },
        ],
        {
          bufferAhead: 1,
          synthesize: async item => {
            attempts.push(item.id === 'first' ? 0 : 1)
            if (
              item.id === 'second' &&
              attempts.filter(index => index === 1).length === 1
            ) {
              throw new Error('prefetch failed')
            }
            return item.id
          },
          play: async (_item, value) => {
            played.push(value)
          },
        },
      ),
    ).resolves.toBe(true)
    expect(attempts).toEqual([0, 1, 1])
    expect(played).toEqual(['first', 'second'])
  })

  test('gives blocking speech synthesis enough time to cross the mobile proxy', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data_url: 'data:audio/mpeg;base64,AA==',
    })
    const transport = {
      requestJson,
    } as unknown as Parameters<typeof synthesizeSpeechItem>[0]

    await expect(
      synthesizeSpeechItem(transport, {
        id: 'podcast-chunk',
        text: 'A later podcast section.',
        ttsConfig: { provider: 'xai', xai: { voice_id: 'eve' } },
      }),
    ).resolves.toBe('data:audio/mpeg;base64,AA==')

    expect(requestJson).toHaveBeenCalledWith(
      '/api/audio/speak',
      {
        text: 'A later podcast section.',
        tts_config: { provider: 'xai', xai: { voice_id: 'eve' } },
      },
      { timeoutMs: SPEECH_REQUEST_TIMEOUT_MS },
    )
  })
})
