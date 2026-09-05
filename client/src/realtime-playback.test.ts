import { expect, it, vi } from 'vitest'
import { sampleInboundAudio, watchRealtimePlayback } from './realtime-playback'

function fixture() {
  const audio = Object.assign(new EventTarget(), { paused: true, play: vi.fn(async () => { audio.paused = false }) })
  let allowed = true
  const trace = vi.fn(), failed = vi.fn()
  const owner = watchRealtimePlayback(audio as unknown as HTMLAudioElement, () => allowed, trace, failed)
  return { audio, owner, trace, failed, block: () => { allowed = false } }
}
it('recovers one unexpected pause per output buffer, then surfaces failure', async () => {
  const { audio, owner, failed } = fixture()
  owner.begin()
  await Promise.resolve()
  audio.paused = true
  audio.dispatchEvent(new Event('pause'))
  await Promise.resolve()
  expect(audio.play).toHaveBeenCalledTimes(2)
  audio.paused = true
  audio.dispatchEvent(new Event('pause'))
  expect(failed).toHaveBeenCalledOnce()
  owner.dispose()
})
it('never resumes audio after interruption or disposal', () => {
  const { audio, owner, block } = fixture()
  block()
  owner.begin()
  audio.dispatchEvent(new Event('pause'))
  owner.dispose()
  audio.dispatchEvent(new Event('pause'))
  expect(audio.play).not.toHaveBeenCalled()
})
it('surfaces rejected playback instead of claiming to speak', async () => {
  const { audio, owner, failed } = fixture()
  audio.play.mockRejectedValue(new Error('Synthetic output failure'))
  owner.begin()
  await Promise.resolve()
  expect(failed).toHaveBeenCalledOnce()
  owner.dispose()
})

it('samples only inbound audio transport progress', async () => {
  const report = new Map<string, object>([
    ['audio', { type: 'inbound-rtp', kind: 'audio', bytesReceived: 42 }],
    ['video', { type: 'inbound-rtp', kind: 'video', bytesReceived: 1000 }],
    ['out', { type: 'outbound-rtp', kind: 'audio', bytesReceived: 2000 }],
  ])
  const peer = { getStats: vi.fn(async () => report) } as unknown as RTCPeerConnection
  expect(await sampleInboundAudio(peer)).toBe(42)
})

it('watches every output buffer for progress and recovers one stalled stream', async () => {
  const { audio, trace, failed } = fixture()
  let allowed = true
  const samples = [10, 10, 10]
  const rebind = vi.fn()
  const owner = watchRealtimePlayback(
    audio as unknown as HTMLAudioElement,
    () => allowed,
    trace,
    failed,
    { sample: async () => samples.shift() ?? 10, rebind, settle: async () => undefined },
  )
  owner.begin()
  for (let index = 0; index < 12; index++) await Promise.resolve()
  expect(rebind).toHaveBeenCalledOnce()
  expect(trace).toHaveBeenCalledWith('output.media_stalled')
  expect(failed).toHaveBeenCalledOnce()
  allowed = false
  owner.dispose()
})

it('keeps watching a progressing output buffer without rebinding it', async () => {
  const { audio, trace, failed } = fixture()
  let allowed = true
  const samples = [10, 20, 20]
  const rebind = vi.fn()
  const owner = watchRealtimePlayback(
    audio as unknown as HTMLAudioElement,
    () => allowed,
    trace,
    failed,
    {
      sample: async () => {
        const value = samples.shift() ?? 20
        if (!samples.length) queueMicrotask(() => { allowed = false })
        return value
      },
      rebind,
      settle: async () => undefined,
    },
  )
  owner.begin()
  for (let index = 0; index < 8; index++) await Promise.resolve()
  expect(trace).toHaveBeenCalledWith('output.media_progress')
  expect(rebind).not.toHaveBeenCalled()
  expect(failed).not.toHaveBeenCalled()
  owner.dispose()
})

it('does not fail when WebRTC stats are unavailable', async () => {
  const { audio, trace, failed } = fixture()
  const owner = watchRealtimePlayback(
    audio as unknown as HTMLAudioElement,
    () => true,
    trace,
    failed,
    { sample: async () => null, rebind: vi.fn(), settle: async () => undefined },
  )
  owner.begin()
  for (let index = 0; index < 4; index++) await Promise.resolve()
  expect(trace).toHaveBeenCalledWith('output.media_unobservable')
  expect(failed).not.toHaveBeenCalled()
  owner.dispose()
})
