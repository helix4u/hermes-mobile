/** Send silence without dropping the call, its context, or output playback. */
export function applyMicrophoneMute(stream: MediaStream | null, muted: boolean): void {
  stream?.getAudioTracks().forEach(track => { track.enabled = !muted })
}
