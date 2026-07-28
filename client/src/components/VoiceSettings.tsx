import { useEffect } from 'react'
import type { VoiceSelection } from '../reader'
import type { HermesTransport } from '../transport/hermes-transport'
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
  const { choices, error, loading, providers } = useVoiceCatalog(
    transport,
    connected,
  )
  const selectedChoices = choices.filter(
    choice => choice.provider === selection.provider,
  )

  useEffect(() => {
    if (
      selection.provider &&
      providers.length > 0 &&
      !providers.includes(selection.provider)
    ) {
      onChange({ ...selection, provider: '', voice: '' })
    }
  }, [onChange, providers, selection])

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
              })
            }
          >
            <option value="">Host default</option>
            {providers.map(provider => (
              <option key={provider} value={provider}>
                {provider === 'xai' ? 'xAI' : provider}
              </option>
            ))}
          </select>
        </label>

        <label>
          Voice
          <input
            disabled={!connected || !selection.provider}
            list="normal-voice-options"
            placeholder={
              selection.provider ? 'Provider default or voice ID' : 'Host default'
            }
            value={selection.voice}
            onChange={event =>
              onChange({ ...selection, voice: event.target.value })
            }
          />
          <datalist id="normal-voice-options">
            {selectedChoices.map(choice => (
              <option
                key={`${choice.provider}:${choice.voice}`}
                value={choice.voice}
              >
                {choice.label}
              </option>
            ))}
          </datalist>
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
        Listen buttons and auto-speak use this connection-scoped voice. Host
        default follows the server’s own TTS configuration.
      </p>
      {error && <p className="inline-error">{error}</p>}
    </div>
  )
}
