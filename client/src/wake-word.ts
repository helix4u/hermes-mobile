import { useCallback, useEffect, useRef, useState } from 'react'
import type { HermesTransport } from './transport/hermes-transport'
import {
  HermesNative,
  type WakeWordDetectedEvent,
  type WakeWordStateEvent,
  type WakeWordUtteranceEvent,
} from './transport/native-bridge'
import type { VoicePhase } from './voice'

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

export function stripWakePhrase(transcript: string): string {
  return transcript
    .trim()
    // The acoustic detector owns activation, so its words must never become
    // part of the submitted request. Host STT commonly hears the bundled
    // "Hey Hermes" model as "Okay Hermes" or "OK Hermes"; consume those
    // variants while preserving the command that follows (especially Pet).
    .replace(
      /^(?:(?:hey|okay|ok)[\s,.:;!?-]*)?hermes\b[\s,.:;!?-]*/i,
      '',
    )
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
  nativeClient,
  onDetected,
  onError,
  onNotice,
  onTranscript,
  voicePhase,
}: UseWakeWordOptions): WakeWordController {
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
        onNoticeRef.current('Hey Hermes heard, but no request followed.')
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
        const text = stripWakePhrase(String(result.transcript ?? ''))
        if (!text) {
          onNoticeRef.current('Hey Hermes heard, but no request followed.')
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
      const result = await HermesNative.startWakeWord({
        phrase: WAKE_WORD_PHRASE,
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
    voicePhase,
  ])

  return { cancelCapture, status }
}
