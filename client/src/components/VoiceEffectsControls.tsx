import { useEffect, useRef, useState } from 'react'
import { normalizeVoiceEffects, VOICE_EFFECT_PRESETS, type VoiceEffectsSettings } from '../voice-effects-settings'
import './VoiceEffectsControls.css'

export interface VoiceEffectsControlsProps {
  value?: VoiceEffectsSettings
  onChange: (value: VoiceEffectsSettings) => void
  onBend?: (semitones: number) => void
  warning?: string
}

export function VoiceEffectsControls({ value, onChange, onBend, warning }: VoiceEffectsControlsProps) {
  const settings = normalizeVoiceEffects(value)
  const [bend, setBend] = useState(0)
  const bendCallback = useRef(onBend)
  bendCallback.current = onBend
  const release = () => { setBend(0); onBend?.(0) }
  useEffect(() => {
    const clear = () => { setBend(0); bendCallback.current?.(0) }
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
      bendCallback.current?.(0)
    }
  }, [])
  useEffect(() => { if (!settings.enabled) { setBend(0); bendCallback.current?.(0) } }, [settings.enabled])
  const signed = (number: number) => `${number > 0 ? '+' : ''}${number.toFixed(1)}`
  return <details className="voice-effects-controls">
    <summary>Playback effects{settings.enabled ? ' · On' : ' · Off'}</summary>
    <label className="voice-effects-toggle"><input type="checkbox" checked={settings.enabled}
      onChange={event => onChange({ ...settings, enabled: event.target.checked })} />Enable playback effects</label>
    <small>Changes what you hear on this device. Works during GPT-Live and Realtime calls.</small>
    <div className="voice-effects-presets" aria-label="Voice effect presets">
      {Object.entries(VOICE_EFFECT_PRESETS).map(([name, preset]) => <button key={name} type="button"
        onClick={() => { release(); onChange({ ...preset }) }}>{name}</button>)}
    </div>
    {(['pitch', 'bass', 'treble'] as const).map(key => <label key={key}>
      <span>{key === 'pitch' ? 'Pitch' : key === 'bass' ? 'Bass' : 'Treble'} <output>{signed(settings[key])} {key === 'pitch' ? 'st' : 'dB'}</output></span>
      <input aria-label={`Playback ${key}`} type="range" min={-12} max={12} step={0.1}
        disabled={!settings.enabled} value={settings[key]}
        onChange={event => onChange({ ...settings, [key]: Number(event.target.value) })} />
    </label>)}
    <label className="voice-effects-toggle"><input type="checkbox" checked={settings.radio} disabled={!settings.enabled}
      onChange={event => onChange({ ...settings, radio: event.target.checked })} />Radio filter</label>
    <fieldset className="voice-effects-spatial">
      <legend>Spatial audio</legend>
      <label className="voice-effects-toggle"><input type="checkbox" checked={settings.spatial} disabled={!settings.enabled}
        onChange={event => onChange({ ...settings, spatial: event.target.checked })} />Enable spatial audio</label>
      <small>Stereo headphones give the clearest sense of position. Distance makes the voice sound farther away and quieter.</small>
      <label><span>Left / right <output>{settings.spatialPosition === 0 ? 'Center'
        : `${settings.spatialPosition < 0 ? 'Left' : 'Right'} ${Math.round(Math.abs(settings.spatialPosition) * 100)}%`}</output></span>
        <input aria-label="Playback left/right position" type="range" min={-1} max={1} step={0.1}
          disabled={!settings.enabled || !settings.spatial} value={settings.spatialPosition}
          onChange={event => onChange({ ...settings, spatialPosition: Number(event.target.value) })} />
      </label>
      <label><span>Distance <output>{settings.spatialDistance.toFixed(1)} m</output></span>
        <input aria-label="Playback distance" type="range" min={1} max={5} step={0.1}
          disabled={!settings.enabled || !settings.spatial} value={settings.spatialDistance}
          onChange={event => onChange({ ...settings, spatialDistance: Number(event.target.value) })} />
      </label>
    </fieldset>
    {onBend && <label><span>Pitch bend <output>{signed(bend)} st</output></span>
      <input aria-label="Momentary pitch bend" type="range" min={-12} max={12} step={0.1}
        disabled={!settings.enabled} value={bend}
        onChange={event => { const next = Number(event.target.value); setBend(next); onBend(next) }}
        onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onKeyUp={release} onBlur={release} />
      <small>Drag while speaking. Release to return to your saved pitch. Total pitch is limited to one octave.</small>
    </label>}
    <button type="button" onClick={() => { release(); onChange({ ...VOICE_EFFECT_PRESETS.Natural! }) }}>Reset effects</button>
    {warning && <p role="status" className="voice-effects-warning">{warning}</p>}
  </details>
}
