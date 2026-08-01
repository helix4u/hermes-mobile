import {
  DEFAULT_XAI_TTS_SELECTION,
  normalizeXaiTtsSelection,
  type XaiTtsSelection,
} from '../reader'

interface XaiTtsControlsProps {
  disabled?: boolean
  language?: string
  value?: XaiTtsSelection
  onChange: (value: XaiTtsSelection, language: string) => void
}

export function XaiTtsControls({
  disabled = false,
  language = '',
  onChange,
  value,
}: XaiTtsControlsProps) {
  const xai = normalizeXaiTtsSelection(value)
  const update = (patch: Partial<XaiTtsSelection>) =>
    onChange(normalizeXaiTtsSelection({ ...xai, ...patch }), language)

  return (
    <details className="xai-tts-controls">
      <summary>
        <span>xAI synthesis controls</span>
        <small>speed, latency, expression, and output quality</small>
      </summary>
      <div className="setting-grid voice-setting-grid">
        <label className="voice-speed-field">
          <span>
            Native voice speed
            <output>{xai.synthesisSpeed.toFixed(2)}×</output>
          </span>
          <input
            disabled={disabled}
            max="1.5"
            min="0.7"
            step="0.05"
            type="range"
            value={xai.synthesisSpeed}
            onChange={event =>
              update({ synthesisSpeed: Number(event.target.value) })
            }
          />
          <small>
            Sent to xAI during synthesis. The general playback-speed control is
            applied afterward on this phone.
          </small>
        </label>

        <label>
          Latency optimization
          <select
            disabled={disabled}
            value={xai.optimizeStreamingLatency}
            onChange={event =>
              update({
                optimizeStreamingLatency: Number(event.target.value) as
                  | 0
                  | 1
                  | 2,
              })
            }
          >
            <option value={0}>0 · best quality</option>
            <option value={1}>1 · faster first audio</option>
            <option value={2}>2 · lowest latency</option>
          </select>
        </label>

        <label>
          Language
          <input
            disabled={disabled}
            placeholder="en, auto, pt-BR…"
            value={language}
            onChange={event => onChange(xai, event.target.value)}
          />
        </label>

        <label>
          Sample rate
          <select
            disabled={disabled}
            value={xai.sampleRate}
            onChange={event => update({ sampleRate: Number(event.target.value) })}
          >
            {[8_000, 16_000, 22_050, 24_000, 44_100, 48_000].map(rate => (
              <option key={rate} value={rate}>
                {rate.toLocaleString()} Hz
                {rate === DEFAULT_XAI_TTS_SELECTION.sampleRate ? ' · default' : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          MP3 bit rate
          <select
            disabled={disabled}
            value={xai.bitRate}
            onChange={event => update({ bitRate: Number(event.target.value) })}
          >
            {[32_000, 64_000, 96_000, 128_000, 192_000].map(rate => (
              <option key={rate} value={rate}>
                {rate / 1_000} kbps
                {rate === DEFAULT_XAI_TTS_SELECTION.bitRate ? ' · default' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="toggle-row compact-toggle-row">
        <input
          checked={xai.autoSpeechTags}
          disabled={disabled}
          type="checkbox"
          onChange={event => update({ autoSpeechTags: event.target.checked })}
        />
        <span>
          <strong>Automatic expressive tags</strong>
          <small>
            Rewrites each synthesis segment for expressive xAI speech. This adds
            an auxiliary-model step and can noticeably increase startup time.
          </small>
        </span>
      </label>

      <label className="toggle-row compact-toggle-row">
        <input
          checked={xai.textNormalization}
          disabled={disabled}
          type="checkbox"
          onChange={event => update({ textNormalization: event.target.checked })}
        />
        <span>
          <strong>Spoken-text normalization</strong>
          <small>Expand numbers, abbreviations, and symbols before speech.</small>
        </span>
      </label>
    </details>
  )
}
