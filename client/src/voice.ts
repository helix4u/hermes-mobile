import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayEvent } from './protocol/types'
import {
  adaptiveSpeechBufferAhead,
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
  bufferAhead?: number
}

export interface SpeechRenderOptions {
  bufferAhead?: number
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
  synthesize: (item: SpeechSequenceItem, index: number) => Promise<T>
  play: (item: SpeechSequenceItem, value: T, index: number) => Promise<void>
  isCurrent?: () => boolean
  onActive?: (itemId: string | null) => void
}

export interface SerialSpeechTaskQueue {
  clear: () => void
  enqueue: (task: () => Promise<void>) => Promise<void>
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
  let tail = Promise.resolve()

  return {
    clear() {
      epoch += 1
      tail = Promise.resolve()
    },
    enqueue(task) {
      const queuedEpoch = epoch
      const result = tail.then(async () => {
        if (queuedEpoch !== epoch) return
        await task()
      })
      tail = result.catch(() => {})
      return result
    },
  }
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

function withoutSpeechPlaybackRate(
  config: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!config || !Object.prototype.hasOwnProperty.call(config, 'speed')) {
    return config
  }
  const { speed: _speed, ...synthesisConfig } = config
  return Object.keys(synthesisConfig).length ? synthesisConfig : undefined
}

export function speechItemForInteractivePlayback(
  item: SpeechSequenceItem,
): SpeechSequenceItem {
  return {
    ...item,
    ttsConfig: withoutSpeechPlaybackRate(item.ttsConfig),
    fallbackTtsConfigs: item.fallbackTtsConfigs?.map(
      withoutSpeechPlaybackRate,
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

  const prepare = (index: number) => {
    if (index >= items.length || prepared.has(index)) return
    prepared.set(
      index,
      Promise.resolve()
        .then(() => options.synthesize(items[index], index))
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
): SpeechSequenceItem[] {
  return items.flatMap((item, itemIndex) =>
    (
      itemIndex === 0 && firstChunkChars !== undefined
        ? splitSpeechTextForStartup(item.text, firstChunkChars)
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

  const minimumBoundary = Math.floor(safeFirstCap * 0.5)
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
  const speechTaskQueueRef = useRef<SerialSpeechTaskQueue | null>(null)
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

  const stopPlayback = useCallback(() => {
    speechGenerationRef.current += 1
    speechTaskQueueRef.current?.clear()
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
    ): Promise<void> => {
      if (generation !== speechGenerationRef.current) return
      const audio = new Audio(dataUrl)
      const releasePlaybackRate = maintainSpeechPlaybackRate(audio, playbackRate)
      audioRef.current = audio
      await new Promise<void>((resolve, reject) => {
        let settled = false
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
                setPhase('speaking')
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

  const speakSequence = useCallback(
    async (
      items: SpeechSequenceItem[],
      options: SpeechSequenceOptions = {},
    ) => {
      const adaptiveBuffering = options.bufferAhead === undefined
      const requestedFirstProvider = configuredSpeechTimingProvider(
        items[0]?.ttsConfig,
      )
      const queue = expandSpeechSequence(
        items,
        adaptiveBuffering
          ? adaptiveStartupSpeechChars(
              loadSpeechTimingStore(connectionId),
              requestedFirstProvider,
            )
          : undefined,
      )
      if (!queue.length) return
      await speechTaskQueueRef.current!.enqueue(async () => {
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
              initialBufferAhead: adaptiveBuffering ? 0 : undefined,
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
      })
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
    pausePlayback,
    phase,
    playbackPaused,
    renderSequence,
    resumePlayback,
    speak,
    speakSequence,
    stopPlayback,
    toggleRecording,
    toggleSpeech,
  }
}
