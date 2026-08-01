export interface ReaderScriptBlock {
  id: string
  speaker: string
  text: string
}

export interface VoiceChoice {
  provider: string
  voice: string
  label: string
}

export interface VoiceSelection {
  provider: string
  voice: string
  speed: number
  instruct?: string
  language?: string
  xai?: XaiTtsSelection
}

export interface XaiTtsSelection {
  autoSpeechTags: boolean
  bitRate: number
  optimizeStreamingLatency: 0 | 1 | 2
  sampleRate: number
  synthesisSpeed: number
  textNormalization: boolean
}

export const DEFAULT_XAI_TTS_SELECTION: XaiTtsSelection = {
  autoSpeechTags: false,
  bitRate: 128_000,
  optimizeStreamingLatency: 0,
  sampleRate: 24_000,
  synthesisSpeed: 1,
  textNormalization: false,
}

export function normalizeXaiTtsSelection(
  value: Partial<XaiTtsSelection> | null | undefined,
): XaiTtsSelection {
  const speed = Number(value?.synthesisSpeed)
  const latency = Math.round(Number(value?.optimizeStreamingLatency))
  const sampleRate = Number(value?.sampleRate)
  const bitRate = Number(value?.bitRate)
  return {
    autoSpeechTags: value?.autoSpeechTags === true,
    bitRate: [32_000, 64_000, 96_000, 128_000, 192_000].includes(bitRate)
      ? bitRate
      : DEFAULT_XAI_TTS_SELECTION.bitRate,
    optimizeStreamingLatency: (
      [0, 1, 2].includes(latency) ? latency : 0
    ) as 0 | 1 | 2,
    sampleRate: [8_000, 16_000, 22_050, 24_000, 44_100, 48_000].includes(
      sampleRate,
    )
      ? sampleRate
      : DEFAULT_XAI_TTS_SELECTION.sampleRate,
    synthesisSpeed: Number.isFinite(speed)
      ? Math.max(0.7, Math.min(1.5, speed))
      : DEFAULT_XAI_TTS_SELECTION.synthesisSpeed,
    textNormalization: value?.textNormalization === true,
  }
}

export interface TtsOverrideOptions {
  xaiAutoSpeechTags?: boolean
}

export const DEFAULT_READER_BUFFER_AHEAD = 3
export const MAX_READER_BUFFER_AHEAD = 6
export const DEFAULT_READER_SYNTHESIS_CONCURRENCY = 2
export const MAX_READER_SYNTHESIS_CONCURRENCY = 3

