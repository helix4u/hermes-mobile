import { useEffect, useMemo, useState } from 'react'
import { voiceChoices, type VoiceChoice } from '../reader'
import type { HermesTransport } from '../transport/hermes-transport'

interface VoiceProviderResponse {
  providers?: string[]
}

interface ElevenLabsVoiceResponse {
  available?: boolean
  voices?: Array<{ label: string; voice_id: string }>
}

export function useVoiceCatalog(
  transport: HermesTransport | null,
  connected: boolean,
): {
  providers: string[]
  choices: VoiceChoice[]
  loading: boolean
  error: string
} {
  const [providers, setProviders] = useState<string[]>([])
  const [elevenLabs, setElevenLabs] = useState<
    Array<{ label: string; voice_id: string }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!transport || !connected) {
      setProviders([])
      setElevenLabs([])
      return
    }
    setLoading(true)
    setError('')
    void transport
      .requestJson<VoiceProviderResponse>('/api/audio/reader/providers')
      .then(async result => {
        if (!active) return
        const next = result.providers ?? []
        setProviders(next)
        if (!next.includes('elevenlabs')) {
          setElevenLabs([])
          return
        }
        try {
          const voices =
            await transport.requestJson<ElevenLabsVoiceResponse>(
              '/api/audio/elevenlabs/voices',
            )
          if (active) setElevenLabs(voices.voices ?? [])
        } catch {
          if (active) setElevenLabs([])
        }
      })
      .catch(loadError => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [connected, transport])

  return {
    providers,
    choices: useMemo(
      () => voiceChoices(providers, elevenLabs),
      [elevenLabs, providers],
    ),
    loading,
    error,
  }
}
