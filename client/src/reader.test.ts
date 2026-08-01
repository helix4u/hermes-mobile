import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  DEFAULT_READER_BUFFER_AHEAD,
  MAX_READER_BUFFER_AHEAD,
  loadReaderProviders,
  normalizeReaderBufferAhead,
  normalizeReaderProviders,
  parseReaderScript,
  persistReaderProviders,
  readerBufferKey,
  readerFallbackSelections,
  readerProvidersKey,
  readerSpeakers,
  reconcileReaderProviders,
  ttsOverride,
  voiceChoices,
  voiceSelectionKey,
} from './reader'

describe('reader helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  test.each([
    '## Primary sources',
    '## Sources',
    '### References',
    '# Show Notes',
  ])('omits source appendices from Reader scripts at %s', heading => {
    const blocks = parseReaderScript(
      `(Narrator)\nKeep this spoken.\n\n${heading}\n- https://example.com/source\nDo not speak this.`,
    )

    expect(blocks).toEqual([
      {
        id: 'reader-0-narrator',
        speaker: 'Narrator',
        text: 'Keep this spoken.',
      },
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
    expect(
      ttsOverride(
        { provider: 'xai', voice: 'eve', speed: 1.1 },
        { xaiAutoSpeechTags: true },
      ),
    ).toEqual({
      provider: 'xai',
      speed: 1.1,
      xai: { auto_speech_tags: true, voice_id: 'eve' },
    })
    expect(
      ttsOverride(
        { provider: 'openai', voice: 'nova', speed: 1 },
        { xaiAutoSpeechTags: true },
      ),
    ).toEqual({
      openai: { voice: 'nova' },
      provider: 'openai',
    })
    expect(ttsOverride({ provider: '', voice: '', speed: 1 })).toBeUndefined()
    expect(ttsOverride({ provider: '', voice: '', speed: 1.25 })).toEqual({
      speed: 1.25,
    })
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

  test('reconciles reader providers when the active host changes', () => {
    expect(
      reconcileReaderProviders(
        ['qwen'],
        ['edge', 'openai', 'qwen'],
        'openai',
      ),
    ).toEqual(['qwen'])
    expect(reconcileReaderProviders(['qwen'], [], 'qwen')).toEqual([])
    expect(
      reconcileReaderProviders(
        ['missing-provider'],
        ['edge', 'openai'],
        'openai',
      ),
    ).toEqual(['openai'])
    expect(reconcileReaderProviders([], ['edge', 'openai'], 'qwen')).toEqual([
      'edge',
    ])
  })

  test('persists enabled Reader providers independently for each connection', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })

    persistReaderProviders('workstation', ['openai', 'qwen', 'openai'])
    persistReaderProviders('cloud-agent', ['edge'])

    expect(loadReaderProviders('workstation')).toEqual(['openai', 'qwen'])
    expect(loadReaderProviders('cloud-agent')).toEqual(['edge'])
    expect(readerProvidersKey('workstation')).not.toBe(
      readerProvidersKey('cloud-agent'),
    )
    expect(
      normalizeReaderProviders([' qwen ', '', null, 'openai', 'qwen']),
    ).toEqual(['qwen', 'openai'])
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