const MARKERS = [
  /^\(([^()\n]{1,80})\)\s*$/,
  /^\[([^\n]{1,80})\]\s*$/,
  /^\*\*([^*\n:]{1,80}):\*\*\s*$/,
  /^([\p{L}\p{N}][\p{L}\p{N} ._'’-]{0,79}):\s*$/u,
]

export const VOICE_FIELD: Record<string, 'voice' | 'voice_id'> = {
  edge: 'voice',
  elevenlabs: 'voice_id',
  gemini: 'voice',
  kittentts: 'voice',
  minimax: 'voice_id',
  mistral: 'voice_id',
  openai: 'voice',
  piper: 'voice',
  xai: 'voice_id',
}

export const STATIC_VOICES: Record<string, string[]> = {
  edge: [
    'en-US-AriaNeural',
    'en-US-JennyNeural',
    'en-US-AndrewNeural',
    'en-US-BrianNeural',
    'en-US-GuyNeural',
    'en-US-JaneNeural',
    'en-US-NancyNeural',
    'en-GB-LibbyNeural',
    'en-GB-RyanNeural',
    'en-GB-SoniaNeural',
    'en-CA-ClaraNeural',
    'en-CA-LiamNeural',
    'en-AU-NatashaNeural',
    'en-AU-WilliamNeural',
  ],
  openai: [
    'alloy',
    'ash',
    'ballad',
    'coral',
    'echo',
    'fable',
    'nova',
    'onyx',
    'sage',
    'shimmer',
    'verse',
    'marin',
    'cedar',
  ],
  xai: [
    'eve',
    'ara',
    'rex',
    'sal',
    'leo',
    'carina',
    'zagan',
    'helix',
    'orion',
    'luna',
    'iris',
    'altair',
    'zenith',
    'perseus',
    'helios',
    'lux',
    'kepler',
    'rigel',
    'cosmo',
    'celeste',
    'ursa',
    'sirius',
    'lumen',
    'castor',
    'naksh',
    'atlas',
  ],
  minimax: [
    'English_expressive_narrator',
    'English_radiant_girl',
    'English_magnetic_voiced_man',
    'English_compelling_lady1',
    'English_Aussie_Bloke',
    'English_Upbeat_Woman',
    'English_Trustworth_Man',
    'English_CalmWoman',
    'English_Gentle-voiced_man',
    'English_FriendlyPerson',
  ],
  gemini: [
    'Zephyr',
    'Kore',
    'Puck',
    'Charon',
    'Fenrir',
    'Leda',
    'Orus',
    'Aoede',
    'Callirrhoe',
    'Autonoe',
    'Enceladus',
    'Iapetus',
    'Umbriel',
    'Algieba',
    'Despina',
    'Erinome',
    'Algenib',
    'Rasalgethi',
    'Laomedeia',
    'Achernar',
    'Alnilam',
    'Schedar',
    'Gacrux',
    'Pulcherrima',
    'Achird',
    'Zubenelgenubi',
    'Vindemiatrix',
    'Sadachbia',
    'Sadaltager',
    'Sulafat',
  ],
  kittentts: [
    'Bella',
    'Jasper',
    'Luna',
    'Bruno',
    'Rosie',
    'Hugo',
    'Kiki',
    'Leo',
  ],
  piper: [
    'en_US-lessac-medium',
    'en_US-amy-medium',
    'en_US-ryan-medium',
    'en_US-ryan-high',
    'en_GB-alan-medium',
    'en_GB-alba-medium',
  ],
}

const APPENDIX_HEADING_RE =
  /^#{1,6}\s+(?:primary\s+sources|sources|references|show\s+notes)\s*$/i

export function parseReaderScript(text: string): ReaderScriptBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReaderScriptBlock[] = []
  let speaker = 'Narrator'
  let pending: string[] = []

  const flush = () => {
    const content = pending.join('\n').trim()
    pending = []
    if (!content) return
    blocks.push({
      id: `reader-${blocks.length}-${speaker.toLowerCase().replace(/\W+/g, '-')}`,
      speaker,
      text: content,
    })
  }

  for (const line of lines) {
    if (APPENDIX_HEADING_RE.test(line.trim())) break
    let marker = ''
    for (const pattern of MARKERS) {
      const match = pattern.exec(line.trim())
      if (match?.[1]?.trim()) {
        marker = match[1].trim()
        break
      }
    }
    if (marker) {
      flush()
      speaker = marker
    } else {
      pending.push(line)
    }
  }
  flush()
  return blocks
}

export function readerSpeakers(
  blocks: ReaderScriptBlock[],
): Array<{ name: string; sample: string }> {
  const samples = new Map<string, string>()
  for (const block of blocks) {
    if (!samples.has(block.speaker)) samples.set(block.speaker, block.text)
  }
  return [...samples].map(([name, sample]) => ({
    name,
    sample: sample.slice(0, 560),
  }))
}

export function voiceChoices(
  providers: string[],
  dynamicVoices: Record<string, Array<{ id: string; label: string }>> = {},
): VoiceChoice[] {
  return providers.flatMap(provider => {
    const dynamic = dynamicVoices[provider] ?? []
    const staticVoices = STATIC_VOICES[provider] ?? []
    const rows = new Map<string, string>()
    for (const voice of staticVoices) rows.set(voice, voice)
    for (const row of dynamic) rows.set(row.id, row.label)
    return [...rows].map(([voice, label]) => ({
      provider,
      voice,
      label,
    }))
  })
}

export function ttsOverride(
  selection: VoiceSelection,
  options: TtsOverrideOptions = {},
): Record<string, unknown> | undefined {
  const provider = selection.provider.trim()
  const speed =
    Number.isFinite(selection.speed) &&
    Math.abs(selection.speed - 1) >= 0.01
      ? Math.max(0.7, Math.min(1.5, selection.speed))
      : undefined
  if (!provider) return speed === undefined ? undefined : { speed }
  const field = VOICE_FIELD[provider]
  const voice = selection.voice.trim()
  const override: Record<string, unknown> = {
    provider,
    ...(field && voice
      ? { [provider]: { [field]: voice } }
      : voice
      ? {
          voice,
          [provider]: { voice },
          providers: { [provider]: { voice } },
        }
      : {}),
    ...(provider !== 'xai' && selection.language?.trim()
      ? { language: selection.language.trim() }
      : {}),
    ...(selection.instruct?.trim()
      ? { instruct: selection.instruct.trim() }
      : {}),
  }
  if (speed !== undefined) {
    override.speed = speed
  }
  if (provider === 'xai' && (selection.xai || options.xaiAutoSpeechTags)) {
    let xai =
      override.xai && typeof override.xai === 'object'
        ? (override.xai as Record<string, unknown>)
        : {}
    if (selection.xai) {
      const selected = normalizeXaiTtsSelection(selection.xai)
      xai = {
        ...xai,
        auto_speech_tags: selected.autoSpeechTags,
        bit_rate: selected.bitRate,
        language: selection.language?.trim() || 'en',
        optimize_streaming_latency: selected.optimizeStreamingLatency,
        sample_rate: selected.sampleRate,
        speed: selected.synthesisSpeed,
        text_normalization: selected.textNormalization,
      }
    }
    override.xai = {
      ...xai,
      ...(options.xaiAutoSpeechTags ? { auto_speech_tags: true } : {}),
    }
  }
  return override
}

export function readerFallbackSelections(
  primary: VoiceSelection,
  choices: VoiceChoice[],
  speed = primary.speed,
  limit = 3,
): VoiceSelection[] {
  const primaryKey = `${primary.provider}:${primary.voice}`
  const alternatives = choices.filter(
    choice => `${choice.provider}:${choice.voice}` !== primaryKey,
  )
  const ordered: VoiceChoice[] = []
  const used = new Set<string>()
  const add = (choice: VoiceChoice) => {
    const key = `${choice.provider}:${choice.voice}`
    if (used.has(key)) return
    used.add(key)
    ordered.push(choice)
  }

  const otherProviders = new Set(
    alternatives
      .filter(choice => choice.provider !== primary.provider)
      .map(choice => choice.provider),
  )
  for (const provider of otherProviders) {
    const choice = alternatives.find(row => row.provider === provider)
    if (choice) add(choice)
  }
  for (const choice of alternatives) add(choice)

  return ordered.slice(0, Math.max(0, Math.floor(limit))).map(choice => ({
    provider: choice.provider,
    voice: choice.voice,
    speed,
  }))
}

export function normalizeReaderBufferAhead(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_READER_BUFFER_AHEAD
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_READER_BUFFER_AHEAD
  return Math.max(0, Math.min(MAX_READER_BUFFER_AHEAD, Math.round(numeric)))
}

export function readerBufferKey(connectionId: string): string {
  return `hermes-mobile.reader.${connectionId}.buffer-ahead`
}

export function normalizeReaderSynthesisConcurrency(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_READER_SYNTHESIS_CONCURRENCY
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_READER_SYNTHESIS_CONCURRENCY
  return Math.max(
    1,
    Math.min(MAX_READER_SYNTHESIS_CONCURRENCY, Math.round(numeric)),
  )
}

export function readerSynthesisConcurrencyKey(connectionId: string): string {
  return `hermes-mobile.reader.${connectionId}.synthesis-concurrency`
}

export function readerProvidersKey(connectionId: string): string {
  return `hermes-mobile.reader.${connectionId}.providers`
}

export function normalizeReaderProviders(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((provider): provider is string => typeof provider === 'string')
        .map(provider => provider.trim())
        .filter(Boolean),
    ),
  ).slice(0, 64)
}

