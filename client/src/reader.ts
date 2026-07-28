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
}

export const DEFAULT_READER_BUFFER_AHEAD = 3
export const MAX_READER_BUFFER_AHEAD = 6

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
  dynamicElevenLabs: Array<{ label: string; voice_id: string }> = [],
): VoiceChoice[] {
  return providers.flatMap(provider => {
    if (provider === 'elevenlabs') {
      return dynamicElevenLabs.map(row => ({
        provider,
        voice: row.voice_id,
        label: row.label,
      }))
    }
    return (STATIC_VOICES[provider] ?? []).map(voice => ({
      provider,
      voice,
      label: voice,
    }))
  })
}

export function ttsOverride(
  selection: VoiceSelection,
): Record<string, unknown> | undefined {
  const provider = selection.provider.trim()
  if (!provider) return undefined
  const field = VOICE_FIELD[provider]
  const voice = selection.voice.trim()
  const override: Record<string, unknown> = {
    provider,
    ...(field && voice ? { [provider]: { [field]: voice } } : {}),
  }
  if (Math.abs(selection.speed - 1) >= 0.01) {
    override.speed = selection.speed
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

export function voiceSelectionKey(connectionId: string): string {
  return `hermes-mobile.voice.${connectionId}.selection`
}

export function loadVoiceSelection(connectionId: string): VoiceSelection {
  const fallback = { provider: '', voice: '', speed: 1 }
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
