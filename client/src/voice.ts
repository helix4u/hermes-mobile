import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createAsyncTaskLimiter,
  createPreparedSpeechInput,
  createPreparedSpeechStream,
  normalizeSpeechSynthesisConcurrency,
  streamedCompletionSuffix,
  type PreparedSpeechStream,
} from './incremental-speech'
import { markdownToSpeechText } from './markdown'
import type { GatewayEvent } from './protocol/types'
import {
  adaptiveSpeechBufferAhead,
  adaptiveSpeechChunkChars,
  adaptiveStartupSpeechChars,
  configuredSpeechTimingProvider,
  loadSpeechTimingStore,
  normalizeSpeechTimingProvider,
  recordSpeechAudioTiming,
  recordSpeechSynthesisTiming,
} from './speech-timing'
import type { HermesTransport } from './transport/hermes-transport'
import { HermesNative } from './transport/native-bridge'

export type VoicePhase =
  'idle' | 'recording' | 'transcribing' | 'synthesizing' | 'speaking'

export function canToggleVoiceRecording(
  phase: VoicePhase,
  activeSpeechId: string,
  playbackPaused = false,
): boolean {
  if (phase === 'idle' || phase === 'recording') return true
  if (phase === 'transcribing') return false
  return (
    activeSpeechId === 'reader' &&
    (playbackPaused || phase === 'speaking' || phase === 'synthesizing')
  )
}

export interface SpeechSequenceItem {
  id: string
  text: string
  ttsConfig?: Record<string, unknown>
  fallbackTtsConfigs?: Array<Record<string, unknown> | undefined>
}

export interface SpeechSequenceOptions {
  speechId?: string
  onActive?: (itemId: string | null) => void
  onPlaybackEnd?: (itemId: string) => void
  onPlaybackStart?: (itemId: string) => void
  bufferAhead?: number
  maxConcurrentSynthesis?: number
  priority?: number
  queueKey?: string
  replaceQueued?: boolean
}

export interface SpeechPreparationOptions extends SpeechSequenceOptions {
  beforePlayback?: Promise<void>
  maxSegmentChars?: number
  startPlayback?: boolean
}

export interface PreparedSpeechSequence {
  append(delta: string): void
  cancel(): void
  finish(completedText?: string): Promise<void>
}

export interface SpeechRenderOptions {
  bufferAhead?: number
  maxConcurrentSynthesis?: number
  onProgress?: (completed: number, total: number) => void
}

export interface BufferedSpeechQueueOptions<T> {
  bufferAhead?: number
  initialBufferAhead?: number
  bufferAheadFor?: (
    item: SpeechSequenceItem,
    value: T,
    index: number,
  ) => number
  maxConcurrentSynthesis?: number
  synthesize: (item: SpeechSequenceItem, index: number) => Promise<T>
  play: (item: SpeechSequenceItem, value: T, index: number) => Promise<void>
  isCurrent?: () => boolean
  onActive?: (itemId: string | null) => void
}

export interface SerialSpeechTaskQueue {
  clear: () => void
  enqueue: (
    task: () => Promise<void>,
    key?: string,
    priority?: number,
  ) => Promise<void>
  enqueueLatest: (
    key: string,
    task: () => Promise<void>,
    priority?: number,
  ) => Promise<void>
  releaseActive: (key: string) => boolean
}

interface CapturedAudio {
  dataUrl: string
  mimeType: string
}

interface BrowserRecording {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  mimeType: string
}

interface TranscriptionResponse {
  ok?: boolean
  transcript?: string
  provider?: string
}

interface SpeechResponse {
  ok?: boolean
  data_url?: string
  mime_type?: string
  provider?: string
}

interface AudioBufferShape {
  getChannelData(channel: number): Float32Array
  length: number
  numberOfChannels: number
  sampleRate: number
}

interface UseVoiceOptions {
  connectionId: string
  nativeClient: boolean
  getTransport: () => HermesTransport | null
  getDefaultTtsConfig?: () => Record<string, unknown> | undefined
  onTranscript: (text: string) => void
  onError: (message: string) => void
}

const MAX_RECORDING_MS = 120_000
export const MAX_SPEECH_CHUNK_CHARS = 1_800
export const DEFAULT_SPEECH_SEQUENCE_BUFFER_AHEAD = 3
export const MAX_SPEECH_SEQUENCE_BUFFER_AHEAD = 6
export const SPEECH_REQUEST_TIMEOUT_MS = 8 * 60 * 1_000

export interface SynthesizedSpeech {
  dataUrl: string
  provider: string
  requestedProvider: string
  elapsedMs: number
}

export function createSerialSpeechTaskQueue(): SerialSpeechTaskQueue {
  let epoch = 0
  interface QueueEntry {
    epoch: number
    key: string
    priority: number
    reject: (reason?: unknown) => void
    resolve: () => void
    sequence: number
    task: () => Promise<void>
  }
  let active: QueueEntry | null = null
  let pending: QueueEntry[] = []
  let sequence = 0

  const drain = () => {
    if (active) return
    const next = pending.shift()
    if (!next) return
    if (next.epoch !== epoch) {
      next.resolve()
      drain()
      return
    }
    active = next
    void Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        if (active !== next) return
        active = null
        drain()
      })
  }

  const enqueue = (task: () => Promise<void>, key = '', priority = 0) =>
    new Promise<void>((resolve, reject) => {
      pending.push({
        epoch,
        key,
        priority: Number.isFinite(priority) ? priority : 0,
        reject,
        resolve,
        sequence: ++sequence,
        task,
      })
      pending.sort(
        (left, right) =>
          right.priority - left.priority || left.sequence - right.sequence,
      )
      drain()
    })

  return {
    clear() {
      epoch += 1
      for (const entry of pending) entry.resolve()
      pending = []
      active = null
    },
    enqueue,
    enqueueLatest(key, task, priority = 0) {
      const retained: QueueEntry[] = []
      for (const entry of pending) {
        if (entry.key === key) entry.resolve()
        else retained.push(entry)
      }
      pending = retained
      return enqueue(task, key, priority)
    },
    releaseActive(key) {
      if (!active || active.key !== key) return false
      active = null
      return true
    },
  }
}

