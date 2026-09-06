/** Input selection and content-free diagnostics. No audio or transcript storage. */
export interface MicrophoneChoice { id: string; label: string }

export class MicrophoneInputError extends Error {
  constructor(readonly reason: 'unavailable' | 'permission' | 'busy' | 'failed', message: string) {
    super(message)
    this.name = 'MicrophoneInputError'
  }
}

export function microphoneChoices(devices: readonly MediaDeviceInfo[]): MicrophoneChoice[] {
  const seen = new Set(['default', ''])
  const choices = [{ id: '', label: 'System default' }]
  const defaultDevice = devices.find(device => device.kind === 'audioinput' && device.deviceId === 'default')
  if (defaultDevice?.label && !/^default$/i.test(defaultDevice.label.trim())) {
    choices[0].label = `System default: ${defaultDevice.label.replace(/^default\s*[-:]?\s*/i, '')}`
  }
  for (const device of devices) {
    if (device.kind !== 'audioinput' || seen.has(device.deviceId)) continue
    seen.add(device.deviceId)
    choices.push({ id: device.deviceId, label: device.label || `Microphone ${choices.length}` })
  }
  return choices
}

export function microphoneConstraints(id = '', noiseSuppression = true): MediaStreamConstraints {
  return { audio: { echoCancellation: true, noiseSuppression,
    ...(id && id !== 'default' ? { deviceId: { exact: id } } : {}) } }
}

/** Do not silently substitute another device when an explicitly selected input vanished. */
export async function openMicrophone(id = '', media = navigator.mediaDevices, noiseSuppression = true): Promise<MediaStream> {
  // Browser default is a moving OS route, not a hardware identifier. Do not
  // pin a former Bluetooth device or compare its concrete ID to this alias.
  if (id === 'default') id = ''
  let stream: MediaStream
  try {
    stream = await media.getUserMedia(microphoneConstraints(id, noiseSuppression))
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
    if (name === 'OverconstrainedError' || name === 'NotFoundError') {
      throw new MicrophoneInputError('unavailable', 'Selected microphone is unavailable. Choose a connected input or System default in Live voice settings.')
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new MicrophoneInputError('permission', 'Microphone access was denied. Allow microphone access for Hermes Mobile and try again.')
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      throw new MicrophoneInputError('busy', 'Microphone could not start. Check your audio device and whether another app is recording.')
    }
    throw new MicrophoneInputError('failed', 'Could not open the microphone. Check Live voice settings and try again.')
  }
  const track = stream.getAudioTracks()[0]
  if (!track || track.readyState === 'ended' || (id && track.getSettings().deviceId !== id)) {
    stream.getTracks().forEach(item => item.stop())
    throw new MicrophoneInputError('unavailable', 'Selected microphone is unavailable. Choose a connected input or System default in Live voice settings.')
  }
  return stream
}

export interface InputSample { level: number; bytes: number; available: boolean }
export function inputSample(stats: RTCStatsReport): InputSample {
  let level = 0, bytes = 0, available = false
  stats.forEach(row => {
    if (row.type === 'media-source' && row.kind === 'audio' && typeof row.audioLevel === 'number') {
      available = true
      level = Math.max(level, Math.min(1, Math.max(0, row.audioLevel)))
    }
    if (row.type === 'outbound-rtp' && (row.kind === 'audio' || row.mediaType === 'audio')) {
      bytes += Math.max(0, Number(row.bytesSent) || 0)
    }
  })
  return { level, bytes, available }
}

export type InputPhase = 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'speaking'
export function inputProgress(phase: string, ageMs: number, muted: boolean, signal: boolean): string {
  if (muted) return 'Microphone muted'
  const seconds = Math.floor(Math.max(0, ageMs) / 1000)
  if (phase === 'hearing') return 'Speech detected'
  if (phase === 'transcribing') return seconds >= 12
    ? `Still waiting for transcription (${seconds}s). You can end and retry.` : 'Transcribing your speech'
  if (phase === 'thinking') return seconds >= 8 ? `Waiting for response (${seconds}s)` : 'Waiting for response'
  if (phase === 'speaking') return 'Pet speaking'
  if (phase === 'listening') return signal ? 'Microphone signal detected' : 'Listening for speech'
  return phase === 'connecting' ? 'Connecting voice' : ''
}
