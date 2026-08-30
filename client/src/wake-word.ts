import { useCallback, useEffect, useRef, useState } from 'react'
import type { HermesTransport } from './transport/hermes-transport'
import {
  HermesNative,
  type WakeWordDetectedEvent,
  type WakeWordStateEvent,
  type WakeWordUtteranceEvent,
} from './transport/native-bridge'
import type { VoicePhase } from './voice'

export interface WakeWordModel {
  id: WakeWordModelId
  label: string
  phrase: string
  transcriptPrefixes: string[]
}

export type WakeWordProvider = 'openwakeword' | 'sherpa'

export const WAKE_WORD_MODELS = [
  {
    id: 'hey_hermes',
    label: 'Hey Hermes',
    phrase: 'hey hermes',
    transcriptPrefixes: ['hey hermes', 'okay hermes', 'ok hermes', 'hermes'],
  },
  {
    id: 'alexa',
    label: 'Alexa',
    phrase: 'alexa',
    transcriptPrefixes: ['alexa'],
  },
  {
    id: 'hey_jarvis',
    label: 'Hey Jarvis',
    phrase: 'hey jarvis',
    transcriptPrefixes: ['hey jarvis', 'jarvis'],
  },
  {
    id: 'hey_mycroft',
    label: 'Hey Mycroft',
    phrase: 'hey mycroft',
    transcriptPrefixes: ['hey mycroft', 'mycroft'],
  },
  {
    id: 'hey_rhasspy',
    label: 'Hey Rhasspy',
    phrase: 'hey rhasspy',
    transcriptPrefixes: ['hey rhasspy', 'rhasspy'],
  },
] as const satisfies readonly WakeWordModel[]

export type WakeWordModelId =
  | 'alexa'
  | 'hey_hermes'
  | 'hey_jarvis'
  | 'hey_mycroft'
  | 'hey_rhasspy'

export const DEFAULT_WAKE_WORD_MODEL_ID: WakeWordModelId = 'hey_hermes'
export const DEFAULT_WAKE_WORD_PROVIDER: WakeWordProvider = 'openwakeword'
export const DEFAULT_SHERPA_WAKE_PHRASE = 'hey hermes'
export const SHERPA_WAKE_WORD_MODEL_ID = 'gigaspeech-3.3m-en'
export const WAKE_WORD_PHRASE = 'hey hermes'

export type WakeWordMode = 'off' | 'review' | 'send'
export type ActiveTurnInputMode = 'interrupt' | 'steer'
export type WakeWordStatus =
  | 'capturing'
  | 'error'
  | 'listening'
  | 'off'
  | 'paused'
  | 'starting'
  | 'transcribing'
  | 'unsupported'

interface WakeWordConditions {
  appActive: boolean
  available: boolean
  connected: boolean
  enabled: boolean
  nativeClient: boolean
  voicePhase: VoicePhase
}

interface UseWakeWordOptions extends WakeWordConditions {
  connectionId: string
  getTransport: () => HermesTransport | null
  modelId: WakeWordModelId
  provider: WakeWordProvider
  sherpaPhrase: string
  onDetected: () => void
  onError: (message: string) => void
  onNotice: (message: string) => void
  onTranscript: (text: string) => void
}

export interface WakeWordController {
  cancelCapture: () => void
  status: WakeWordStatus
}

interface TranscriptionResponse {
  transcript?: string
}

export function wakeWordPreferenceKey(connectionId: string): string {
  return `hermes-mobile.wake-word.${connectionId}.enabled`
}

export function wakeWordModePreferenceKey(connectionId: string): string {
  return `hermes-mobile.wake-word.${connectionId}.mode`
}

export function wakeWordModelPreferenceKey(connectionId: string): string {
  return `hermes-mobile.wake-word.${connectionId}.model`
}

export function wakeWordProviderPreferenceKey(connectionId: string): string {
  return `hermes-mobile.wake-word.${connectionId}.provider`
}

export function sherpaWakePhrasePreferenceKey(connectionId: string): string {
  return `hermes-mobile.wake-word.${connectionId}.sherpa-phrase`
}

export function wakeWordModel(modelId: WakeWordModelId): WakeWordModel {
  return (
    WAKE_WORD_MODELS.find(model => model.id === modelId) ??
    WAKE_WORD_MODELS[0]
  )
}

export function loadWakeWordModelId(connectionId: string): WakeWordModelId {
  if (typeof window === 'undefined') return DEFAULT_WAKE_WORD_MODEL_ID
  const stored = window.localStorage.getItem(
    wakeWordModelPreferenceKey(connectionId),
  )
  return WAKE_WORD_MODELS.some(model => model.id === stored)
    ? (stored as WakeWordModelId)
    : DEFAULT_WAKE_WORD_MODEL_ID
}

export function persistWakeWordModelId(
  connectionId: string,
  modelId: WakeWordModelId,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(wakeWordModelPreferenceKey(connectionId), modelId)
}

export function loadWakeWordProvider(
  connectionId: string,
): WakeWordProvider {
  if (typeof window === 'undefined') return DEFAULT_WAKE_WORD_PROVIDER
  return window.localStorage.getItem(
    wakeWordProviderPreferenceKey(connectionId),
  ) === 'sherpa'
    ? 'sherpa'
    : 'openwakeword'
}

