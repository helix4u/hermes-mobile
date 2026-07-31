import { useEffect, useRef, useState } from 'react'
import type { VoicePhase } from './voice'
import {
  HermesNative,
  type WakeWordDetectedEvent,
  type WakeWordStateEvent,
} from './transport/native-bridge'

export const WAKE_WORD_PHRASE = 'hey hermes'

export type WakeWordStatus =
  | 'error'
  | 'listening'
  | 'off'
  | 'paused'
  | 'starting'
  | 'unsupported'

interface WakeWordConditions {
  appActive: boolean
  connected: boolean
  enabled: boolean
  nativeClient: boolean
  voicePhase: VoicePhase
}

interface UseWakeWordOptions extends WakeWordConditions {
  connectionId: string
  onDetected: () => void
  onError: (message: string) => void
}

export function wakeWordPreferenceKey(connectionId: string): string {
  return `hermes-mobile.wake-word.${connectionId}.enabled`
}

export function loadWakeWordEnabled(connectionId: string): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(wakeWordPreferenceKey(connectionId)) === 'true'
}

export function persistWakeWordEnabled(
  connectionId: string,
  enabled: boolean,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    wakeWordPreferenceKey(connectionId),
    String(enabled),
  )
}

export function shouldListenForWakeWord({
  appActive,
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
    voicePhase === 'idle'
  )
}

let wakeWordSessionSequence = 0

export function useWakeWord({
  appActive,
  connected,
  connectionId,
  enabled,
  nativeClient,
  onDetected,
  onError,
  voicePhase,
}: UseWakeWordOptions): WakeWordStatus {
  const [status, setStatus] = useState<WakeWordStatus>('off')
  const onDetectedRef = useRef(onDetected)
  const onErrorRef = useRef(onError)
  onDetectedRef.current = onDetected
  onErrorRef.current = onError

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
    let disposed = false
    const removeListeners: Array<() => Promise<void>> = []
    setStatus('starting')

    const detected = (event: WakeWordDetectedEvent) => {
      if (disposed || event.sessionId !== sessionId) return
      setStatus('paused')
      onDetectedRef.current()
    }
    const stateChanged = (event: WakeWordStateEvent) => {
      if (disposed || event.sessionId !== sessionId) return
      if (event.state === 'listening') {
        setStatus('listening')
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
      const [detectedHandle, stateHandle] = await Promise.all([
        HermesNative.addListener('wakeWordDetected', detected),
        HermesNative.addListener('wakeWordState', stateChanged),
      ])
      if (disposed) {
        await Promise.allSettled([
          detectedHandle.remove(),
          stateHandle.remove(),
        ])
        return
      }
      removeListeners.push(
        () => detectedHandle.remove(),
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
      for (const remove of removeListeners) void remove()
      void HermesNative.stopWakeWord({ sessionId }).catch(() => undefined)
    }
  }, [
    appActive,
    connected,
    connectionId,
    enabled,
    nativeClient,
    voicePhase,
  ])

  return status
}
