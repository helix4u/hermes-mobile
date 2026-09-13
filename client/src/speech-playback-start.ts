/** Observe actual media playback, not synthesis completion or play() acceptance. */
export function observeSpeechPlaybackStart(
  audio: EventTarget,
  current: () => boolean,
  onStart: () => void,
): () => void {
  let delivered = false
  let disposed = false
  const playing = () => {
    if (disposed || delivered || !current()) return
    delivered = true
    onStart()
  }
  audio.addEventListener('playing', playing)
  return () => {
    disposed = true
    audio.removeEventListener('playing', playing)
  }
}
