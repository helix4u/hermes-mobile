interface LiveVoiceMicrophoneButtonProps {
  muted: boolean
  onChange: (muted: boolean) => void
  className?: string
  compact?: boolean
}

export function LiveVoiceMicrophoneButton({ muted, onChange, className = '', compact = false }: LiveVoiceMicrophoneButtonProps) {
  return (
    <button
      aria-label={muted ? 'Unmute live voice microphone' : 'Mute live voice microphone'}
      aria-pressed={muted}
      className={`live-voice-mic ${compact ? 'compact' : ''} ${className}`}
      title={muted ? 'Microphone muted. Tap to unmute.' : 'Microphone on. Tap to mute.'}
      onClick={() => onChange(!muted)}
      type="button"
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        {muted && <path d="m3 3 18 18" />}
      </svg>
      {!compact && <span>{muted ? 'Mic muted' : 'Mic on'}</span>}
    </button>
  )
}
