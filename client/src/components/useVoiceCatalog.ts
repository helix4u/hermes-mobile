import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { voiceChoices, type VoiceChoice } from '../reader'
import type { HermesTransport } from '../transport/hermes-transport'

export interface VoiceProviderCatalogItem {
  capabilities?: {
    instruction_control?: boolean
    languages?: string[]
    voice_cloning?: boolean
    voice_delete?: boolean
    voice_design?: boolean
  }
  available?: boolean
  configured_voice?: string
  display?: string
  id: string
  plugin?: boolean
  voices?: Array<{
    deletable?: boolean
    display?: string
    id: string
    kind?: string
    language?: string
    profile?: string
  }>
}

interface VoiceProviderResponse {
  providers?: VoiceProviderCatalogItem[]
}

export function useVoiceCatalog(
  transport: HermesTransport | null,
  connected: boolean,
): {
  providers: string[]
  catalog: VoiceProviderCatalogItem[]
  choices: VoiceChoice[]
  loading: boolean
  error: string
  refresh: () => Promise<void>
} {
  const [catalog, setCatalog] = useState<VoiceProviderCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generationRef = useRef(0)

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current
    if (!transport || !connected) {
      setCatalog([])
      setLoading(false)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await transport.requestJson<VoiceProviderResponse>(
        '/api/audio/tts/providers',
      )
      if (generation === generationRef.current) {
        setCatalog(result.providers ?? [])
      }
    } catch (loadError) {
      if (generation === generationRef.current) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        )
      }
    } finally {
      if (generation === generationRef.current) setLoading(false)
    }
  }, [connected, transport])

  useEffect(() => {
    void refresh()
    return () => {
      generationRef.current += 1
    }
  }, [refresh])

  const providers = useMemo(
    () => catalog.map(provider => provider.id),
    [catalog],
  )

  return {
    providers,
    catalog,
    choices: useMemo(
      () =>
        voiceChoices(
          providers,
          Object.fromEntries(
            catalog.map(provider => [
              provider.id,
              (provider.voices ?? []).map(voice => ({
                id: voice.id,
                label: voice.display ?? voice.id,
              })),
            ]),
          ),
        ),
      [catalog, providers],
    ),
    loading,
    error,
    refresh,
  }
}
