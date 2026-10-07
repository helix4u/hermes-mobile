import { describe, expect, it } from 'vitest'
import { SpeechBackgroundLease } from './speech-background'

describe('speech background queue lifetime', () => {
  it('retains once through multiple clips and releases on pause or completion', async () => {
    const calls: string[] = []
    const lease = new SpeechBackgroundLease({
      retainSpeechQueue: async () => { calls.push('retain') },
      releaseSpeechQueue: async () => { calls.push('release') },
    }, () => { throw new Error('Unexpected failure') })
    await lease.setActive(true)
    await lease.setActive(true)
    expect(calls).toEqual(['retain'])
    await lease.setActive(false)
    await lease.setActive(true)
    await lease.setActive(false)
    expect(calls).toEqual(['retain', 'release', 'retain', 'release'])
  })

  it('releases an in-flight retain when Stop or unmount wins', async () => {
    let finish!: () => void
    const retain = new Promise<void>(resolve => { finish = resolve })
    const calls: string[] = []
    const lease = new SpeechBackgroundLease({
      retainSpeechQueue: async () => { calls.push('retain'); await retain },
      releaseSpeechQueue: async () => { calls.push('release') },
    }, () => {})
    const started = lease.setActive(true)
    await Promise.resolve()
    const stopped = lease.setActive(false)
    finish()
    await Promise.all([started, stopped])
    expect(calls).toEqual(['retain', 'release'])
  })

  it('reports failure and allows a later retry without claiming retained state', async () => {
    let attempts = 0
    const errors: unknown[] = []
    const ids: string[] = []
    const lease = new SpeechBackgroundLease({
      retainSpeechQueue: async ({ leaseId }) => {
        ids.push(leaseId)
        if (++attempts === 1) throw new Error('Foreground service unavailable')
      },
      releaseSpeechQueue: async ({ leaseId }) => { ids.push(leaseId) },
    }, error => { errors.push(error) })
    await lease.setActive(true)
    await lease.setActive(true)
    await lease.setActive(false)
    expect(errors).toHaveLength(1)
    expect(new Set(ids).size).toBe(1)
    expect(attempts).toBe(2)
  })
})
