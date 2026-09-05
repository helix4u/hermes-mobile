import { describe, expect, it, vi } from 'vitest'
import { applyMicrophoneMute } from './realtime-microphone'
import { LiveVoiceMicrophoneButton } from './components/LiveVoiceMicrophoneButton'

describe('live microphone mute', () => {
  it('disables all outgoing audio tracks, permits unmute, and tolerates reconnect gaps', () => {
    const tracks = [{ enabled: true, stop: vi.fn() }, { enabled: true, stop: vi.fn() }]
    const stream = { getAudioTracks: () => tracks } as unknown as MediaStream
    applyMicrophoneMute(stream, true)
    expect(tracks.every(track => !track.enabled)).toBe(true)
    applyMicrophoneMute(null, true)
    applyMicrophoneMute(stream, false)
    expect(tracks.every(track => track.enabled)).toBe(true)
    expect(tracks[0].stop).not.toHaveBeenCalled()
  })
  it('shows the actual state and toggles input without ending the call', () => {
    const onChange = vi.fn()
    const button = LiveVoiceMicrophoneButton({ muted: true, onChange })
    expect(button.props['aria-pressed']).toBe(true)
    expect(button.props['aria-label']).toBe('Unmute live voice microphone')
    button.props.onClick()
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
