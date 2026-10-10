import { describe, expect, test } from 'vitest'
import { VoiceCaptureLease } from './voice-capture-lease'

describe('independent voice capture ownership', () => {
  test('reserves startup synchronously and consumes an early Stop exactly once', () => {
    const phases: string[] = []
    const lease = new VoiceCaptureLease(phase => phases.push(phase))
    const owner = lease.begin()!
    expect(lease.begin()).toBeNull()
    expect(lease.requestStop()).toBeNull()
    expect(lease.shouldStop(owner)).toBe(true)
    expect(lease.recording(owner)).toBe(true)
    expect(lease.requestStop()).toBe(owner)
    expect(lease.requestStop()).toBeNull()
    expect(lease.begin()).toBeNull()
    lease.finish(owner)
    expect(phases).toEqual(['starting', 'recording', 'transcribing', 'idle'])
    expect(lease.begin()).not.toBe(owner)
  })

  test('defers speech until capture and transcription release their floor', async () => {
    const lease = new VoiceCaptureLease(() => {})
    const owner = lease.begin()!
    let played = false
    const playback = lease.waitUntilIdle().then(() => { played = true })
    lease.recording(owner)
    lease.requestStop()
    await Promise.resolve()
    expect(played).toBe(false)
    lease.finish(owner)
    await playback
    expect(played).toBe(true)
  })

  test('late cleanup cannot release a newer capture or its waiting speech', async () => {
    const lease = new VoiceCaptureLease(() => {})
    const old = lease.begin()!
    const playback = lease.waitUntilIdle()
    lease.finish(old)
    const next = lease.begin()!
    lease.finish(old)
    expect(lease.phase).toBe('starting')
    expect(lease.owns(next)).toBe(true)
    let played = false
    const settled = playback.then(() => { played = true })
    await Promise.resolve()
    expect(played).toBe(false)
    lease.finish(next)
    await settled
    expect(played).toBe(true)
  })
})
