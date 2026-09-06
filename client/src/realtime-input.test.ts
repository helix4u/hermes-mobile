import { describe, expect, it, vi } from 'vitest'
import { inputProgress, inputSample, microphoneChoices, microphoneConstraints, openMicrophone } from './realtime-input'
import { normalizeRealtimeSettings, realtimeSettingsParams } from './pet-realtime-settings'

describe('Realtime microphone', () => {
  it('keeps the default route dynamic when Bluetooth hardware changes', async () => {
    const track = { readyState: 'live', getSettings: () => ({ deviceId: 'new-headset' }), stop: vi.fn() }
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] }
    const media = { getUserMedia: vi.fn().mockResolvedValue(stream) }
    expect(await openMicrophone('default', media as unknown as MediaDevices)).toBe(stream)
    expect(media.getUserMedia).toHaveBeenCalledWith(microphoneConstraints(''))
    expect(track.stop).not.toHaveBeenCalled()
    expect(microphoneChoices([{ kind: 'audioinput', deviceId: 'default', label: 'Default - Test Headset' }] as MediaDeviceInfo[])[0].label).toBe('System default: Test Headset')
  })
  it('lists detected inputs, deduplicates defaults and labels permission-limited inputs', () => {
    expect(microphoneChoices([
      { kind: 'audioinput', deviceId: 'default', label: 'Default' },
      { kind: 'audiooutput', deviceId: 'out', label: 'Output' },
      { kind: 'audioinput', deviceId: 'usb', label: 'USB microphone' },
      { kind: 'audioinput', deviceId: 'usb', label: 'USB microphone' },
      { kind: 'audioinput', deviceId: 'unknown', label: '' },
    ] as MediaDeviceInfo[])).toEqual([{ id: '', label: 'System default' },
      { id: 'usb', label: 'USB microphone' }, { id: 'unknown', label: 'Microphone 2' }])
  })
  it('requires the selected device, without silently falling back', async () => {
    const stop = vi.fn()
    const track = { readyState: 'live', getSettings: () => ({ deviceId: 'wrong' }), stop }
    const media = { getUserMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [track], getTracks: () => [track] }) }
    await expect(openMicrophone('usb', media as unknown as MediaDevices)).rejects.toThrow('Selected microphone')
    expect(media.getUserMedia).toHaveBeenCalledWith(microphoneConstraints('usb'))
    expect(stop).toHaveBeenCalledOnce()
  })
  it('keeps input identity and diagnostics out of provider parameters', () => {
    const settings = normalizeRealtimeSettings({ microphoneId: 'usb', diagnostics: true })
    expect(settings.microphoneId).toBe('usb')
    expect(realtimeSettingsParams(settings)).not.toHaveProperty('microphoneId')
    expect(realtimeSettingsParams(settings)).not.toHaveProperty('diagnostics')
    expect(microphoneConstraints('')).toEqual({ audio: { echoCancellation: true, noiseSuppression: true } })
  })
  it.each(['OverconstrainedError', 'NotFoundError'])('explains a missing input even when %s has no message', async name => {
    const media = { getUserMedia: vi.fn().mockRejectedValue(new DOMException('', name)) }
    await expect(openMicrophone('missing', media as unknown as MediaDevices)).rejects.toThrow('Selected microphone is unavailable')
    expect(media.getUserMedia).toHaveBeenCalledOnce()
  })
  it.each([
    ['NotAllowedError', 'Microphone access was denied'],
    ['NotReadableError', 'Microphone could not start'],
    ['UnknownError', 'Could not open the microphone'],
  ])('explains %s without leaking device details', async (name, message) => {
    const media = { getUserMedia: vi.fn().mockRejectedValue(new DOMException('', name)) }
    await expect(openMicrophone('', media as unknown as MediaDevices)).rejects.toThrow(message)
    expect(media.getUserMedia).toHaveBeenCalledOnce()
  })
  it('distinguishes input capture from received audio without retaining content', () => {
    expect(inputSample(new Map([
      ['source', { type: 'media-source', kind: 'audio', audioLevel: 0.25 }],
      ['out', { type: 'outbound-rtp', kind: 'audio', bytesSent: 1000 }],
      ['in', { type: 'inbound-rtp', kind: 'audio', audioLevel: 1, bytesSent: 5000 }],
    ]) as unknown as RTCStatsReport)).toEqual({ level: 0.25, bytes: 1000, available: true })
  })
  it('reports ASR and response waits, never pretending they are listening', () => {
    expect(inputProgress('transcribing', 15000, false, false)).toContain('transcription (15s)')
    expect(inputProgress('thinking', 10000, false, false)).toBe('Waiting for response (10s)')
    expect(inputProgress('hearing', 100, false, true)).toBe('Speech detected')
    expect(inputProgress('listening', 0, true, true)).toBe('Microphone muted')
  })
})