export function loadReaderProviders(connectionId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(readerProvidersKey(connectionId))
    return raw ? normalizeReaderProviders(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function persistReaderProviders(
  connectionId: string,
  providers: string[],
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    readerProvidersKey(connectionId),
    JSON.stringify(normalizeReaderProviders(providers)),
  )
}

export function loadReaderBufferAhead(connectionId: string): number {
  if (typeof window === 'undefined') return DEFAULT_READER_BUFFER_AHEAD
  return normalizeReaderBufferAhead(
    window.localStorage.getItem(readerBufferKey(connectionId)),
  )
}

export function persistReaderBufferAhead(
  connectionId: string,
  value: number,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    readerBufferKey(connectionId),
    String(normalizeReaderBufferAhead(value)),
  )
}

export function loadReaderSynthesisConcurrency(connectionId: string): number {
  if (typeof window === 'undefined') {
    return DEFAULT_READER_SYNTHESIS_CONCURRENCY
  }
  return normalizeReaderSynthesisConcurrency(
    window.localStorage.getItem(readerSynthesisConcurrencyKey(connectionId)),
  )
}

export function persistReaderSynthesisConcurrency(
  connectionId: string,
  value: number,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    readerSynthesisConcurrencyKey(connectionId),
    String(normalizeReaderSynthesisConcurrency(value)),
  )
}

export function reconcileReaderProviders(
  selected: string[],
  available: string[],
  preferred = '',
): string[] {
  const valid = selected.filter(provider => available.includes(provider))
  if (valid.length > 0) return valid
  if (available.length === 0) return []
  return [preferred && available.includes(preferred) ? preferred : available[0]]
}

export function voiceSelectionKey(connectionId: string): string {
  return `hermes-mobile.voice.${connectionId}.selection`
}

export function loadVoiceSelection(connectionId: string): VoiceSelection {
  const fallback = {
    provider: '',
    voice: '',
    speed: 1,
    instruct: '',
    language: '',
  }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(voiceSelectionKey(connectionId))
    if (!raw) return fallback
    const value = JSON.parse(raw) as Partial<VoiceSelection>
    const speed = Number(value.speed)
    return {
      provider: String(value.provider ?? ''),
      voice: String(value.voice ?? ''),
      speed: Number.isFinite(speed) ? Math.max(0.7, Math.min(1.5, speed)) : 1,
      instruct: String(value.instruct ?? ''),
      language: String(value.language ?? ''),
      xai:
        value.xai && typeof value.xai === 'object'
          ? normalizeXaiTtsSelection(value.xai)
          : undefined,
    }
  } catch {
    return fallback
  }
}

export function persistVoiceSelection(
  connectionId: string,
  selection: VoiceSelection,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    voiceSelectionKey(connectionId),
    JSON.stringify(selection),
  )
}
