import type { ActiveTurnInputMode, WakeWordMode } from '../wake-word'

interface CycleOption<T extends string> {
  value: T
  label: string
}

export function CycleTextControl<T extends string>({ label, value, options, disabled, onChange }: {
  label: string
  value: T
  options: readonly [CycleOption<T>, ...CycleOption<T>[]]
  disabled?: boolean
  onChange: (value: T) => void
}) {
  const index = Math.max(0, options.findIndex(option => option.value === value))
  const current = options[index]
  const next = options[(index + 1) % options.length]
  return (
    <button type="button" className="voice-cycle-control" disabled={disabled}
      aria-label={`${label}: ${current.label}. Change to ${next.label}`}
      title={`Tap to change to ${next.label}`} onClick={() => onChange(next.value)}>
      <span>{label}</span>
      <strong>{current.label}</strong>
    </button>
  )
}

interface SessionVoiceControlsProps {
  nativeClient: boolean
  wakeWordMode: WakeWordMode
  autoSpeak: boolean
  activeTurnInputMode: ActiveTurnInputMode
  onWakeChange: (value: WakeWordMode) => void
  onAutoSpeakChange: (value: boolean) => void
  onInputModeChange: (value: ActiveTurnInputMode) => void
}

export function SessionVoiceControls(props: SessionVoiceControlsProps) {
  return (
    <section className="session-voice-options" aria-label="Voice and input">
      <h2>Voice and input</h2>
      <div className="chat-voice-control-grid">
        <CycleTextControl label="Wake" disabled={!props.nativeClient}
          value={props.wakeWordMode} onChange={props.onWakeChange}
          options={[{ value: 'off', label: 'Off' }, { value: 'review', label: 'Review' }, { value: 'send', label: 'Auto-send' }]} />
        <CycleTextControl label="Replies" value={props.autoSpeak ? 'auto' : 'manual'}
          onChange={value => props.onAutoSpeakChange(value === 'auto')}
          options={[{ value: 'manual', label: 'Manual' }, { value: 'auto', label: 'Auto-play' }]} />
        <CycleTextControl label="During turn" value={props.activeTurnInputMode} onChange={props.onInputModeChange}
          options={[{ value: 'interrupt', label: 'Interrupt' }, { value: 'steer', label: 'Steer' }]} />
      </div>
    </section>
  )
}