interface IncrementalSpeechSession {
  buffer: PreparedSpeechStream<SynthesizedSpeech>
  generation: number
  id: string
  playbackRate: number
  queued: boolean
  streamedText: string
}

export function normalizeSpeechSequenceBufferAhead(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_SPEECH_SEQUENCE_BUFFER_AHEAD
  return Math.max(
    0,
    Math.min(MAX_SPEECH_SEQUENCE_BUFFER_AHEAD, Math.round(numeric)),
  )
}

function configSignature(config: Record<string, unknown> | undefined): string {
  if (config === undefined) return '__host_default__'
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    )
  }
  return JSON.stringify(stable(config))
}

export function speechConfigAttempts(
  item: SpeechSequenceItem,
): Array<Record<string, unknown> | undefined> {
  const attempts = [item.ttsConfig, ...(item.fallbackTtsConfigs ?? [])]
  const unique: Array<Record<string, unknown> | undefined> = []
  const seen = new Set<string>()
  for (const attempt of attempts) {
    const signature = configSignature(attempt)
    if (seen.has(signature)) continue
    seen.add(signature)
    unique.push(attempt)
  }
  return unique.length ? unique : [undefined]
}

export function speechPlaybackRate(item: SpeechSequenceItem): number {
  const configured = Number(item.ttsConfig?.speed)
  if (!Number.isFinite(configured)) return 1
  return Math.max(0.7, Math.min(1.5, configured))
}

function withoutClientSpeechControls(
  config: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!config) return config
  const {
    speed: _speed,
    synthesis_concurrency: _synthesisConcurrency,
    ...synthesisConfig
  } = config
  return Object.keys(synthesisConfig).length ? synthesisConfig : undefined
}

export function speechItemForInteractivePlayback(
  item: SpeechSequenceItem,
): SpeechSequenceItem {
  return {
    ...item,
    ttsConfig: withoutClientSpeechControls(item.ttsConfig),
    fallbackTtsConfigs: item.fallbackTtsConfigs?.map(
      withoutClientSpeechControls,
    ),
  }
}

export function applySpeechPlaybackRate(
  audio: Pick<
    HTMLAudioElement,
    'defaultPlaybackRate' | 'playbackRate' | 'preservesPitch'
  >,
  rate: number,
): void {
  const normalized = Math.max(0.7, Math.min(1.5, rate))
  audio.defaultPlaybackRate = normalized
  audio.playbackRate = normalized
  audio.preservesPitch = true
}

interface PlaybackRateAudio
  extends Pick<
    HTMLAudioElement,
    | 'addEventListener'
    | 'defaultPlaybackRate'
    | 'playbackRate'
    | 'preservesPitch'
    | 'removeEventListener'
  > {}

export function maintainSpeechPlaybackRate(
  audio: PlaybackRateAudio,
  rate: number,
): () => void {
  const normalized = Math.max(0.7, Math.min(1.5, rate))
  let applying = false
  const apply = () => {
    if (applying) return
    applying = true
    try {
      if (Math.abs(audio.defaultPlaybackRate - normalized) > 0.001) {
        audio.defaultPlaybackRate = normalized
      }
      if (Math.abs(audio.playbackRate - normalized) > 0.001) {
        audio.playbackRate = normalized
      }
      if (!audio.preservesPitch) audio.preservesPitch = true
    } finally {
      applying = false
    }
  }
  const events = [
    'loadedmetadata',
    'loadeddata',
    'durationchange',
    'canplay',
    'canplaythrough',
    'playing',
    'ratechange',
    'timeupdate',
  ]
  apply()
  for (const event of events) audio.addEventListener(event, apply)
  const watchdog = globalThis.setInterval(apply, 250)
  return () => {
    globalThis.clearInterval(watchdog)
    for (const event of events) audio.removeEventListener(event, apply)
  }
}

interface PreparedSpeech<T> {
  value?: T
  error?: unknown
}

export async function runBufferedSpeechQueue<T>(
  items: SpeechSequenceItem[],
  options: BufferedSpeechQueueOptions<T>,
): Promise<boolean> {
  if (!items.length) return false
  const bufferAhead = normalizeSpeechSequenceBufferAhead(
    options.bufferAhead ?? 0,
  )
  const initialBufferAhead = normalizeSpeechSequenceBufferAhead(
    options.initialBufferAhead ?? bufferAhead,
  )
  const prepared = new Map<number, Promise<PreparedSpeech<T>>>()
  const isCurrent = options.isCurrent ?? (() => true)
  const limiter = createAsyncTaskLimiter(
    normalizeSpeechSynthesisConcurrency(options.maxConcurrentSynthesis),
  )

  const prepare = (index: number) => {
    if (index >= items.length || prepared.has(index)) return
    prepared.set(
      index,
      limiter
        .run(() => {
          if (!isCurrent()) throw new Error('Speech playback stopped')
          return options.synthesize(items[index], index)
        })
        .then(value => ({ value }))
        .catch(error => ({ error })),
    )
  }

  const fillBuffer = (activeIndex: number, ahead: number) => {
    for (let offset = 0; offset <= ahead; offset += 1) {
      prepare(activeIndex + offset)
    }
  }
  const fillFuture = (activeIndex: number, ahead: number) => {
    for (let offset = 1; offset <= ahead; offset += 1) {
      prepare(activeIndex + offset)
    }
  }

  fillBuffer(0, initialBufferAhead)
  try {
    for (let index = 0; index < items.length; index += 1) {
      if (!isCurrent()) return false
      fillBuffer(index, options.bufferAheadFor ? 0 : bufferAhead)
      options.onActive?.(items[index].id)
      let result = await prepared.get(index)!
      prepared.delete(index)
      if (!isCurrent()) return false
      if (result.error !== undefined) {
        try {
          result = { value: await options.synthesize(items[index], index) }
        } catch (error) {
          result = { error }
        }
      }
      if (result.error !== undefined) throw result.error
      fillFuture(
        index,
        options.bufferAheadFor
          ? normalizeSpeechSequenceBufferAhead(
              options.bufferAheadFor(
                items[index],
                result.value as T,
                index,
              ),
            )
          : bufferAhead,
      )
      await options.play(items[index], result.value as T, index)
    }
    return isCurrent()
  } finally {
    options.onActive?.(null)
  }
}

