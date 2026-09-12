import { afterEach, describe, expect, test, vi } from 'vitest'
import { appendCronOutput, CronClient, cronBusy, cronSchedule, cronStatus, pollCron, type CronOutputPage } from './cron'
import type { HermesTransport } from './transport/hermes-transport'

function fixture() {
  const requestJson = vi.fn().mockResolvedValue([])
  const transport = { connection: { profile: 'writer' }, requestJson } as unknown as HermesTransport
  return { requestJson, transport, client: new CronClient(transport, 'writer') }
}
afterEach(() => vi.useRealTimers())
describe('profile cron parity', () => {
  test('saved output uses profile, opaque identity and revision-bound continuation', async () => {
    const { client, requestJson } = fixture()
    await client.outputs('job/one', 'older')
    await client.output('job/one', { id: 'output-one', version: '100:8', size_bytes: 8 }, 4)
    expect(requestJson.mock.calls.map(call => call[0])).toEqual([
      '/api/cron/jobs/job%2Fone/outputs?profile=writer&limit=20&before=older',
      '/api/cron/jobs/job%2Fone/outputs/output-one?profile=writer&offset=4&version=100%3A8',
    ])
  })
  test('output pages cannot combine profiles, revisions or unrelated offsets', () => {
    const first: CronOutputPage = { id: 'out', job_id: 'job', profile: 'writer', version: 'v1', content: 'first', offset: 0, next_offset: 5, size_bytes: 9 }
    const next = { ...first, content: 'next', offset: 5, next_offset: null }
    expect(appendCronOutput(first, next).content).toBe('firstnext')
    for (const change of [{ profile: 'default' }, { job_id: 'other' }, { version: 'v2' }, { offset: 6 }]) {
      expect(() => appendCronOutput(first, { ...next, ...change })).toThrow('another run')
    }
  })
  test('job list, history and live output all use the exact profile', async () => {
    const { client, requestJson } = fixture()
    await client.list(); await client.runs('job/one'); await client.messages('run/one')
    expect(requestJson.mock.calls.map(call => call[0])).toEqual([
      '/api/cron/jobs?profile=writer', '/api/cron/jobs/job%2Fone/runs?profile=writer&limit=20',
      '/api/sessions/run%2Fone/messages?profile=writer&limit=100&order=latest',
    ])
  })
  test('real action contract includes exact owner and never auto-retries failure', async () => {
    const { client, requestJson } = fixture()
    requestJson.mockRejectedValueOnce(new Error('lost response'))
    await expect(client.action('id', 'trigger')).rejects.toThrow('lost response')
    expect(requestJson).toHaveBeenCalledTimes(1)
    expect(requestJson).toHaveBeenCalledWith('/api/cron/jobs/id/trigger?profile=writer', {}, { timeoutMs: 120_000 })
  })
  test('removing scheduled work uses the profile-scoped REST delete route', async () => {
    const { client, requestJson } = fixture()
    await client.action('job/one', 'remove')
    expect(requestJson).toHaveBeenCalledWith(
      '/api/cron/jobs/job%2Fone?profile=writer',
      undefined,
      { method: 'DELETE' },
    )
  })
  test('one pending action per job prevents duplicate clicks', async () => {
    const { client, requestJson } = fixture()
    let finish!: (value: unknown) => void
    requestJson.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const running = client.action('id', 'trigger')
    await expect(client.action('id', 'trigger')).rejects.toThrow('already in progress')
    expect(requestJson).toHaveBeenCalledTimes(1)
    finish({ id: 'id' }); await running
  })
  test('new schedules use local delivery and selected profile, never implicit execution', async () => {
    const { client, requestJson, transport } = fixture()
    await client.create(' Job ', ' Prompt ', 'every 2h')
    expect(requestJson).toHaveBeenCalledWith('/api/cron/jobs?profile=writer', { name: 'Job', prompt: 'Prompt', schedule: 'every 2h', deliver: 'local' })
    expect(() => new CronClient(transport, 'other')).toThrow('does not match')
  })
  test('polling is single-flight and a disposed profile cannot publish its late result', async () => {
    vi.useFakeTimers()
    let finish!: (value: string) => void
    const read = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
    const publish = vi.fn()
    const stop = pollCron(read, publish, vi.fn())
    await vi.advanceTimersByTimeAsync(12_000)
    expect(read).toHaveBeenCalledTimes(1)
    stop(); finish('old profile'); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(12_000)
    expect(publish).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledTimes(1)
  })
  test('scheduler claims are not misrepresented as proven running progress', () => {
    expect(cronStatus({ id: 'j', run_claim: { at: 'old' } })).toBe('Claimed by scheduler')
    expect(cronStatus({ id: 'j', enabled: false })).toBe('Paused')
    expect(cronSchedule({ id: 'j', schedule: { display: 'Every two hours' } })).toBe('Every two hours')
    expect(cronStatus({ id: 'j', latest_execution: { status: 'running' } })).toBe('Running on host')
    expect(cronBusy({ id: 'j', latest_execution: { status: 'running' } })).toBe(true)
    expect(cronBusy({ id: 'j', latest_execution: { status: 'completed' } })).toBe(false)
  })
})
