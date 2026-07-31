export const HOST_DEFAULT_SPEECH_PROVIDER = '__host_default__'
export const DEFAULT_STARTUP_SPEECH_CHARS = 700
export const MIN_STARTUP_SPEECH_CHARS = 480
export const MAX_STARTUP_SPEECH_CHARS = 1_400
export const DEFAULT_ADAPTIVE_SPEECH_CHARS = 900
export const MIN_ADAPTIVE_SPEECH_CHARS = 480
export const MAX_ADAPTIVE_SPEECH_CHARS = 1_200
export const DEFAULT_ADAPTIVE_BUFFER_AHEAD = 3
export const MAX_ADAPTIVE_BUFFER_AHEAD = 6

const SPEECH_TIMING_VERSION = 1
const MAX_PROVIDER_ROWS = 24
const MAX_SAMPLE_WEIGHT = 100
const STARTUP_RUNWAY_MARGIN = 1.15
const LATER_CHUNK_RUNWAY_TARGET = 0.85
const MIN_ADAPTIVE_BUFFER_AHEAD = 2

export interface SpeechTimingStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ProviderSpeechTiming {
  synthesisSamples: number
  averageSynthesisMsPerChar: number
  audioSamples: number
  averageAudioMsPerChar: number
  updatedAt: number
}

interface SpeechTimingStore {
  version: 1
  providers: Record<string, ProviderSpeechTiming>
}

function timingStorage(): SpeechTimingStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function speechTimingStorageKey(connectionId: string): string {
  return `hermes-mobile.voice.${connectionId}.provider-timing.v1`
}

export function normalizeSpeechTimingProvider(provider: unknown): string {
  const normalized = String(provider ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 80)
  return normalized || HOST_DEFAULT_SPEECH_PROVIDER
}

export function configuredSpeechTimingProvider(
  config: Record<string, unknown> | undefined,
): string {
  return normalizeSpeechTimingProvider(config?.provider)
}

function validTiming(value: unknown): ProviderSpeechTiming | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const synthesisSamples = Number(row.synthesisSamples)
  const averageSynthesisMsPerChar = Number(row.averageSynthesisMsPerChar)
  const audioSamples = Number(row.audioSamples)
  const averageAudioMsPerChar = Number(row.averageAudioMsPerChar)
  const updatedAt = Number(row.updatedAt)
  if (
    !Number.isFinite(synthesisSamples) ||
    synthesisSamples < 0 ||
    !Number.isFinite(averageSynthesisMsPerChar) ||
    averageSynthesisMsPerChar < 0 ||
    !Number.isFinite(audioSamples) ||
    audioSamples < 0 ||
    !Number.isFinite(averageAudioMsPerChar) ||
    averageAudioMsPerChar < 0 ||
    !Number.isFinite(updatedAt) ||
    updatedAt < 0
  ) {
    return null
  }
  return {
    synthesisSamples: Math.min(MAX_SAMPLE_WEIGHT, Math.floor(synthesisSamples)),
    averageSynthesisMsPerChar,
    audioSamples: Math.min(MAX_SAMPLE_WEIGHT, Math.floor(audioSamples)),
    averageAudioMsPerChar,
    updatedAt,
  }
}

export function loadSpeechTimingStore(
  connectionId: string,
  storage: SpeechTimingStorage | null = timingStorage(),
): SpeechTimingStore {
  const empty: SpeechTimingStore = {
    version: SPEECH_TIMING_VERSION,
    providers: {},
  }
  if (!storage) return empty
  try {
    const raw = storage.getItem(speechTimingStorageKey(connectionId))
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version !== SPEECH_TIMING_VERSION) return empty
    const source =
      parsed.providers &&
      typeof parsed.providers === 'object' &&
      !Array.isArray(parsed.providers)
        ? (parsed.providers as Record<string, unknown>)
        : {}
    const providers: Record<string, ProviderSpeechTiming> = {}
    for (const [provider, value] of Object.entries(source)) {
      const timing = validTiming(value)
      if (timing) providers[normalizeSpeechTimingProvider(provider)] = timing
    }
    return { version: SPEECH_TIMING_VERSION, providers }
  } catch {
    return empty
  }
}

function persistSpeechTimingStore(
  connectionId: string,
  store: SpeechTimingStore,
  storage: SpeechTimingStorage | null,
): void {
  if (!storage) return
  const providers = Object.fromEntries(
    Object.entries(store.providers)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_PROVIDER_ROWS),
  )
  try {
    storage.setItem(
      speechTimingStorageKey(connectionId),
      JSON.stringify({
        version: SPEECH_TIMING_VERSION,
        providers,
      } satisfies SpeechTimingStore),
    )
  } catch {
    // Timing history is an optional local optimization.
  }
}

function rollingAverage(
  currentAverage: number,
  currentSamples: number,
  sample: number,
): { average: number; samples: number } {
  const weight = Math.min(MAX_SAMPLE_WEIGHT - 1, Math.max(0, currentSamples))
  return {
    average: (currentAverage * weight + sample) / (weight + 1),
    samples: Math.min(MAX_SAMPLE_WEIGHT, currentSamples + 1),
  }
}

