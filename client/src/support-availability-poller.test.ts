import { afterEach, expect, it, vi } from 'vitest'
import { pollSupportAvailability } from './support-availability-poller'

afterEach(() => vi.useRealTimers())
it('discovers a plugin mounted after the connection without publishing provisional absence', async () => {
  vi.useFakeTimers()
  const probe = vi.fn().mockResolvedValueOnce('missing').mockResolvedValueOnce('unknown').mockResolvedValue('available')
  const publish = vi.fn()
  const stop = pollSupportAvailability(probe, publish)
  await vi.advanceTimersByTimeAsync(4_000)
  expect(probe).toHaveBeenCalledTimes(3)
  expect(publish.mock.calls).toEqual([['available']])
  stop()
})
it('bounds startup retries and treats exceptions as unknown, not missing', async () => {
  vi.useFakeTimers()
  const probe = vi.fn().mockRejectedValue(new Error('offline'))
  const publish = vi.fn()
  const stop = pollSupportAvailability(probe, publish)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(probe).toHaveBeenCalledTimes(5)
  expect(publish).not.toHaveBeenCalled()
  stop()
})
it('does not overlap probes or publish late results after a connection change', async () => {
  vi.useFakeTimers()
  let finish!: (value: 'available') => void
  const probe = vi.fn(() => new Promise<'available'>(resolve => { finish = resolve }))
  const publish = vi.fn()
  const stop = pollSupportAvailability(probe, publish)
  await vi.advanceTimersByTimeAsync(120_000)
  expect(probe).toHaveBeenCalledTimes(1)
  stop()
  finish('available')
  await Promise.resolve()
  expect(publish).not.toHaveBeenCalled()
})
