import { describe, expect, it, vi } from 'vitest'
import {
  clearAcceptedSidechat,
  queuedSupportMutation,
  SupportQueueClient,
  supportJobCompletion,
  supportJobGroups,
  supportQueueActionDisabled,
  supportQueueScope,
} from './support-queue'
import type { HermesTransport } from './transport/hermes-transport'

type Request = HermesTransport['requestJson']
const firstId = '111111111111'
const secondId = '222222222222'
const thirdId = '333333333333'
const threadId = '100000000000000001'
const path = `/threads/${threadId}/agent-chat`
const scope = supportQueueScope('synthetic-connection', 'https://synthetic.invalid', 'support')

function client() {
  let serial = 0
  return new SupportQueueClient(scope, () => `synthetic-intent-${++serial}`)
}

describe('Support queue intent admission', () => {
  it('admits once across concurrent identical submissions and freezes the input', async () => {
    const queue = client()
    let resolve!: (value: unknown) => void
    const request = vi.fn(() => new Promise(done => { resolve = done })) as unknown as Request
    const body = { message: 'synthetic question', settings: { profile: 'support' } }
    const first = queue.submit(request, path, body, 'POST', 'Sidechat', true)
    const duplicate = queue.submit(request, path, { settings: { profile: 'support' }, message: 'synthetic question' }, 'POST', 'Sidechat', true)
    body.settings.profile = 'other-profile'
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.mocked(request).mock.calls[0][1]).toEqual({ message: 'synthetic question', settings: { profile: 'support' }, async: true, request_id: 'synthetic-intent-1' })
    resolve({ id: firstId, status: 'queued', thread_id: threadId })
    await Promise.all([first, duplicate])
    expect(queue.snapshot().receipts).toHaveLength(1)
    expect(queue.snapshot().unconfirmed).toEqual([])
  })

  it('retains an uncertain intent and uses the same receipt ID only on explicit retry', async () => {
    const queue = client()
    const request = vi.fn().mockRejectedValueOnce(new Error('synthetic response timeout'))
      .mockResolvedValueOnce({ id: firstId, status: 'completed', result: { saved: true } })
    await expect(queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', true)).rejects.toThrow('timeout')
    expect(request).toHaveBeenCalledTimes(1)
    expect(queue.snapshot().unconfirmed[0].id).toBe('synthetic-intent-1')
    const retry = await queue.retry(request, 'synthetic-intent-1')
    expect(retry.message).toBe('synthetic')
    expect(retry.targetId).toBe(threadId)
    expect(request.mock.calls.map(call => call[1].request_id)).toEqual(['synthetic-intent-1', 'synthetic-intent-1'])
    expect(queue.snapshot().receipts[0].job.status).toBe('completed')
    expect(queue.snapshot().unconfirmed).toEqual([])
  })

  it('retains acceptance uncertainty when a queue-capable host returns no receipt', async () => {
    const queue = client()
    const request = vi.fn().mockResolvedValue({ saved: true })
    await expect(queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', true)).rejects.toThrow('did not return an operation receipt')
    expect(queue.snapshot().unconfirmed[0].id).toBe('synthetic-intent-1')
    expect(queue.snapshot().receipts).toEqual([])
  })

  it('reconciles a lost response with the matching authoritative receipt without resending', async () => {
    const queue = client()
    const request = vi.fn().mockRejectedValue(new Error('synthetic timeout'))
    await expect(queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', true)).rejects.toThrow('timeout')
    queue.receive({ id: firstId, status: 'queued', request_id: 'synthetic-intent-1', thread_id: threadId })
    expect(queue.snapshot().unconfirmed).toEqual([])
    expect(queue.snapshot().receipts[0].submitted).toBe(true)
    expect(queue.snapshot().receipts[0].sidechat).toEqual({ targetId: threadId, message: 'synthetic' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not retry an uncertain dispatch to an older host', async () => {
    const queue = client()
    const request = vi.fn().mockRejectedValue(new Error('synthetic timeout'))
    await expect(queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', false)).rejects.toThrow('timeout')
    await expect(queue.retry(request, 'synthetic-intent-1')).rejects.toThrow('cannot be safely retried')
    await expect(queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', false)).rejects.toThrow('does not support safe')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('allocates a new intent for a deliberate rerun after acceptance', async () => {
    const queue = client()
    const request = vi.fn().mockResolvedValue({ id: firstId, status: 'completed' })
    await queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', true)
    await queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', true)
    expect(request.mock.calls.map(call => call[1].request_id)).toEqual(['synthetic-intent-1', 'synthetic-intent-2'])
  })

  it('isolates connection, host and profile receipts, including late completion', async () => {
    const old = client()
    const other = new SupportQueueClient(supportQueueScope('synthetic-connection', 'https://other.invalid', 'support'))
    const profile = new SupportQueueClient(supportQueueScope('synthetic-connection', 'https://synthetic.invalid', 'other'))
    expect(new Set([old.scope, other.scope, profile.scope]).size).toBe(3)
    let resolve!: (value: unknown) => void
    const request = vi.fn(() => new Promise(done => { resolve = done })) as unknown as Request
    const pending = old.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', true)
    resolve({ id: firstId, status: 'queued' })
    await pending
    expect(old.snapshot().receipts).toHaveLength(1)
    expect(other.snapshot().receipts).toEqual([])
    expect(profile.snapshot().receipts).toEqual([])
  })

  it('retains all bulk admission IDs independently of history size', async () => {
    const queue = client()
    const jobs = Array.from({ length: 100 }, (_, index) => ({ id: index.toString(16).padStart(12, '0'), status: 'queued' }))
    const request = vi.fn().mockResolvedValue({ jobs, started: 100 })
    await queue.submit(request, '/sync', { thread_ids: [threadId] }, 'POST', 'Sync', true)
    expect(queue.snapshot().receipts).toHaveLength(100)
  })

  it('retains newest completed history and never evicts active receipts', () => {
    const queue = client()
    queue.receive({ id: firstId, status: 'running' })
    const jobs = Array.from({ length: 80 }, (_, index) => ({
      id: index.toString(16).padStart(12, '0'), status: 'completed',
      created_at: new Date(Date.UTC(2026, 9, 6) + index * 1000).toISOString(),
    })).reverse()
    queue.receive({ jobs })
    expect(queue.snapshot().receipts).toHaveLength(51)
    expect(queue.snapshot().receipts.some(item => item.job.id === firstId)).toBe(true)
    expect(queue.snapshot().receipts.some(item => item.job.id === jobs[0].id)).toBe(true)
    expect(queue.snapshot().receipts.some(item => item.job.id === jobs[79].id)).toBe(false)
  })

  it('keeps legacy immediate result shapes usable', async () => {
    const queue = client()
    const request = vi.fn().mockResolvedValue({ filename: 'synthetic-backup.json', saved: true })
    await expect(queue.submit(request, '/portable/backup', {}, 'POST', 'Backup', false))
      .resolves.toEqual({ filename: 'synthetic-backup.json', saved: true })
    expect(queue.snapshot().receipts).toEqual([])
  })
})

describe('authoritative Support receipt polling', () => {
  it('polls known IDs single-flight, keeps running separate, and does not regress terminal state', async () => {
    const queue = client()
    queue.receive({ id: firstId, status: 'running' }, 'Investigation', true)
    queue.receive({ jobs: [{ id: secondId, status: 'queued' }, { id: thirdId, status: 'completed' }] })
    const request = vi.fn().mockResolvedValueOnce({ id: firstId, status: 'completed', result: { saved: true } })
      .mockResolvedValueOnce({ id: secondId, status: 'running' })
    await Promise.all([queue.poll(request), queue.poll(request)])
    expect(request.mock.calls.map(call => call[0])).toEqual([`/api/plugins/support-ops/jobs/${firstId}`, `/api/plugins/support-ops/jobs/${secondId}`])
    queue.receive({ id: firstId, status: 'queued' })
    queue.receive({ id: secondId, status: 'queued' })
    expect(queue.snapshot().receipts[0].job.status).toBe('completed')
    const groups = supportJobGroups(queue.snapshot().receipts.map(item => item.job))
    expect(groups.running.map(job => job.id)).toEqual([secondId])
    expect(groups.queued).toEqual([])
  })

  it('retains accepted status after a refresh failure without dispatching again', async () => {
    const queue = client()
    const request = vi.fn().mockResolvedValueOnce({ id: firstId, status: 'queued' })
      .mockRejectedValueOnce(new Error('synthetic read failure'))
    await queue.submit(request, path, { message: 'synthetic' }, 'POST', 'Sidechat', true)
    await queue.poll(request)
    expect(queue.snapshot().receipts[0].job.status).toBe('queued')
    expect(queue.snapshot().receipts[0].pollError).toBe('synthetic read failure')
    expect(queue.snapshot().unconfirmed).toEqual([])
    expect(request.mock.calls.filter(call => call[2]?.method === 'POST')).toHaveLength(1)
  })

  it('does not consume a status response for a different job ID', async () => {
    const queue = client()
    queue.receive({ id: firstId, status: 'queued' })
    await queue.poll(vi.fn().mockResolvedValue({ id: secondId, status: 'completed' }))
    expect(queue.snapshot().receipts[0].job.status).toBe('queued')
    expect(queue.snapshot().receipts[0].pollError).toMatch('did not match')
  })

  it('stops old-scope polling before another request and tracks id-only voice receipts', async () => {
    const queue = client()
    queue.receive({ job_id: firstId }, 'Reviewed workflow', true)
    queue.receive({ id: secondId, status: 'queued' })
    const request = vi.fn().mockResolvedValue({ id: firstId, status: 'completed' })
    await queue.poll(request, () => false)
    expect(request).not.toHaveBeenCalled()
    expect(queue.snapshot().receipts[0].job.status).toBeUndefined()
  })
})

describe('Support queue presentation and controls', () => {
  it.each(['/portable/backup', '/portable/import', '/tickets/unticketed', '/backend/start', '/backend/stop', '/poll-settings', path, `/threads/${threadId}/ticket`])('opts long operation %s into async admission', route => {
    expect(queuedSupportMutation(route, {}, 'POST')).toBe(true)
  })

  it('keeps short state writes and cancellation outside admission', () => {
    expect(queuedSupportMutation(`/threads/${threadId}/workspace`, {}, 'PUT')).toBe(false)
    expect(queuedSupportMutation(`/jobs/${firstId}/cancel`, {}, 'POST')).toBe(false)
    expect(queuedSupportMutation(`/threads/${threadId}/draft/reject`, { redraft: false }, 'POST')).toBe(false)
    expect(queuedSupportMutation('/portable/export', {}, 'GET')).toBe(false)
  })

  it('allows queue-capable controls while busy work exists but retains prerequisites', () => {
    expect(supportQueueActionDisabled(true, false, false, true, true)).toBe(false)
    expect(supportQueueActionDisabled(true, false, false, false, true)).toBe(true)
    expect(supportQueueActionDisabled(false, false, false, true, true)).toBe(true)
    expect(supportQueueActionDisabled(true, true, false, true, true)).toBe(true)
    expect(supportQueueActionDisabled(true, false, true, true, true)).toBe(true)
  })

  it('clears only the accepted sidechat submission on its original target', () => {
    expect(clearAcceptedSidechat('synthetic question', 'synthetic question', false, true)).toBe('synthetic question')
    expect(clearAcceptedSidechat('synthetic question', 'synthetic question', true, false)).toBe('synthetic question')
    expect(clearAcceptedSidechat('new question', 'synthetic question', true, true)).toBe('new question')
    expect(clearAcceptedSidechat(' synthetic question ', 'synthetic question', true, true)).toBe('')
  })

  it('uses authoritative terminal results, not admission, for completion notices', () => {
    expect(supportJobCompletion({ id: firstId, status: 'completed', result: { filename: 'synthetic.json' } }, 'Backup')).toBe('Backup saved as synthetic.json')
    expect(supportJobCompletion({ id: firstId, status: 'failed', error: 'synthetic failure' }, 'Workflow')).toContain('synthetic failure')
  })
})