export function expandSpeechSequence(
  items: SpeechSequenceItem[],
  firstChunkChars?: number,
  laterChunkChars?: number,
): SpeechSequenceItem[] {
  return items.flatMap((item, itemIndex) =>
    (
      itemIndex === 0 && firstChunkChars !== undefined
        ? splitSpeechTextForStartup(
            item.text,
            firstChunkChars,
            laterChunkChars,
          )
        : splitSpeechText(item.text)
    ).map((text, chunkIndex) => ({
      ...item,
      id: item.id || `speech-${chunkIndex}`,
      text,
    })),
  )
}

export function audioBufferToMonoPcm16(
  buffer: AudioBufferShape,
  targetSampleRate = 24_000,
): Int16Array {
  const sourceLength = Math.max(0, buffer.length)
  if (!sourceLength || !buffer.numberOfChannels) return new Int16Array()
  const outputLength = Math.max(
    1,
    Math.round((sourceLength * targetSampleRate) / buffer.sampleRate),
  )
  const output = new Int16Array(outputLength)
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  )

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = (index * buffer.sampleRate) / targetSampleRate
    const left = Math.min(sourceLength - 1, Math.floor(sourcePosition))
    const right = Math.min(sourceLength - 1, left + 1)
    const mix = sourcePosition - left
    let sample = 0
    for (const channel of channels) {
      sample += channel[left] + (channel[right] - channel[left]) * mix
    }
    sample = Math.max(-1, Math.min(1, sample / channels.length))
    output[index] =
      sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
  }
  return output
}

export function encodePcm16Wav(
  chunks: Int16Array[],
  sampleRate = 24_000,
): ArrayBuffer {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, sampleCount * 2, true)
  let offset = 44
  for (const chunk of chunks) {
    for (const sample of chunk) {
      view.setInt16(offset, sample, true)
      offset += 2
    }
  }
  return buffer
}

export async function synthesizeSpeechItemWithTiming(
  transport: HermesTransport,
  item: SpeechSequenceItem,
): Promise<SynthesizedSpeech> {
  let lastError: unknown
  for (const config of speechConfigAttempts(item)) {
    const startedAt = Date.now()
    try {
      const result = await transport.requestJson<SpeechResponse>(
        '/api/audio/speak',
        {
          text: item.text,
          ...(config ? { tts_config: config } : {}),
        },
        { timeoutMs: SPEECH_REQUEST_TIMEOUT_MS },
      )
      if (!result.data_url) throw new Error('Hermes returned no speech audio')
      const requestedProvider = configuredSpeechTimingProvider(config)
      return {
        dataUrl: result.data_url,
        provider: normalizeSpeechTimingProvider(
          result.provider || requestedProvider,
        ),
        requestedProvider,
        elapsedMs: Math.max(1, Date.now() - startedAt),
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('Every configured Hermes speech voice failed')
}

export async function synthesizeSpeechItem(
  transport: HermesTransport,
  item: SpeechSequenceItem,
): Promise<string> {
  return (await synthesizeSpeechItemWithTiming(transport, item)).dataUrl
}

export async function renderSpeechSequenceToWav(
  transport: HermesTransport,
  items: SpeechSequenceItem[],
  options: SpeechRenderOptions = {},
): Promise<Blob> {
  const queue = expandSpeechSequence(items)
  if (!queue.length) throw new Error('There is no speech to render')
  const AudioContextConstructor =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext
      }
    ).webkitAudioContext
  if (!AudioContextConstructor) {
    throw new Error('This device cannot decode speech audio for export')
  }
  const audioContext = new AudioContextConstructor()
  const pcmChunks: Int16Array[] = []
  let completed = 0
  try {
    await runBufferedSpeechQueue(queue, {
      bufferAhead: options.bufferAhead,
      maxConcurrentSynthesis: options.maxConcurrentSynthesis,
      synthesize: item => synthesizeSpeechItem(transport, item),
      play: async (_item, dataUrl) => {
        const response = await fetch(dataUrl)
        const decoded = await audioContext.decodeAudioData(
          await response.arrayBuffer(),
        )
        pcmChunks.push(audioBufferToMonoPcm16(decoded))
        completed += 1
        options.onProgress?.(completed, queue.length)
      },
    })
  } finally {
    await audioContext.close()
  }
  return new Blob([encodePcm16Wav(pcmChunks)], { type: 'audio/wav' })
}

function appendSpeechPiece(
  chunks: string[],
  piece: string,
  maxChars: number,
): void {
  let remaining = piece.trim()
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(' ', maxChars)
    if (splitAt < Math.floor(maxChars * 0.55)) splitAt = maxChars
    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) chunks.push(remaining)
}

export function splitSpeechText(
  text: string,
  maxChars = MAX_SPEECH_CHUNK_CHARS,
): string[] {
  const cleanText = text.trim()
  if (!cleanText) return []
  const safeCap = Math.max(160, Math.floor(maxChars))
  if (cleanText.length <= safeCap) return [cleanText]

  const pieces = cleanText.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gs) ?? [cleanText]
  const chunks: string[] = []
  let buffer = ''

  for (const rawPiece of pieces) {
    const piece = rawPiece.trim()
    if (!piece) continue
    if (piece.length > safeCap) {
      if (buffer) {
        chunks.push(buffer)
        buffer = ''
      }
      appendSpeechPiece(chunks, piece, safeCap)
      continue
    }
    const candidate = buffer ? `${buffer} ${piece}` : piece
    if (candidate.length > safeCap) {
      chunks.push(buffer)
      buffer = piece
    } else {
      buffer = candidate
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks
}

export function splitSpeechTextForStartup(
  text: string,
  firstMaxChars: number,
  laterMaxChars = MAX_SPEECH_CHUNK_CHARS,
): string[] {
  const cleanText = text.trim()
  if (!cleanText) return []
  const safeFirstCap = Math.max(160, Math.floor(firstMaxChars))
  if (cleanText.length <= safeFirstCap) return [cleanText]

  const minimumBoundary = Math.floor(safeFirstCap * 0.72)
  let splitAt = -1
  for (let index = safeFirstCap; index >= minimumBoundary; index -= 1) {
    const character = cleanText[index - 1]
    if (
      '.!?…'.includes(character) &&
      (index >= cleanText.length || /\s/.test(cleanText[index]))
    ) {
      splitAt = index
      break
    }
  }
  if (splitAt < 0) {
    splitAt = cleanText.lastIndexOf(' ', safeFirstCap)
  }
  if (splitAt < minimumBoundary) splitAt = safeFirstCap

  const first = cleanText.slice(0, splitAt).trim()
  const remaining = cleanText.slice(splitAt).trim()
  return remaining
    ? [first, ...splitSpeechText(remaining, laterMaxChars)]
    : [first]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map(part => {
      if (typeof part === 'string') return part
      const row = asRecord(part)
      return typeof row.text === 'string' ? row.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function completedAssistantText(event: GatewayEvent): string {
  if (event.type !== 'message.complete') return ''
  const payload = asRecord(event.payload)
  return contentText(payload.text ?? payload.content).trim()
}

export function assistantDeltaText(event: GatewayEvent): string {
  if (event.type !== 'message.delta') return ''
  const payload = asRecord(event.payload)
  return contentText(payload.text ?? payload.content)
}

export function voicePreferenceKey(connectionId: string): string {
  return `hermes-mobile.voice.${connectionId}.auto-speak`
}

export function loadAutoSpeak(connectionId: string): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.localStorage.getItem(voicePreferenceKey(connectionId)) === 'true'
  )
}

export function persistAutoSpeak(connectionId: string, enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(voicePreferenceKey(connectionId), String(enabled))
}

function preferredRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const mimeType of [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType
  }
  return ''
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error('Could not read the voice recording'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  })
}

