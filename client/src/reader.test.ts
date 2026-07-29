import { describe, expect, test } from 'vitest'
import {
  DEFAULT_READER_BUFFER_AHEAD,
  MAX_READER_BUFFER_AHEAD,
  normalizeReaderBufferAhead,
  parseReaderScript,
  readerBufferKey,
  readerFallbackSelections,
  readerSpeakers,
  ttsOverride,
  voiceChoices,
  voiceSelectionKey,
} from './reader'

describe('reader helpers', () => {
  test('parses speaker markers into ordered blocks', () => {
    const blocks = parseReaderScript(
      '(Narrator)\nThe door opened.\n\n[Ada]\nHello.\n\n**Lin:**\nWelcome.',
    )
    expect(blocks.map(block => [block.speaker, block.text])).toEqual([
      ['Narrator', 'The door opened.'],
      ['Ada', 'Hello.'],
      ['Lin', 'Welcome.'],
    ])
    expect(readerSpeakers(blocks).map(row => row.name)).toEqual([
      'Narrator',
      'Ada',
      'Lin',
    ])
  })

  test('builds the provider-specific voice override used by normal and reader speech', () => {
    expect(
      ttsOverride({ provider: 'xai', voice: 'eve', speed: 1.1 }),
    ).toEqual({
      provider: 'xai',
      speed: 1.1,
      xai: { voice_id: 'eve' },
    })
    expect(ttsOverride({ provider: '', voice: '', speed: 1 })).toBeUndefined()
  })

  test('merges partial live built-in catalogs and keeps custom catalogs', () => {
    const choices = voiceChoices(
      ['openai', 'qwen'],
      {
        openai: [{ id: 'shimmer', label: 'Configured Shimmer' }],
        qwen: [{ id: 'saved-clone', label: 'Saved Clone' }],
      },
    )

    expect(
      choices
        .filter(choice => choice.provider === 'openai')
        .map(choice => choice.voice),
    ).toEqual(expect.arrayContaining(['alloy', 'cedar', 'shimmer']))
    expect(
      choices.find(
        choice =>
          choice.provider === 'openai' && choice.voice === 'shimmer',
      )?.label,
    ).toBe('Configured Shimmer')
    expect(
      choices.filter(choice => choice.provider === 'qwen'),
    ).toEqual([
      {
        provider: 'qwen',
        voice: 'saved-clone',
        label: 'Saved Clone',
      },
    ])
  })

  test('scopes normal voice selection by connection', () => {
    expect(voiceSelectionKey('tailnet')).not.toBe(
      voiceSelectionKey('cloud-agent'),
    )
  })

  test('normalizes and scopes reader buffer-ahead preferences', () => {
    expect(normalizeReaderBufferAhead('not-a-number')).toBe(
      DEFAULT_READER_BUFFER_AHEAD,
    )
    expect(normalizeReaderBufferAhead(null)).toBe(
      DEFAULT_READER_BUFFER_AHEAD,
    )
    expect(normalizeReaderBufferAhead(-2)).toBe(0)
    expect(normalizeReaderBufferAhead(4.6)).toBe(5)
    expect(normalizeReaderBufferAhead(99)).toBe(
      MAX_READER_BUFFER_AHEAD,
    )
    expect(readerBufferKey('tailnet')).not.toBe(
      readerBufferKey('cloud-agent'),
    )
  })

  test('orders reader fallbacks across alternate providers before same-provider voices', () => {
    const fallbacks = readerFallbackSelections(
      { provider: 'openai', voice: 'cedar', speed: 1.1 },
      [
        { provider: 'openai', voice: 'cedar', label: 'Cedar' },
        { provider: 'openai', voice: 'nova', label: 'Nova' },
        { provider: 'edge', voice: 'en-CA-LiamNeural', label: 'Liam' },
        { provider: 'edge', voice: 'en-US-GuyNeural', label: 'Guy' },
        { provider: 'xai', voice: 'eve', label: 'Eve' },
      ],
    )
    expect(fallbacks).toEqual([
      { provider: 'edge', voice: 'en-CA-LiamNeural', speed: 1.1 },
      { provider: 'xai', voice: 'eve', speed: 1.1 },
      { provider: 'openai', voice: 'nova', speed: 1.1 },
    ])
  })
})
