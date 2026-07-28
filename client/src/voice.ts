import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayEvent } from './protocol/types'
import type { HermesTransport } from './transport/hermes-transport'
import { HermesNative } from './transport/native-bridge'

export type VoicePhase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'synthesizing'
  | 'speaking'

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

export interface BufferedSpeechQueueOptions<T> {
  bufferAhead?: number
  synthesize: (item: SpeechSequenceItem, index: number) => Promise<T>
  play: (item: SpeechSequenceItem, value: T, index: number) => Promise<void>
  isCurrent?: () => boolean
  onActive?: (itemId: string | null) => void
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

interface UseVoiceOptions {
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

  const fillBuffer = (activeIndex: number) => {
    for (let offset = 0; offset <= bufferAhead; offset += 1) {
      prepare(activeIndex + offset)
    }
  }

  fillBuffer(0)
  try {
    for (let index = 0; index < items.length; index += 1) {
      if (!isCurrent()) return false
      fillBuffer(index)
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
      await options.play(items[index], result.value as T, index)
    }
    return isCurrent()
  } finally {
    options.onActive?.(null)
  }
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

  const pieces =
    cleanText.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gs) ?? [cleanText]
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
  return window.localStorage.getItem(voicePreferenceKey(connectionId)) === 'true'
}

export function persistAutoSpeak(
  connectionId: string,
  enabled: boolean,
): void {
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
    reader.onerror = () => reject(new Error('Could not read the voice recording'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  })
}

function stopBrowserTracks(recording: BrowserRecording | null): void {
  for (const track of recording?.stream.getTracks() ?? []) track.stop()
}

export function useVoice({
  getDefaultTtsConfig,
  getTransport,
  nativeClient,
  onError,
  onTranscript,
}: UseVoiceOptions) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [activeSpeechId, setActiveSpeechId] = useState('')
  const browserRecordingRef = useRef<BrowserRecording | null>(null)
  const recordingTimerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const finishAudioRef = useRef<(() => void) | null>(null)
  const speechGenerationRef = useRef(0)
  const mountedRef = useRef(true)
  const stopAndTranscribeRef = useRef<() => Promise<void>>(async () => {})

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }, [])

  const stopPlayback = useCallback(() => {
    speechGenerationRef.current += 1
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
    setActiveSpeechId('')
    setPhase(current =>
      current === 'speaking' || current === 'synthesizing' ? 'idle' : current,
    )
  }, [])

  const startRecording = useCallback(async () => {
    stopPlayback()
    onError('')
    try {
      if (nativeClient) {
        await HermesNative.startRecording()
      } else {
        if (
          typeof MediaRecorder === 'undefined' ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw new Error('Microphone recording is not supported in this browser')
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      setPhase('idle')
      onError(error instanceof Error ? error.message : String(error))
    }
  }, [clearRecordingTimer, nativeClient, onError, stopPlayback])

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
              resolve(
                new Blob(recording.chunks, { type: recording.mimeType }),
              ),
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
      if (mountedRef.current) setPhase('idle')
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
    async (dataUrl: string, generation: number): Promise<void> => {
      if (generation !== speechGenerationRef.current) return
      const audio = new Audio(dataUrl)
      audioRef.current = audio
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          if (finishAudioRef.current === finish) {
            finishAudioRef.current = null
          }
          audio.removeEventListener('ended', onEnded)
          audio.removeEventListener('error', onAudioError)
          if (audioRef.current === audio) audioRef.current = null
          if (error) reject(error)
          else resolve()
        }
        const onEnded = () => finish()
        const onAudioError = () =>
          finish(new Error('The device could not play Hermes speech audio'))
        finishAudioRef.current = finish
        audio.addEventListener('ended', onEnded, { once: true })
        audio.addEventListener('error', onAudioError, { once: true })
        void audio.play().then(() => {
          if (generation === speechGenerationRef.current) {
            setPhase('speaking')
          }
        }).catch(() =>
          finish(new Error('The device could not play Hermes speech audio')),
        )
      })
    },
    [],
  )

  const speakSequence = useCallback(
    async (
      items: SpeechSequenceItem[],
      options: SpeechSequenceOptions = {},
    ) => {
      const queue = items.flatMap(item =>
        splitSpeechText(item.text).map((text, chunkIndex) => ({
          ...item,
          id: item.id || `speech-${chunkIndex}`,
          text,
        })),
      )
      if (!queue.length) return
      stopPlayback()
      onError('')
      const generation = speechGenerationRef.current
      setActiveSpeechId(options.speechId || queue[0].id)
      setPhase('synthesizing')
      try {
        const transport = getTransport()
        if (!transport) throw new Error('Connect to Hermes before using speech')
        const completed = await runBufferedSpeechQueue(queue, {
          bufferAhead: normalizeSpeechSequenceBufferAhead(
            options.bufferAhead,
          ),
          isCurrent: () => generation === speechGenerationRef.current,
          onActive: itemId => {
            options.onActive?.(itemId)
            if (itemId) setPhase('synthesizing')
          },
          synthesize: async item => {
            let lastError: unknown
            for (const config of speechConfigAttempts(item)) {
              if (generation !== speechGenerationRef.current) {
                throw new Error('Speech playback stopped')
              }
              try {
                const result = await transport.requestJson<SpeechResponse>(
                  '/api/audio/speak',
                  {
                    text: item.text,
                    ...(config ? { tts_config: config } : {}),
                  },
                )
                if (!result.data_url) {
                  throw new Error('Hermes returned no speech audio')
                }
                return result.data_url
              } catch (error) {
                lastError = error
              }
            }
            throw (
              lastError ??
              new Error('Every configured Hermes speech voice failed')
            )
          },
          play: async (_item, dataUrl) => {
            await playAudio(dataUrl, generation)
          },
        })
        if (!completed || generation !== speechGenerationRef.current) return
        setActiveSpeechId('')
        setPhase('idle')
      } catch (error) {
        if (generation !== speechGenerationRef.current) return
        options.onActive?.(null)
        finishAudioRef.current = null
        audioRef.current = null
        setActiveSpeechId('')
        setPhase('idle')
        onError(error instanceof Error ? error.message : String(error))
      }
    },
    [getTransport, onError, playAudio, stopPlayback],
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
    if (phase !== 'idle') return
    void startRecording()
  }, [phase, startRecording, stopAndTranscribe])

  useEffect(
    () => () => {
      mountedRef.current = false
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
    phase,
    speak,
    speakSequence,
    stopPlayback,
    toggleRecording,
    toggleSpeech,
  }
}
