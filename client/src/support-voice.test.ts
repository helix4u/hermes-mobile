import { describe, expect, it, vi } from 'vitest'
import { prepareSupportVoiceContext, readSupportVoiceContext, supportVoiceContext, supportReviewSnapshot } from './support-voice'
import { sameVoiceReview } from './voice-context-review'

describe('Support voice capability boundary', () => {
  it('binds readback to review identity and preserves meaning-bearing text', () => {
    const review = { id: 'proposal', targetId: '100000000000000001', title: 'Synthetic issue', action: 'investigate', text: 'Do not change files.', status: 'pending_approval' }
    const snapshot = supportReviewSnapshot(review)!
    expect(snapshot.text).toBe('Start investigation for Synthetic issue.\nDo not change files.')
    expect(sameVoiceReview(snapshot, supportReviewSnapshot({ ...review }))).toBe(true)
    for (const patch of [{ id: 'new' }, { targetId: '100000000000000002' }, { action: 'suggest_reply' }, { text: 'Change files.' }, { title: 'Other issue' }, { status: 'approved' }]) {
      expect(sameVoiceReview(snapshot, supportReviewSnapshot({ ...review, ...patch }))).toBe(false)
    }
    expect(sameVoiceReview(snapshot, null)).toBe(false)
  })
  it('gathers all queue pages as records, never empty section text', async () => {
    const request = vi.fn(async (_path: string, args: Record<string,unknown>) => args.offset
      ? {threads:[{thread_id:'b'}], offset:1, matching:2, revision:'one',nextOffset:null}
      : {threads:[{thread_id:'a'}], offset:0, matching:2, revision:'one',nextOffset:1})
    const result = await readSupportVoiceContext(request,{operation:'index',scope:'all'})
    expect(result).toMatchObject({threads:[{thread_id:'a'},{thread_id:'b'}],complete:true,omittedItems:0})
  })
  it('refuses missing transcript rows even when the last page has no cursor', async () => {
    const request = vi.fn(async () => ({section:'transcript',text:'[{"body":"latest"}]',startMessage:1,endMessageExclusive:2,totalMessages:2,offset:1,nextOffset:null}))
    await expect(readSupportVoiceContext(request,{operation:'read',section:'transcript'})).rejects.toThrow('gap')
  })
  it('refuses malformed continuation metadata rather than calling the result complete', async () => {
    await expect(readSupportVoiceContext(async () => ({section:'transcript',text:'[]',nextOffset:'bad'}),{section:'transcript'})).rejects.toThrow('invalid continuation')
  })
  it('loads actual filtered queue evidence before voice starts, and refreshes it on empty reads', async () => {
    const request = vi.fn(async () => ({ threads: [{thread_id: '100000000000000001', title: 'Synthetic issue'}], matching: 1, revision: 'one' }))
    let view = { filter: 'waiting_support', query: '' }
    const target = supportVoiceContext('host', undefined, request, vi.fn(), () => view)
    const prepared = await prepareSupportVoiceContext(target)
    expect(JSON.parse(prepared.context[0].content)).toMatchObject({ threads: [{title: 'Synthetic issue'}], matching: 1, viewing: view })
    view = { filter: 'pr_review', query: 'browser' }
    await prepared.contextTools!.read({})
    expect(request).toHaveBeenLastCalledWith('/voice/read', {operation:'index', filters:{filter:'pr_review'},query:'browser'})
  })
  it('treats a missing queue contract as failure, never as an empty queue', async () => {
    const target = supportVoiceContext('host', undefined, async () => ({context:[{content:'Attached queue'}]}), vi.fn())
    await expect(prepareSupportVoiceContext(target)).rejects.toThrow('incompatible response')
  })
  it('reads a whole attached thread by default without requiring the user to repeat its ID', async () => {
    const request = vi.fn(async () => ({section:'transcript',revision:'one',text:'[{"body":"Newest complete message"}]',complete:true,nextOffset:null}))
    const target = supportVoiceContext('host', {thread_id:'100000000000000001', title:'Synthetic issue'}, request, vi.fn())
    const prepared = await prepareSupportVoiceContext(target)
    expect(request).toHaveBeenCalledWith('/voice/read', {operation:'read',targetId:'100000000000000001',section:'transcript',limit:40})
    expect(prepared.context[0].content).toContain('Newest complete message')
  })
  it('never upgrades an error response into a complete transcript', async () => {
    await expect(readSupportVoiceContext(async () => ({status:'error'}), {operation:'read',section:'transcript'})).rejects.toThrow('read failed')
  })
  it('follows the current visible queue on each default read while preserving explicit scope', async () => {
    const request = vi.fn(async (_path: string, _args: Record<string, unknown>) => ({ matching: 2, threads: [] }))
    let view = { filter: 'waiting_operator', query: 'connection' }
    const target = supportVoiceContext('host-a', undefined, request, vi.fn(), () => view)
    await target.contextTools!.read({ operation: 'index' })
    expect(request).toHaveBeenLastCalledWith('/voice/read', { operation: 'index', filters: { filter: 'waiting_operator' }, query: 'connection' })
    view = { filter: 'pr_review', query: '' }
    const result = await target.contextTools!.read({ operation: 'index' })
    expect(request).toHaveBeenLastCalledWith('/voice/read', { operation: 'index', filters: { filter: 'pr_review' }, query: '' })
    expect(result.viewing).toMatchObject(view)
    await target.contextTools!.read({ operation: 'index', filters: { filter: 'all' } })
    expect(request).toHaveBeenLastCalledWith('/voice/read', { operation: 'index', filters: { filter: 'all' }, query: '' })
  })

  it('keeps connection and target identity separate and exposes reads without approval authority', async () => {
    const request = vi.fn(async () => ({ matching: 3, threads: [] }))
    const review = vi.fn()
    const target = supportVoiceContext('host-a', undefined, request, review)
    expect(target.contextId).not.toBe(supportVoiceContext('host-b', undefined, request, review).contextId)
    await target.contextTools!.read({ operation: 'index', filters: { filter: 'waiting_support' } })
    expect(request).toHaveBeenCalledWith('/voice/read', { operation: 'index', filters: { filter: 'waiting_support' } })
    expect(review).not.toHaveBeenCalled()
    expect(Object.entries(target.contextTools!).filter(([, value]) => typeof value === 'function').map(([key]) => key)).toEqual(['read', 'propose'])
  })
  it('stages an exact target without invoking an action endpoint', async () => {
    const proposal = { id: 'receipt', targetId: '100000000000000001', action: 'save_reply', text: 'draft', status: 'pending_approval' }
    const request = vi.fn(async (_path: string, _body: Record<string, unknown>) => proposal)
    const review = vi.fn()
    const target = supportVoiceContext('host', undefined, request, review)
    const output = await target.contextTools!.propose({ targetId: proposal.targetId, action: proposal.action, text: proposal.text })
    expect(review).toHaveBeenCalledWith(proposal)
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0][0]).toBe('/voice/propose')
    expect(output.status).toBe('pending_approval')
  })
  it('does not present malformed backend state as an approved or executable review', async () => {
    const review = vi.fn()
    const target = supportVoiceContext('host', undefined, async () => ({ status: 'approved' }), review)
    await expect(target.contextTools!.propose({})).rejects.toThrow('invalid review')
    expect(review).not.toHaveBeenCalled()
  })
  it('requires exact reads and fails closed instead of guessing current support state', () => {
    const target = supportVoiceContext('host', undefined, vi.fn(), vi.fn())
    const instructions = target.contextTools?.guide ?? ''
    expect(target.context[0]?.content).not.toContain('Use read_attached_context')
    expect(instructions).toContain('index row is discovery only')
    expect(instructions).toContain('Never fill the gap')
    expect(instructions).toContain('user speaking to you is not an assignee')
    expect(instructions).toContain('omit those instead of repeating')
  })

  it('gathers every whole transcript page into one chronological result', async () => {
    const bodies = ['old '.repeat(3_000), 'middle '.repeat(2_000), 'latest '.repeat(2_500)]
    const request = vi.fn(async (_path: string, body: Record<string, unknown>) => {
      const before = typeof body.offset === 'number' ? body.offset : 3
      const start = Math.max(0, before - 1)
      return {
        section: 'transcript',
        revision: 'stable-revision',
        offset: start,
        startMessage: start,
        endMessageExclusive: before,
        totalMessages: 3,
        nextOffset: start > 0 ? start : null,
        text: JSON.stringify([{ message_id: `m-${start}`, body: bodies[start] }]),
      }
    })
    const result = await readSupportVoiceContext(request, {
      operation: 'read', targetId: '100000000000000001', section: 'transcript',
    })
    const messages = JSON.parse(String(result.text)) as Array<{ message_id: string; body: string }>
    expect(messages.map(message => message.message_id)).toEqual(['m-0', 'm-1', 'm-2'])
    expect(messages.map(message => message.body)).toEqual(bodies)
    expect(result.complete).toBe(true)
    expect(result.pageCount).toBe(3)
    expect(result.nextOffset).toBeNull()
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('restarts a transcript gather once when the revision changes', async () => {
    let changedOnce = false
    const request = vi.fn(async (_path: string, body: Record<string, unknown>) => {
      const before = typeof body.offset === 'number' ? body.offset : 2
      if (before === 1 && !changedOnce) {
        changedOnce = true
        return { status: 'changed' }
      }
      const start = before - 1
      return {
        section: 'transcript', revision: 'fresh', offset: start,
        startMessage: start, endMessageExclusive: before, totalMessages: 2,
        nextOffset: start > 0 ? start : null,
        text: JSON.stringify([{ message_id: `m-${start}`, body: `body-${start}` }]),
      }
    })
    const result = await readSupportVoiceContext(request, {
      operation: 'read', targetId: '100000000000000001', section: 'transcript',
    })
    const messages = JSON.parse(String(result.text)) as Array<{ message_id: string }>
    expect(messages.map(message => message.message_id)).toEqual(['m-0', 'm-1'])
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('returns no partial transcript when paging repeats a cursor', async () => {
    const request = vi.fn(async () => ({
      section: 'transcript', revision: 'stable', offset: 1,
      startMessage: 1, endMessageExclusive: 2, totalMessages: 2,
      nextOffset: 1, text: JSON.stringify([{ message_id: 'm-1', body: 'latest' }]),
    }))
    await expect(readSupportVoiceContext(request, {
      operation: 'read', targetId: '100000000000000001', section: 'transcript',
    })).rejects.toThrow('repeated a cursor')
  })

  it('refreshes a changed non-transcript read without carrying a stale cursor', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 'changed' })
      .mockResolvedValueOnce({ section: 'ticket', text: 'complete ticket', complete: true })
    const result = await readSupportVoiceContext(request, {
      operation: 'read', targetId: '100000000000000001', section: 'ticket', revision: 'old', offset: 9,
    })
    expect(result).toMatchObject({ text: 'complete ticket', refreshed: true })
    expect(request.mock.calls[1][1]).toEqual({
      operation: 'read', targetId: '100000000000000001', section: 'ticket',
    })
  })
})
