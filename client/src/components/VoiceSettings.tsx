import { useEffect } from 'react'
import type { VoiceSelection } from '../reader'
import type { HermesTransport } from '../transport/hermes-transport'
import { VoiceLibrary } from './VoiceLibrary'
import { useVoiceCatalog } from './useVoiceCatalog'

interface VoiceSettingsProps {
  connected: boolean
  selection: VoiceSelection
  transport: HermesTransport | null
  onChange: (selection: VoiceSelection) => void
}

export function VoiceSettings({
  connected,
  onChange,
  selection,
  transport,
}: VoiceSettingsProps) {
  const {
    catalog,
    catalogSupported,
    choices,
    error,
    loading,
    providers,
    refresh,
  } = useVoiceCatalog(transport, connected)
  const selectedChoices = choices.filter(
    choice => choice.provider === selection.provider,
  )
  const selectedProvider = catalog.find(
    provider => provider.id === selection.provider,
  )

  useEffect(() => {
    if (
      catalogSupported === false &&
      (selection.provider ||
        selection.voice ||
        selection.instruct ||
        selection.language)
    ) {
      onChange({
        ...selection,
        provider: '',
        voice: '',
        instruct: '',
        language: '',
      })
      return
    }
    if (
      selection.provider &&
      providers.length > 0 &&
      !providers.includes(selection.provider)
    ) {
      onChange({
        ...selection,
        provider: '',
        voice: '',
        instruct: '',
        language: '',
      })
    }
  }, [catalogSupported, onChange, providers, selection])

  return (
    <div className="voice-settings">
      <div className="voice-settings-heading">
        <strong>Normal read-aloud voice</strong>
        {loading && <span className="state-chip">Loading</span>}
      </div>

      <div className="setting-grid voice-setting-grid">
        <label>
          Provider
          <select
            disabled={!connected}
            value={selection.provider}
            onChange={event =>
              onChange({
                ...selection,
                provider: event.target.value,
                voice: '',
                instruct: '',
                language: '',
              })
            }
          >
            <option value="">Host default</option>
            {providers.map(provider => (
              <option key={provider} value={provider}>
                {catalog.find(item => item.id === provider)?.display ??
                  (provider === 'xai' ? 'xAI' : provider)}
              </option>
            ))}
          </select>
        </label>

        {selectedProvider?.capabilities?.instruction_control && (
          <label>
            Voice instruction
            <input
              disabled={!connected}
              placeholder="Tone, emotion, pace, or delivery"
              value={selection.instruct ?? ''}
              onChange={event =>
                onChange({ ...selection, instruct: event.target.value })
              }
            />
          </label>
        )}

        {(selectedProvider?.capabilities?.languages?.length ?? 0) > 0 && (
          <label>
            Language
            <select
              disabled={!connected}
              value={selection.language || 'Auto'}
              onChange={event =>
                onChange({ ...selection, language: event.target.value })
              }
            >
              {selectedProvider?.capabilities?.languages?.map(language => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Voice
          {selectedChoices.length > 0 ? (
            <select
              disabled={!connected || !selection.provider}
              value={selection.voice}
              onChange={event =>
                onChange({ ...selection, voice: event.target.value })
              }
            >
              <option value="">Provider default</option>
              {selectedChoices.map(choice => (
                <option
                  key={`${choice.provider}:${choice.voice}`}
                  value={choice.voice}
                >
                  {choice.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              disabled={!connected || !selection.provider}
              placeholder={
                selection.provider
                  ? 'No catalog reported; enter a voice ID'
                  : 'Host default'
              }
              value={selection.voice}
              onChange={event =>
                onChange({ ...selection, voice: event.target.value })
              }
            />
          )}
          {selection.provider && (
            <small>
              {selectedChoices.length > 0
                ? `${selectedChoices.length} voices available`
                : 'This provider did not report a voice catalog.'}
            </small>
          )}
        </label>

        <label className="voice-speed-field">
          <span>
            Speed
            <output>{selection.speed.toFixed(2)}×</output>
          </span>
          <input
            disabled={!connected}
            max="1.5"
            min="0.7"
            step="0.05"
            type="range"
            value={selection.speed}
            onChange={event =>
              onChange({
                ...selection,
                speed: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <p className="section-help">
        {catalogSupported === false
          ? 'This host does not expose provider and voice catalogs. Listen, auto-speak, and Reader use the host’s configured default voice. Full voice controls return automatically when you switch to a compatible host.'
          : 'Listen buttons and auto-speak use this connection-scoped voice. Host default follows the server’s own TTS configuration.'}
      </p>
      {selectedProvider && (
        <VoiceLibrary
          connected={connected}
          key={selectedProvider.id}
          provider={selectedProvider}
          selectedVoice={selection.voice}
          transport={transport}
          onRefresh={refresh}
          onSelectVoice={voice =>
            onChange({ ...selection, voice })
          }
        />
      )}
      {error && <p className="inline-error">{error}</p>}
    </div>
  )
}
