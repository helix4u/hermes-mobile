import { expect, it, vi } from 'vitest'
import { observeSpeechPlaybackStart } from './speech-playback-start'

it('waits for playback and never restarts a balloon on resume', () => {
  const audio = new EventTarget()
  const start = vi.fn()
  const dispose = observeSpeechPlaybackStart(audio, () => true, start)
  for (const event of ['loadedmetadata', 'canplay', 'play']) audio.dispatchEvent(new Event(event))
  expect(start).not.toHaveBeenCalled()
  audio.dispatchEvent(new Event('playing'))
  audio.dispatchEvent(new Event('pause'))
  audio.dispatchEvent(new Event('playing'))
  expect(start).toHaveBeenCalledTimes(1)
  dispose()
})

it('ignores obsolete and cancelled audio', () => {
  const audio = new EventTarget()
  const start = vi.fn()
  let current = false
  const dispose = observeSpeechPlaybackStart(audio, () => current, start)
  audio.dispatchEvent(new Event('playing'))
  current = true
  dispose()
  audio.dispatchEvent(new Event('playing'))
  expect(start).not.toHaveBeenCalled()
})
