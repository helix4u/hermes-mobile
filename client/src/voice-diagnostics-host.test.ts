import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HermesTransport } from './transport/hermes-transport'
import { sanitizeVoiceDiagnostic, VoiceDiagnosticsHost, VOICE_DIAGNOSTICS_ENDPOINT } from './voice-diagnostics-host'

const event = { phase: 'review.unverified', elapsedMs: 10, epoch: 2, muted: false, tracks: 1 }
function transport(profile = 'default') {
  return { kind: 'native', connection: { id: 'synthetic', baseUrl: 'https://synthetic.invalid', profile },
    requestJson: vi.fn().mockResolvedValue({ accepted: 1 }) } as unknown as HermesTransport
}

describe('opt-in host voice diagnostics', () => {
  let uploader: VoiceDiagnosticsHost
  beforeEach(() => { vi.useFakeTimers(); uploader = new VoiceDiagnosticsHost() })
  afterEach(() => { uploader.dispose(); vi.useRealTimers() })

  it('does nothing before opt-in and drops queued evidence on opt-out', async () => {
    const host = transport()
    uploader.configure({ transport: host, enabled: false })
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(10000)
    expect(host.requestJson).not.toHaveBeenCalled()
    uploader.configure({ transport: host, enabled: true })
    uploader.record(event)
    uploader.configure({ transport: host, enabled: false })
    await vi.advanceTimersByTimeAsync(10000)
    expect(host.requestJson).not.toHaveBeenCalled()
  })

  it('batches only allowlisted fields and supplies selected profile without identity leakage', async () => {
    const host = transport('synthetic')
    uploader.configure({ transport: host, enabled: true, build: '0.1.0+abcdef0' })
    uploader.record({ ...event, transcript: 'private', token: 'secret' } as typeof event)
    uploader.record({ ...event, phase: 'tool.read_attached_context.completed' })
    await vi.advanceTimersByTimeAsync(9999)
    expect(host.requestJson).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(host.requestJson).toHaveBeenCalledWith(`${VOICE_DIAGNOSTICS_ENDPOINT}?profile=synthetic`,
      { schema: 1, optIn: true, transport: 'native', build: '0.1.0+abcdef0', entries: [event, { ...event, phase: 'tool.read_attached_context.completed' }] },
      { method: 'POST', timeoutMs: 5000 })
    expect(JSON.stringify(vi.mocked(host.requestJson).mock.calls[0][1])).not.toMatch(/private|secret|synthetic/)
  })

  it('drops old connection and profile batches on replacement', async () => {
    const first = transport('first')
    const second = transport('second')
    uploader.configure({ transport: first, enabled: true })
    uploader.record(event)
    uploader.configure({ transport: second, enabled: true })
    uploader.record({ ...event, epoch: 3 })
    await vi.advanceTimersByTimeAsync(10000)
    expect(first.requestJson).not.toHaveBeenCalled()
    expect(second.requestJson).toHaveBeenCalledOnce()
    expect(vi.mocked(second.requestJson).mock.calls[0][1]?.entries).toEqual([{ ...event, epoch: 3 }])
  })

  it('rejects in-place profile mutation before sending a queued batch', async () => {
    const host = transport('first')
    uploader.configure({ transport: host, enabled: true })
    uploader.record(event)
    host.connection.profile = 'second'
    await vi.advanceTimersByTimeAsync(10000)
    expect(host.requestJson).not.toHaveBeenCalled()
  })

  it.each(['404 missing old host', '401 authentication', '429 rate limited', '503 offline'])('disables uploads without retries on %s', async reason => {
    const host = transport()
    vi.mocked(host.requestJson).mockRejectedValue(new Error(reason))
    uploader.configure({ transport: host, enabled: true })
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(10000)
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(600000)
    expect(host.requestJson).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a bounded newest-event ring and limits request cadence', async () => {
    const host = transport()
    uploader.configure({ transport: host, enabled: true })
    for (let epoch = 0; epoch < 1000; epoch++) uploader.record({ ...event, epoch })
    await vi.advanceTimersByTimeAsync(10000)
    const batch = vi.mocked(host.requestJson).mock.calls[0][1]?.entries as typeof event[]
    expect(batch).toHaveLength(32)
    expect(batch[0].epoch).toBe(968)
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(9999)
    expect(host.requestJson).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(host.requestJson).toHaveBeenCalledTimes(2)
  })

  it('never overlaps requests and a late old failure cannot disable the replacement', async () => {
    let reject!: (reason: Error) => void
    const first = transport('first')
    vi.mocked(first.requestJson).mockReturnValue(new Promise((_resolve, fail) => { reject = fail }))
    uploader.configure({ transport: first, enabled: true })
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(10000)
    const second = transport('second')
    uploader.configure({ transport: second, enabled: true })
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(60000)
    expect(second.requestJson).not.toHaveBeenCalled()
    reject(new Error('old failure'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(second.requestJson).toHaveBeenCalledOnce()
  })

  it('disposes without flushing or retaining timers', async () => {
    const host = transport()
    uploader.configure({ transport: host, enabled: true })
    uploader.record(event)
    uploader.dispose()
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(10000)
    expect(host.requestJson).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores private build hints and resumes only after a new opt-in context', async () => {
    const host = transport()
    vi.mocked(host.requestJson).mockRejectedValueOnce(new Error('offline'))
    uploader.configure({ transport: host, enabled: true, build: 'private-host-label' })
    uploader.record(event)
    await vi.advanceTimersByTimeAsync(10000)
    expect(vi.mocked(host.requestJson).mock.calls[0][1]).not.toHaveProperty('build')
    uploader.configure({ transport: host, enabled: false })
    uploader.configure({ transport: host, enabled: true })
    uploader.record({ ...event, epoch: 3 })
    await vi.advanceTimersByTimeAsync(10000)
    expect(host.requestJson).toHaveBeenCalledTimes(2)
    expect(vi.mocked(host.requestJson).mock.calls[1][1]?.entries).toEqual([{ ...event, epoch: 3 }])
  })

  it('clamps numeric fields and rejects unknown phases and invalid numbers', () => {
    expect(sanitizeVoiceDiagnostic({ ...event, elapsedMs: 999999, epoch: -1, tracks: 99 })).toEqual({ ...event, elapsedMs: 120000, epoch: 0, tracks: 32 })
    expect(sanitizeVoiceDiagnostic({ ...event, phase: 'tool.private_args.started' })).toBeNull()
    expect(sanitizeVoiceDiagnostic({ ...event, elapsedMs: Number.NaN })).toBeNull()
    expect(sanitizeVoiceDiagnostic({ ...event, tracks: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it.each(['idle', 'interrupted', 'awaiting_transcript', 'content_mismatch', 'ready', 'awaiting_audio'])('allows bounded review state %s', state => {
    const entry = { ...event, phase: `review.state.${state}` }
    expect(sanitizeVoiceDiagnostic(entry)).toEqual(entry)
  })
})