function stopBrowserTracks(recording: BrowserRecording | null): void {
  for (const track of recording?.stream.getTracks() ?? []) track.stop()
}

export function useVoice({
  connectionId,
  getDefaultTtsConfig,
  getTransport,
  nativeClient,
  onError,
  onTranscript,
}: UseVoiceOptions) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [activeSpeechId, setActiveSpeechId] = useState('')
  const [playbackPaused, setPlaybackPaused] = useState(false)
  const activeSpeechIdRef = useRef('')
  const playbackPausedRef = useRef(false)
  const browserRecordingRef = useRef<BrowserRecording | null>(null)
  const recordingTimerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const finishAudioRef = useRef<(() => void) | null>(null)
  const beginAudioPlaybackRef = useRef<(() => void) | null>(null)
  const speechGenerationRef = useRef(0)
  const latestSpeechPreparationRef = useRef(0)
  const speechTaskQueueRef = useRef<SerialSpeechTaskQueue | null>(null)
  const incrementalSpeechRef = useRef<IncrementalSpeechSession | null>(null)
  const incrementalSpeechBuffersRef = useRef(
    new Set<PreparedSpeechStream<SynthesizedSpeech>>(),
  )
  const mountedRef = useRef(true)
  const stopAndTranscribeRef = useRef<() => Promise<void>>(async () => {})
  if (!speechTaskQueueRef.current) {
    speechTaskQueueRef.current = createSerialSpeechTaskQueue()
  }

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }, [])

  const updateActiveSpeechId = useCallback((value: string) => {
    activeSpeechIdRef.current = value
    setActiveSpeechId(value)
  }, [])

  const updatePlaybackPaused = useCallback((value: boolean) => {
    playbackPausedRef.current = value
    setPlaybackPaused(value)
  }, [])

  const interruptCurrentSpeech = useCallback(() => {
    speechGenerationRef.current += 1
    beginAudioPlaybackRef.current = null
    const finishAudio = finishAudioRef.current
    finishAudioRef.current = null
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    finishAudio?.()
    updatePlaybackPaused(false)
    updateActiveSpeechId('')
    setPhase(current =>
      current === 'speaking' || current === 'synthesizing' ? 'idle' : current,
    )
  }, [updateActiveSpeechId, updatePlaybackPaused])

  const stopPlayback = useCallback(() => {
    latestSpeechPreparationRef.current += 1
    for (const buffer of incrementalSpeechBuffersRef.current) buffer.cancel()
    incrementalSpeechBuffersRef.current.clear()
    incrementalSpeechRef.current = null
    speechTaskQueueRef.current?.clear()
    interruptCurrentSpeech()
  }, [interruptCurrentSpeech])

  const pausePlayback = useCallback(() => {
    if (!activeSpeechIdRef.current) return
    updatePlaybackPaused(true)
    audioRef.current?.pause()
  }, [updatePlaybackPaused])

  const resumePlayback = useCallback(() => {
    if (!activeSpeechIdRef.current) return
    updatePlaybackPaused(false)
    beginAudioPlaybackRef.current?.()
  }, [updatePlaybackPaused])

  const startRecording = useCallback(async () => {
    if (activeSpeechIdRef.current === 'reader') pausePlayback()
    else stopPlayback()
    onError('')
    try {
      if (nativeClient) {
        await HermesNative.startRecording()
      } else {
        if (
          typeof MediaRecorder === 'undefined' ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw new Error(
            'Microphone recording is not supported in this browser',
          )
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        const mimeType = preferredRecordingMimeType()
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        )
        const recording: BrowserRecording = {
          recorder,
          stream,
          chunks: [],
          mimeType: recorder.mimeType || mimeType || 'audio/webm',
        }
        recorder.addEventListener('dataavailable', event => {
          if (event.data.size > 0) recording.chunks.push(event.data)
        })
        recorder.start()
        browserRecordingRef.current = recording
      }
      if (!mountedRef.current) return
      setPhase('recording')
      clearRecordingTimer()
      recordingTimerRef.current = window.setTimeout(
        () => void stopAndTranscribeRef.current(),
        MAX_RECORDING_MS,
      )
    } catch (error) {
      stopBrowserTracks(browserRecordingRef.current)
      browserRecordingRef.current = null
      setPhase(
        activeSpeechIdRef.current === 'reader' && playbackPausedRef.current
          ? 'speaking'
          : 'idle',
      )
      onError(error instanceof Error ? error.message : String(error))
    }
  }, [
    clearRecordingTimer,
    nativeClient,
    onError,
    pausePlayback,
    stopPlayback,
  ])

  const captureBrowserRecording =
    useCallback(async (): Promise<CapturedAudio> => {
      const recording = browserRecordingRef.current
      if (!recording) throw new Error('No voice recording is active')
      browserRecordingRef.current = null

      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          recording.recorder.addEventListener(
            'stop',
            () =>
              resolve(new Blob(recording.chunks, { type: recording.mimeType })),
            { once: true },
          )
          recording.recorder.addEventListener(
            'error',
            () => reject(new Error('The browser could not finish recording')),
            { once: true },
          )
          recording.recorder.stop()
        })
        if (blob.size === 0) throw new Error('The voice recording is empty')
        return {
          dataUrl: await blobToDataUrl(blob),
          mimeType: blob.type || recording.mimeType,
        }
      } finally {
        stopBrowserTracks(recording)
      }
    }, [])

  const stopAndTranscribe = useCallback(async () => {
    if (phase !== 'recording') return
    clearRecordingTimer()
    setPhase('transcribing')
    onError('')
    try {
      const capture = nativeClient
        ? await HermesNative.stopRecording()
        : await captureBrowserRecording()
      const transport = getTransport()
      if (!transport) throw new Error('Connect to Hermes before transcribing')
      const result = await transport.requestJson<TranscriptionResponse>(
        '/api/audio/transcribe',
        {
          data_url: capture.dataUrl,
          mime_type: capture.mimeType,
        },
      )
      const text = String(result.transcript ?? '').trim()
      if (!text) throw new Error('Hermes did not detect any speech')
      if (mountedRef.current) onTranscript(text)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      if (mountedRef.current) {
        setPhase(
          activeSpeechIdRef.current === 'reader' && playbackPausedRef.current
            ? 'speaking'
            : 'idle',
        )
      }
    }
  }, [
    captureBrowserRecording,
    clearRecordingTimer,
    getTransport,
    nativeClient,
    onError,
    onTranscript,
    phase,
  ])
  stopAndTranscribeRef.current = stopAndTranscribe

  const playAudio = useCallback(
    async (
      dataUrl: string,
      generation: number,
      playbackRate = 1,
      onDuration?: (durationMs: number) => void,
      onPlaybackStart?: () => void,
      onPlaybackEnd?: () => void,
    ): Promise<void> => {
      if (generation !== speechGenerationRef.current) return
      const audio = new Audio(dataUrl)
      const releasePlaybackRate = maintainSpeechPlaybackRate(audio, playbackRate)
      audioRef.current = audio
      await new Promise<void>((resolve, reject) => {
        let settled = false
        let started = false
        let durationRecorded = false
        const recordDuration = () => {
          if (
            durationRecorded ||
            !Number.isFinite(audio.duration) ||
            audio.duration <= 0
          ) {
            return
          }
          durationRecorded = true
          onDuration?.(audio.duration * 1_000)
        }
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          if (finishAudioRef.current === finish) {
            finishAudioRef.current = null
          }
          if (beginAudioPlaybackRef.current === beginPlayback) {
            beginAudioPlaybackRef.current = null
          }
          audio.removeEventListener('ended', onEnded)
          audio.removeEventListener('error', onAudioError)
          audio.removeEventListener('loadedmetadata', recordDuration)
          audio.removeEventListener('durationchange', recordDuration)
          audio.removeEventListener('canplay', recordDuration)
          releasePlaybackRate()
          if (audioRef.current === audio) audioRef.current = null
          if (started) onPlaybackEnd?.()
          if (error) reject(error)
          else resolve()
        }
        const onEnded = () => finish()
        const onAudioError = () =>
          finish(new Error('The device could not play Hermes speech audio'))
        const beginPlayback = () => {
          if (
            settled ||
            playbackPausedRef.current ||
            generation !== speechGenerationRef.current
          ) {
            return
          }
          void audio
            .play()
            .then(() => {
              applySpeechPlaybackRate(audio, playbackRate)
              if (generation === speechGenerationRef.current) {
                started = true
                setPhase('speaking')
                onPlaybackStart?.()
              }
            })
            .catch(() =>
              finish(new Error('The device could not play Hermes speech audio')),
            )
        }
        finishAudioRef.current = finish
        beginAudioPlaybackRef.current = beginPlayback
        audio.addEventListener('ended', onEnded, { once: true })
        audio.addEventListener('error', onAudioError, { once: true })
        audio.addEventListener('loadedmetadata', recordDuration)
        audio.addEventListener('durationchange', recordDuration)
        audio.addEventListener('canplay', recordDuration)
        recordDuration()
        beginPlayback()
      })
    },
    [],
  )

  const queueIncrementalSpeechPlayback = useCallback(
    (
      session: IncrementalSpeechSession,
      beforePlayback?: Promise<void>,
    ) => {
      if (session.queued) return
      session.queued = true
      void Promise.resolve(beforePlayback)
        .catch(() => undefined)
        .then(async () => {
          if (session.generation !== speechGenerationRef.current) {
            session.buffer.cancel()
            incrementalSpeechBuffersRef.current.delete(session.buffer)
            return
          }
          await speechTaskQueueRef.current!.enqueue(
            async () => {
              const { buffer, generation, id, playbackRate } = session
              if (generation !== speechGenerationRef.current) return
              updatePlaybackPaused(false)
              updateActiveSpeechId(id)
              setPhase('synthesizing')
              try {
                for (;;) {
                  const prepared = await buffer.next()
                  if (!prepared || generation !== speechGenerationRef.current) {
                    break
                  }
                  await playAudio(
                    prepared.value.dataUrl,
                    generation,
                    playbackRate,
                    durationMs => {
                      for (const provider of new Set([
                        prepared.value.provider,
                        prepared.value.requestedProvider,
                      ])) {
                        recordSpeechAudioTiming(
                          connectionId,
                          provider,
                          durationMs,
                          prepared.text.length,
                        )
                      }
                    },
                  )
                  if (generation === speechGenerationRef.current) {
                    setPhase('synthesizing')
                  }
                }
                if (generation === speechGenerationRef.current) {
                  updateActiveSpeechId('')
                  setPhase('idle')
                }
              } catch (error) {
                if (generation === speechGenerationRef.current) {
                  updateActiveSpeechId('')
                  setPhase('idle')
                  onError(error instanceof Error ? error.message : String(error))
                }
              } finally {
                incrementalSpeechBuffersRef.current.delete(buffer)
              }
            },
            session.id,
            -10,
          )
        })
        .catch(error =>
          onError(error instanceof Error ? error.message : String(error)),
        )
    },
    [
      connectionId,
      onError,
      playAudio,
      updateActiveSpeechId,
      updatePlaybackPaused,
    ],
  )

  const appendIncrementalSpeech = useCallback(
    (
      delta: string,
      speechId = 'auto-response',
      ttsConfig?: Record<string, unknown>,
    ) => {
      if (!delta) return
      let session = incrementalSpeechRef.current
      if (session && session.id !== speechId) {
        session.buffer.finish()
        queueIncrementalSpeechPlayback(session)
        incrementalSpeechRef.current = null
        session = null
      }
      if (!session) {
        const transport = getTransport()
        if (!transport) return
        const primaryConfig = ttsConfig ?? getDefaultTtsConfig?.()
        const playbackRate = speechPlaybackRate({
          id: speechId,
          text: '',
          ttsConfig: primaryConfig,
        })
        const requestedProvider = configuredSpeechTimingProvider(primaryConfig)
        const timingStore = loadSpeechTimingStore(connectionId)
        const startupChars = adaptiveStartupSpeechChars(
          timingStore,
          requestedProvider,
          playbackRate,
        )
        const segmentChars = adaptiveSpeechChunkChars(
          timingStore,
          requestedProvider,
          playbackRate,
          startupChars,
        )
        const requestedConcurrency = primaryConfig?.synthesis_concurrency
        const concurrency =
          requestedConcurrency === undefined
            ? Math.min(
                2,
                adaptiveSpeechBufferAhead(
                  timingStore,
                  requestedProvider,
                  playbackRate,
                ),
              )
            : normalizeSpeechSynthesisConcurrency(requestedConcurrency)
        const buffer = createPreparedSpeechStream<SynthesizedSpeech>({
          concurrency,
          maxSegmentChars: segmentChars,
          synthesize: async text => {
            const item: SpeechSequenceItem = {
              id: speechId,
              text,
              ttsConfig: primaryConfig,
              fallbackTtsConfigs: primaryConfig ? [undefined] : [],
            }
            const speech = await synthesizeSpeechItemWithTiming(
              transport,
              speechItemForInteractivePlayback(item),
            )
            for (const provider of new Set([
              speech.provider,
              speech.requestedProvider,
            ])) {
              recordSpeechSynthesisTiming(
                connectionId,
                provider,
                speech.elapsedMs,
                text.length,
              )
            }
            return speech
          },
          transform: markdownToSpeechText,
        })
        incrementalSpeechBuffersRef.current.add(buffer)
        session = {
          buffer,
          generation: speechGenerationRef.current,
          id: speechId,
          playbackRate,
          queued: false,
          streamedText: '',
        }
        incrementalSpeechRef.current = session
      }
      session.streamedText += delta
      session.buffer.append(delta)
    },
    [
      connectionId,
      getDefaultTtsConfig,
      getTransport,
      queueIncrementalSpeechPlayback,
    ],
  )

  const finishIncrementalSpeech = useCallback(
    (
      completedText = '',
      speechId = 'auto-response',
      ttsConfig?: Record<string, unknown>,
      beforePlayback?: Promise<void>,
    ) => {
      let session = incrementalSpeechRef.current
      if (!session || session.id !== speechId) {
        if (!completedText) return
        appendIncrementalSpeech(completedText, speechId, ttsConfig)
        session = incrementalSpeechRef.current
      } else {
        const suffix = streamedCompletionSuffix(
          session.streamedText,
          completedText,
        )
        if (suffix) {
          session.streamedText += suffix
          session.buffer.append(suffix)
        }
      }
      session?.buffer.finish()
      if (session) queueIncrementalSpeechPlayback(session, beforePlayback)
      if (incrementalSpeechRef.current === session) {
        incrementalSpeechRef.current = null
      }
    },
    [appendIncrementalSpeech, queueIncrementalSpeechPlayback],
  )

  const speakSequence = useCallback(
    async (
      items: SpeechSequenceItem[],
      options: SpeechSequenceOptions = {},
    ) => {
      const adaptiveBuffering = options.bufferAhead === undefined
      const requestedFirstProvider = configuredSpeechTimingProvider(
        items[0]?.ttsConfig,
      )
      const requestedPlaybackRate = speechPlaybackRate(items[0])
      const timingStore = loadSpeechTimingStore(connectionId)
      const startupChars = adaptiveBuffering
        ? adaptiveStartupSpeechChars(
            timingStore,
            requestedFirstProvider,
            requestedPlaybackRate,
          )
        : undefined
      const queue = expandSpeechSequence(
        items,
        startupChars,
        adaptiveBuffering && startupChars !== undefined
          ? adaptiveSpeechChunkChars(
              timingStore,
              requestedFirstProvider,
              requestedPlaybackRate,
              startupChars,
            )
          : undefined,
      )
      if (!queue.length) return
      const task = async () => {
        onError('')
        const generation = speechGenerationRef.current
        updatePlaybackPaused(false)
        updateActiveSpeechId(options.speechId || queue[0].id)
        setPhase('synthesizing')
        try {
          const transport = getTransport()
          if (!transport)
            throw new Error('Connect to Hermes before using speech')
          const completed = await runBufferedSpeechQueue<SynthesizedSpeech>(
            queue,
            {
              bufferAhead: adaptiveBuffering
                ? 0
                : normalizeSpeechSequenceBufferAhead(options.bufferAhead),
              initialBufferAhead: adaptiveBuffering ? 1 : undefined,
              maxConcurrentSynthesis: options.maxConcurrentSynthesis,
              bufferAheadFor: adaptiveBuffering
                ? (item, speech) =>
                    adaptiveSpeechBufferAhead(
                      loadSpeechTimingStore(connectionId),
                      speech.provider,
                      speechPlaybackRate(item),
                    )
                : undefined,
              isCurrent: () => generation === speechGenerationRef.current,
              onActive: itemId => {
                options.onActive?.(itemId)
                if (itemId) setPhase('synthesizing')
              },
              synthesize: async item => {
                if (generation !== speechGenerationRef.current) {
                  throw new Error('Speech playback stopped')
                }
                const speech = await synthesizeSpeechItemWithTiming(
                  transport,
                  speechItemForInteractivePlayback(item),
                )
                for (const provider of new Set([
                  speech.provider,
                  speech.requestedProvider,
                ])) {
                  recordSpeechSynthesisTiming(
                    connectionId,
                    provider,
                    speech.elapsedMs,
                    item.text.length,
                  )
                }
                return speech
              },
              play: async (item, speech) => {
                await playAudio(
                  speech.dataUrl,
                  generation,
                  speechPlaybackRate(item),
                  durationMs => {
                    for (const provider of new Set([
                      speech.provider,
                      speech.requestedProvider,
                    ])) {
                      recordSpeechAudioTiming(
                        connectionId,
                        provider,
                        durationMs,
                        item.text.length,
                      )
                    }
                  },
                  () => options.onPlaybackStart?.(item.id),
                  () => options.onPlaybackEnd?.(item.id),
                )
              },
            },
          )
          if (!completed || generation !== speechGenerationRef.current) return
          updateActiveSpeechId('')
          setPhase('idle')
        } catch (error) {
          if (generation !== speechGenerationRef.current) return
          options.onActive?.(null)
          finishAudioRef.current = null
          beginAudioPlaybackRef.current = null
          audioRef.current = null
          updatePlaybackPaused(false)
          updateActiveSpeechId('')
          setPhase('idle')
          onError(error instanceof Error ? error.message : String(error))
        }
      }
      const queueKey = options.queueKey?.trim() || ''
      await (options.replaceQueued && queueKey
        ? speechTaskQueueRef.current!.enqueueLatest(
            queueKey,
            task,
            options.priority,
          )
        : speechTaskQueueRef.current!.enqueue(
            task,
            queueKey,
            options.priority,
          ))
    },
    [
      connectionId,
      getTransport,
      onError,
      playAudio,
      updateActiveSpeechId,
      updatePlaybackPaused,
    ],
  )

  const speak = useCallback(
    async (
      text: string,
      speechId = '',
      ttsConfig?: Record<string, unknown>,
    ) => {
      const primaryConfig = ttsConfig ?? getDefaultTtsConfig?.()
      await speakSequence(
        [
          {
            id: speechId || 'speech',
            text,
            ttsConfig: primaryConfig,
            fallbackTtsConfigs: primaryConfig ? [undefined] : [],
          },
        ],
        { speechId },
      )
    },
    [getDefaultTtsConfig, speakSequence],
  )

  const prepareSpeechSequence = useCallback(
    (
      speechId: string,
      ttsConfig?: Record<string, unknown>,
      options: SpeechPreparationOptions = {},
    ): PreparedSpeechSequence | null => {
      const transport = getTransport()
      if (!transport) return null
      const generation = speechGenerationRef.current
      const playbackRate = speechPlaybackRate({
        id: speechId,
        text: '',
        ttsConfig,
      })
      const requestedProvider = configuredSpeechTimingProvider(ttsConfig)
      const timingStore = loadSpeechTimingStore(connectionId)
      const startupChars = adaptiveStartupSpeechChars(
        timingStore,
        requestedProvider,
        playbackRate,
      )
      const adaptiveChars = adaptiveSpeechChunkChars(
        timingStore,
        requestedProvider,
        playbackRate,
        startupChars,
      )
      const maxSegmentChars = Math.max(
        240,
        Math.min(
          adaptiveChars,
          Number.isFinite(options.maxSegmentChars)
            ? Number(options.maxSegmentChars)
            : adaptiveChars,
        ),
      )
      const concurrency = normalizeSpeechSynthesisConcurrency(
        options.maxConcurrentSynthesis ??
          Math.min(
            2,
            adaptiveSpeechBufferAhead(
              timingStore,
              requestedProvider,
              playbackRate,
            ),
          ),
      )
      const buffer = createPreparedSpeechStream<SynthesizedSpeech>({
        concurrency,
        maxSegmentChars,
        synthesize: async text => {
          const item: SpeechSequenceItem = {
            id: speechId,
            text,
            ttsConfig,
            fallbackTtsConfigs: ttsConfig ? [undefined] : [],
          }
          const speech = await synthesizeSpeechItemWithTiming(
            transport,
            speechItemForInteractivePlayback(item),
          )
          for (const provider of new Set([
            speech.provider,
            speech.requestedProvider,
          ])) {
            recordSpeechSynthesisTiming(
              connectionId,
              provider,
              speech.elapsedMs,
              text.length,
            )
          }
          return speech
        },
        transform: markdownToSpeechText,
      })
      incrementalSpeechBuffersRef.current.add(buffer)
      const input = createPreparedSpeechInput(buffer)
      let cancelled = false
      let completion: Promise<void> | null = null

      const cleanup = () => {
        incrementalSpeechBuffersRef.current.delete(buffer)
        options.onActive?.(null)
      }

      const ensurePlayback = (): Promise<void> => {
        if (completion) return completion
        completion = Promise.resolve(options.beforePlayback)
          .catch(() => undefined)
          .then(async () => {
            if (generation !== speechGenerationRef.current || cancelled) {
              buffer.cancel()
              return
            }
            await speechTaskQueueRef.current!.enqueue(
              async () => {
                if (generation !== speechGenerationRef.current || cancelled) {
                  return
                }
                updatePlaybackPaused(false)
                updateActiveSpeechId(options.speechId || speechId)
                setPhase('synthesizing')
                try {
                  for (;;) {
                    const prepared = await buffer.next()
                    if (
                      !prepared ||
                      cancelled ||
                      generation !== speechGenerationRef.current
                    ) {
                      break
                    }
                    options.onActive?.(speechId)
                    await playAudio(
                      prepared.value.dataUrl,
                      generation,
                      playbackRate,
                      durationMs => {
                        for (const provider of new Set([
                          prepared.value.provider,
                          prepared.value.requestedProvider,
                        ])) {
                          recordSpeechAudioTiming(
                            connectionId,
                            provider,
                            durationMs,
                            prepared.text.length,
                          )
                        }
                      },
                      () => options.onPlaybackStart?.(speechId),
                      () => options.onPlaybackEnd?.(speechId),
                    )
                    if (generation === speechGenerationRef.current) {
                      setPhase('synthesizing')
                    }
                  }
                  if (generation === speechGenerationRef.current) {
                    updateActiveSpeechId('')
                    setPhase('idle')
                  }
                } catch (error) {
                  if (generation === speechGenerationRef.current) {
                    updateActiveSpeechId('')
                    setPhase('idle')
                    onError(
                      error instanceof Error ? error.message : String(error),
                    )
                  }
                }
              },
              options.queueKey || speechId,
              options.priority ?? 0,
            )
          })
          .finally(cleanup)
        return completion
      }

      if (options.startPlayback) void ensurePlayback()

      return {
        append(delta: string) {
          if (cancelled) return
          input.append(delta)
        },
        cancel() {
          if (cancelled) return
          cancelled = true
          input.cancel()
          cleanup()
        },
        finish(completedText = '') {
          if (cancelled) return completion ?? Promise.resolve()
          // Playback may already be consuming the stream. Finalization must
          // still close its input so buffer.next() can settle after the last
          // prepared segment instead of waiting forever.
          input.finish(completedText)
          return ensurePlayback()
        },
      }
    },
    [
      connectionId,
      getTransport,
      onError,
      playAudio,
      updateActiveSpeechId,
      updatePlaybackPaused,
    ],
  )

  const speakLatest = useCallback(
    async (
      text: string,
      speechId: string,
      ttsConfig?: Record<string, unknown>,
    ) => {
      const queueKey = speechId.trim() || 'speech-latest'
      const preparation = ++latestSpeechPreparationRef.current
      const primaryConfig = ttsConfig ?? getDefaultTtsConfig?.()
      const item: SpeechSequenceItem = {
        id: queueKey,
        text,
        ttsConfig: primaryConfig,
        fallbackTtsConfigs: primaryConfig ? [undefined] : [],
      }
      onError('')
      const transport = getTransport()
      if (!transport) {
        if (preparation === latestSpeechPreparationRef.current) {
          onError('Connect to Hermes before using speech')
        }
        return
      }
      let speech: SynthesizedSpeech
      try {
        speech = await synthesizeSpeechItemWithTiming(
          transport,
          speechItemForInteractivePlayback(item),
        )
      } catch (error) {
        if (preparation === latestSpeechPreparationRef.current) {
          onError(error instanceof Error ? error.message : String(error))
        }
        return
      }
      for (const provider of new Set([
        speech.provider,
        speech.requestedProvider,
      ])) {
        recordSpeechSynthesisTiming(
          connectionId,
          provider,
          speech.elapsedMs,
          item.text.length,
        )
      }
      if (preparation !== latestSpeechPreparationRef.current) return

      const task = async () => {
        const generation = speechGenerationRef.current
        updatePlaybackPaused(false)
        updateActiveSpeechId(queueKey)
        setPhase('synthesizing')
        try {
          await playAudio(
            speech.dataUrl,
            generation,
            speechPlaybackRate(item),
            durationMs => {
              for (const provider of new Set([
                speech.provider,
                speech.requestedProvider,
              ])) {
                recordSpeechAudioTiming(
                  connectionId,
                  provider,
                  durationMs,
                  item.text.length,
                )
              }
            },
          )
          if (generation !== speechGenerationRef.current) return
          updateActiveSpeechId('')
          setPhase('idle')
        } catch (error) {
          if (generation !== speechGenerationRef.current) return
          finishAudioRef.current = null
          beginAudioPlaybackRef.current = null
          audioRef.current = null
          updatePlaybackPaused(false)
          updateActiveSpeechId('')
          setPhase('idle')
          onError(error instanceof Error ? error.message : String(error))
        }
      }

      /*
       * Keep the previous poke audible while its replacement renders. Only
       * hand off the lane after the new audio payload exists, eliminating the
       * provider-latency gap without allowing a poke to displace other speech.
       */
      if (speechTaskQueueRef.current!.releaseActive(queueKey)) {
        interruptCurrentSpeech()
      }
      await speechTaskQueueRef.current!.enqueueLatest(queueKey, task)
    },
    [
      connectionId,
      getDefaultTtsConfig,
      getTransport,
      interruptCurrentSpeech,
      onError,
      playAudio,
      updateActiveSpeechId,
      updatePlaybackPaused,
    ],
  )

  const renderSequence = useCallback(
    async (items: SpeechSequenceItem[], options: SpeechRenderOptions = {}) => {
      const transport = getTransport()
      if (!transport)
        throw new Error('Connect to Hermes before rendering speech')
      return renderSpeechSequenceToWav(transport, items, options)
    },
    [getTransport],
  )

  const toggleSpeech = useCallback(
    (text: string, speechId: string) => {
      if (
        activeSpeechId === speechId &&
        (phase === 'speaking' || phase === 'synthesizing')
      ) {
        stopPlayback()
        return
      }
      void speak(text, speechId)
    },
    [activeSpeechId, phase, speak, stopPlayback],
  )

  const toggleRecording = useCallback(() => {
    if (phase === 'recording') {
      void stopAndTranscribe()
      return
    }
    if (!canToggleVoiceRecording(phase, activeSpeechId, playbackPaused)) return
    void startRecording()
  }, [
    activeSpeechId,
    phase,
    playbackPaused,
    startRecording,
    stopAndTranscribe,
  ])

  useEffect(
    () => () => {
      mountedRef.current = false
      speechGenerationRef.current += 1
      latestSpeechPreparationRef.current += 1
      for (const buffer of incrementalSpeechBuffersRef.current) buffer.cancel()
      incrementalSpeechBuffersRef.current.clear()
      incrementalSpeechRef.current = null
      speechTaskQueueRef.current?.clear()
      beginAudioPlaybackRef.current = null
      clearRecordingTimer()
      stopBrowserTracks(browserRecordingRef.current)
      browserRecordingRef.current = null
      const audio = audioRef.current
      finishAudioRef.current?.()
      finishAudioRef.current = null
      audioRef.current = null
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
      }
    },
    [clearRecordingTimer],
  )

  return {
    activeSpeechId,
    appendIncrementalSpeech,
    finishIncrementalSpeech,
    pausePlayback,
    phase,
    playbackPaused,
    prepareSpeechSequence,
    renderSequence,
    resumePlayback,
    speak,
    speakLatest,
    speakSequence,
    stopPlayback,
    toggleRecording,
    toggleSpeech,
  }
}