export function persistWakeWordProvider(
  connectionId: string,
  provider: WakeWordProvider,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    wakeWordProviderPreferenceKey(connectionId),
    provider,
  )
}

export function normalizeSherpaWakePhrase(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
  if (
    normalized.length < 2 ||
    normalized.length > 48 ||
    !/^[a-z0-9]+(?:[ '-][a-z0-9]+)*$/.test(normalized)
  ) {
    return ''
  }
  return normalized
}

export function loadSherpaWakePhrase(connectionId: string): string {
  if (typeof window === 'undefined') return DEFAULT_SHERPA_WAKE_PHRASE
  return (
    normalizeSherpaWakePhrase(
      window.localStorage.getItem(
        sherpaWakePhrasePreferenceKey(connectionId),
      ) ?? '',
    ) || DEFAULT_SHERPA_WAKE_PHRASE
  )
}

export function persistSherpaWakePhrase(
  connectionId: string,
  phrase: string,
): boolean {
  const normalized = normalizeSherpaWakePhrase(phrase)
  if (!normalized || typeof window === 'undefined') return false
  window.localStorage.setItem(
    sherpaWakePhrasePreferenceKey(connectionId),
    normalized,
  )
  return true
}

export function wakeWordPhrase(
  provider: WakeWordProvider,
  modelId: WakeWordModelId,
  sherpaPhrase: string,
): string {
  return provider === 'sherpa'
    ? normalizeSherpaWakePhrase(sherpaPhrase) || DEFAULT_SHERPA_WAKE_PHRASE
    : wakeWordModel(modelId).phrase
}

export function wakeWordLabel(
  provider: WakeWordProvider,
  modelId: WakeWordModelId,
  sherpaPhrase: string,
): string {
  const phrase = wakeWordPhrase(provider, modelId, sherpaPhrase)
  return provider === 'sherpa'
    ? phrase.replace(/\b\w/g, character => character.toUpperCase())
    : wakeWordModel(modelId).label
}

export function activeTurnInputModePreferenceKey(connectionId: string): string {
  return `hermes-mobile.active-turn-input.${connectionId}.mode`
}

export function loadActiveTurnInputMode(
  connectionId: string,
): ActiveTurnInputMode {
  if (typeof window === 'undefined') return 'interrupt'
  return window.localStorage.getItem(
    activeTurnInputModePreferenceKey(connectionId),
  ) === 'steer'
    ? 'steer'
    : 'interrupt'
}

export function persistActiveTurnInputMode(
  connectionId: string,
  mode: ActiveTurnInputMode,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    activeTurnInputModePreferenceKey(connectionId),
    mode,
  )
}

export function loadWakeWordMode(connectionId: string): WakeWordMode {
  if (typeof window === 'undefined') return 'off'
  const stored = window.localStorage.getItem(
    wakeWordModePreferenceKey(connectionId),
  )
  if (stored === 'review' || stored === 'send' || stored === 'off') {
    return stored
  }
  return window.localStorage.getItem(wakeWordPreferenceKey(connectionId)) ===
    'true'
    ? 'review'
    : 'off'
}

export function persistWakeWordMode(
  connectionId: string,
  mode: WakeWordMode,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(wakeWordModePreferenceKey(connectionId), mode)
  window.localStorage.setItem(
    wakeWordPreferenceKey(connectionId),
    String(mode !== 'off'),
  )
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stripWakePhrase(
  transcript: string,
  modelId: WakeWordModelId = DEFAULT_WAKE_WORD_MODEL_ID,
  customPhrase = '',
): string {
  const normalizedCustom = normalizeSherpaWakePhrase(customPhrase)
  const prefixes = (normalizedCustom
    ? [normalizedCustom]
    : wakeWordModel(modelId).transcriptPrefixes
  )
    .map(prefix => escapeRegex(prefix).replace(/\s+/g, '[\\s,.:;!?-]*'))
    .sort((left, right) => right.length - left.length)
  return transcript
    .trim()
    .replace(new RegExp(`^(?:${prefixes.join('|')})\\b[\\s,.:;!?-]*`, 'i'), '')
    .trim()
}

export function shouldListenForWakeWord({
  appActive,
  available,
  connected,
  enabled,
  nativeClient,
  voicePhase,
}: WakeWordConditions): boolean {
  return (
    enabled &&
    nativeClient &&
    connected &&
    appActive &&
    available &&
    voicePhase === 'idle'
  )
}

let wakeWordSessionSequence = 0

export function useWakeWord({
  appActive,
  available,
  connected,
  connectionId,
  enabled,
  getTransport,
  modelId,
  nativeClient,
  provider,
  sherpaPhrase,
  onDetected,
  onError,
  onNotice,
  onTranscript,
  voicePhase,
}: UseWakeWordOptions): WakeWordController {
  const model = wakeWordModel(modelId)
  const phrase = wakeWordPhrase(provider, modelId, sherpaPhrase)
  const label = wakeWordLabel(provider, modelId, sherpaPhrase)
  const [status, setStatus] = useState<WakeWordStatus>('off')
  const [cycle, setCycle] = useState(0)
  const activeSessionRef = useRef('')
  const onDetectedRef = useRef(onDetected)
  const onErrorRef = useRef(onError)
  const onNoticeRef = useRef(onNotice)
  const onTranscriptRef = useRef(onTranscript)
  onDetectedRef.current = onDetected
  onErrorRef.current = onError
  onNoticeRef.current = onNotice
  onTranscriptRef.current = onTranscript

  const cancelCapture = useCallback(() => {
    const sessionId = activeSessionRef.current
    if (!sessionId) return
    setStatus('paused')
    void HermesNative.stopWakeWord({ sessionId })
      .catch(() => undefined)
      .finally(() => setCycle(current => current + 1))
  }, [])

  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      return
    }
    if (!nativeClient) {
      setStatus('unsupported')
      return
    }
    if (
      !shouldListenForWakeWord({
        appActive,
        available,
        connected,
        enabled,
        nativeClient,
        voicePhase,
      })
    ) {
      setStatus('paused')
      return
    }

    const sessionId = `wake:${connectionId}:${Date.now()}:${++wakeWordSessionSequence}`
    activeSessionRef.current = sessionId
    let disposed = false
    const removeListeners: Array<() => Promise<void>> = []
    setStatus('starting')

    const detected = (event: WakeWordDetectedEvent) => {
      if (disposed || event.sessionId !== sessionId) return
      setStatus('capturing')
      onDetectedRef.current()
    }
    const utterance = async (event: WakeWordUtteranceEvent) => {
      if (disposed || event.sessionId !== sessionId) return
      if (event.endReason === 'no_speech') {
        setStatus('paused')
        onNoticeRef.current(`${label} heard, but no request followed.`)
        setCycle(current => current + 1)
        return
      }
      setStatus('transcribing')
      try {
        const transport = getTransport()
        if (!transport) throw new Error('Connect to Hermes before transcribing')
        const result = await transport.requestJson<TranscriptionResponse>(
          '/api/audio/transcribe',
          {
            data_url: event.dataUrl,
            mime_type: event.mimeType,
          },
        )
        if (disposed) return
        const text = stripWakePhrase(
          String(result.transcript ?? ''),
          modelId,
          provider === 'sherpa' ? phrase : '',
        )
        if (!text) {
          onNoticeRef.current(`${label} heard, but no request followed.`)
          return
        }
        onTranscriptRef.current(text)
      } catch (error) {
        if (disposed) return
        onErrorRef.current(
          error instanceof Error ? error.message : String(error),
        )
      } finally {
        if (!disposed) setCycle(current => current + 1)
      }
    }
    const stateChanged = (event: WakeWordStateEvent) => {
      if (disposed || event.sessionId !== sessionId) return
      if (event.state === 'listening') {
        setStatus('listening')
      } else if (event.state === 'capturing') {
        setStatus('capturing')
      } else if (event.state === 'unsupported') {
        setStatus('unsupported')
      } else if (event.state === 'error') {
        setStatus('error')
        onErrorRef.current(event.error || 'Wake word listening stopped')
      } else {
        setStatus('paused')
      }
    }

    const start = async () => {
      const [detectedHandle, utteranceHandle, stateHandle] = await Promise.all([
        HermesNative.addListener('wakeWordDetected', detected),
        HermesNative.addListener('wakeWordUtterance', event => {
          void utterance(event)
        }),
        HermesNative.addListener('wakeWordState', stateChanged),
      ])
      if (disposed) {
        await Promise.allSettled([
          detectedHandle.remove(),
          utteranceHandle.remove(),
          stateHandle.remove(),
        ])
        return
      }
      removeListeners.push(
        () => detectedHandle.remove(),
        () => utteranceHandle.remove(),
        () => stateHandle.remove(),
      )
      const sherpaKeywords =
        provider === 'sherpa'
          ? await import('./sherpa-keywords').then(module =>
              module.buildSherpaKeywordDefinition(phrase),
            )
          : undefined
      const result = await HermesNative.startWakeWord({
        modelId:
          provider === 'sherpa' ? SHERPA_WAKE_WORD_MODEL_ID : modelId,
        phrase,
        provider,
        sherpaKeywords,
        sessionId,
      })
      if (disposed) return
      setStatus(result.supported ? 'listening' : 'unsupported')
    }

    void start().catch(error => {
      if (disposed) return
      setStatus('error')
      onErrorRef.current(
        error instanceof Error ? error.message : String(error),
      )
    })

    return () => {
      disposed = true
      if (activeSessionRef.current === sessionId) {
        activeSessionRef.current = ''
      }
      for (const remove of removeListeners) void remove()
      void HermesNative.stopWakeWord({ sessionId }).catch(() => undefined)
    }
  }, [
    appActive,
    available,
    connected,
    connectionId,
    cycle,
    enabled,
    getTransport,
    nativeClient,
    modelId,
    provider,
    sherpaPhrase,
    voicePhase,
  ])

  return { cancelCapture, status }
}