function recordTiming(
  connectionId: string,
  provider: unknown,
  kind: 'synthesis' | 'audio',
  elapsedMs: number,
  characterCount: number,
  storage: SpeechTimingStorage | null = timingStorage(),
): void {
  if (
    !connectionId ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0 ||
    !Number.isFinite(characterCount) ||
    characterCount <= 0
  ) {
    return
  }
  const providerKey = normalizeSpeechTimingProvider(provider)
  const store = loadSpeechTimingStore(connectionId, storage)
  const current = store.providers[providerKey] ?? {
    synthesisSamples: 0,
    averageSynthesisMsPerChar: 0,
    audioSamples: 0,
    averageAudioMsPerChar: 0,
    updatedAt: 0,
  }
  const sample = elapsedMs / characterCount
  if (kind === 'synthesis') {
    const next = rollingAverage(
      current.averageSynthesisMsPerChar,
      current.synthesisSamples,
      sample,
    )
    current.averageSynthesisMsPerChar = next.average
    current.synthesisSamples = next.samples
  } else {
    const next = rollingAverage(
      current.averageAudioMsPerChar,
      current.audioSamples,
      sample,
    )
    current.averageAudioMsPerChar = next.average
    current.audioSamples = next.samples
  }
  current.updatedAt = Date.now()
  store.providers[providerKey] = current
  persistSpeechTimingStore(connectionId, store, storage)
}

export function recordSpeechSynthesisTiming(
  connectionId: string,
  provider: unknown,
  elapsedMs: number,
  characterCount: number,
  storage?: SpeechTimingStorage | null,
): void {
  recordTiming(
    connectionId,
    provider,
    'synthesis',
    elapsedMs,
    characterCount,
    storage,
  )
}

export function recordSpeechAudioTiming(
  connectionId: string,
  provider: unknown,
  durationMs: number,
  characterCount: number,
  storage?: SpeechTimingStorage | null,
): void {
  recordTiming(
    connectionId,
    provider,
    'audio',
    durationMs,
    characterCount,
    storage,
  )
}

function providerTiming(
  store: SpeechTimingStore,
  provider: unknown,
): ProviderSpeechTiming | undefined {
  return store.providers[normalizeSpeechTimingProvider(provider)]
}

export function adaptiveStartupSpeechChars(
  store: SpeechTimingStore,
  provider: unknown,
  playbackRate = 1,
): number {
  const normalizedRate = Math.max(0.7, Math.min(1.5, playbackRate))
  const playbackRateFloor = Math.round(
    DEFAULT_STARTUP_SPEECH_CHARS * normalizedRate,
  )
  const timing = providerTiming(store, provider)
  if (
    !timing ||
    timing.synthesisSamples < 1 ||
    timing.audioSamples < 1 ||
    timing.averageSynthesisMsPerChar <= 0 ||
    timing.averageAudioMsPerChar <= 0
  ) {
    return Math.max(
      MIN_STARTUP_SPEECH_CHARS,
      Math.min(MAX_STARTUP_SPEECH_CHARS, playbackRateFloor),
    )
  }
  const playbackMsPerChar = timing.averageAudioMsPerChar / normalizedRate
  const learnedRunway = Math.ceil(
    (DEFAULT_ADAPTIVE_SPEECH_CHARS *
      timing.averageSynthesisMsPerChar *
      STARTUP_RUNWAY_MARGIN) /
      playbackMsPerChar,
  )
  return Math.max(
    MIN_STARTUP_SPEECH_CHARS,
    Math.min(
      MAX_STARTUP_SPEECH_CHARS,
      Math.max(playbackRateFloor, learnedRunway),
    ),
  )
}

export function adaptiveSpeechChunkChars(
  store: SpeechTimingStore,
  provider: unknown,
  playbackRate: number,
  startupChars: number,
): number {
  const timing = providerTiming(store, provider)
  if (
    !timing ||
    timing.synthesisSamples < 1 ||
    timing.audioSamples < 1 ||
    timing.averageSynthesisMsPerChar <= 0 ||
    timing.averageAudioMsPerChar <= 0
  ) {
    return DEFAULT_ADAPTIVE_SPEECH_CHARS
  }
  const normalizedRate = Math.max(0.7, Math.min(1.5, playbackRate))
  const playbackMsPerChar = timing.averageAudioMsPerChar / normalizedRate
  const sustainableChars = Math.floor(
    (Math.max(MIN_STARTUP_SPEECH_CHARS, startupChars) *
      playbackMsPerChar *
      LATER_CHUNK_RUNWAY_TARGET) /
      timing.averageSynthesisMsPerChar,
  )
  return Math.max(
    MIN_ADAPTIVE_SPEECH_CHARS,
    Math.min(MAX_ADAPTIVE_SPEECH_CHARS, sustainableChars),
  )
}

export function adaptiveSpeechBufferAhead(
  store: SpeechTimingStore,
  provider: unknown,
  playbackRate: number,
): number {
  const timing = providerTiming(store, provider)
  if (
    !timing ||
    timing.synthesisSamples < 1 ||
    timing.audioSamples < 1 ||
    timing.averageSynthesisMsPerChar <= 0 ||
    timing.averageAudioMsPerChar <= 0
  ) {
    return DEFAULT_ADAPTIVE_BUFFER_AHEAD
  }
  const normalizedRate = Math.max(0.7, Math.min(1.5, playbackRate))
  const playbackMsPerChar = timing.averageAudioMsPerChar / normalizedRate
  return Math.max(
    MIN_ADAPTIVE_BUFFER_AHEAD,
    Math.min(
      MAX_ADAPTIVE_BUFFER_AHEAD,
      Math.ceil(
        (timing.averageSynthesisMsPerChar * STARTUP_RUNWAY_MARGIN) /
          playbackMsPerChar,
      ),
    ),
  )
}
