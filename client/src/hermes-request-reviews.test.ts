import { describe, expect, it } from 'vitest'
import { HermesRequestReviews, type HermesRequestScope } from './hermes-request-reviews'

const target = { connectionId: 'host-a', profile: 'writer', sessionId: 'session-a', generation: 1,
  targetTitle: 'Synthetic task', workerId: '', maxWorkers: 2, delegationLimitSupported: true }
function fixture() {
  let counter = 0
  const reviews = new HermesRequestReviews(() => `request-${++counter}`)
  const a = reviews.draft({ message: 'Quick question' }, target)
  const b = reviews.draft({ message: 'Long-running work' }, target)
  return { reviews, a, b }
}

describe('independent Hermes agent reviews', () => {
  it('adds and selects independent requests without replacing earlier messages', () => {
    const { reviews, a, b } = fixture()
    expect(a.requestId).not.toBe(b.requestId)
    expect(reviews.requests.map(row => row.message)).toEqual(['Quick question', 'Long-running work'])
    expect(reviews.selectedRequestId).toBe(b.requestId)
    reviews.select(a.requestId)
    reviews.edit(a.requestId, 'Edited question')
    expect(reviews.get(a.requestId)).toMatchObject({ revision: 2, message: 'Edited question' })
    expect(reviews.get(b.requestId)).toMatchObject({ revision: 1, message: b.message })
  })
  it('allows an empty UI-created request to be typed but not approved', () => {
    const { reviews, a } = fixture()
    const empty = reviews.add('', target)
    expect(reviews.begin(empty.requestId)).toBeNull()
    expect(reviews.get(a.requestId)?.message).toBe(a.message)
    reviews.edit(empty.requestId, 'New message')
    expect(reviews.begin(empty.requestId)).not.toBeNull()
  })
  it('rejects ambiguous edits without touching any row or selection', () => {
    const { reviews, a } = fixture()
    reviews.draft({ message: a.message }, target)
    const before = reviews.requests
    expect(() => reviews.draft({ message: 'Ambiguous revision', expectedDraft: a.message }, target)).toThrow('Ambiguous')
    expect(reviews.requests).toEqual(before)
  })
  it('uses the advertised exact-text guard to edit one of multiple unique messages', () => {
    const { reviews, a, b } = fixture()
    const edited = reviews.draft({ expectedDraft: a.message, message: 'Revised quick question' }, target)
    expect(edited.requestId).toBe(a.requestId)
    expect(reviews.selectedRequestId).toBe(b.requestId)
    expect(reviews.get(b.requestId)?.message).toBe(b.message)
    const before = reviews.requests
    expect(() => reviews.draft({ expectedDraft: a.message, message: 'Stale edit' }, target)).toThrow('Stale')
    expect(reviews.requests).toEqual(before)
  })
  it('revises an exact ID with revision or text guards without selecting another request', () => {
    const { reviews, a, b } = fixture()
    reviews.draft({ requestId: a.requestId, message: 'Revised question', expectedRevision: 1 }, target)
    expect(reviews.selectedRequestId).toBe(b.requestId)
    reviews.draft({ requestId: a.requestId, message: 'Final question', expectedDraft: 'Revised question', expectedRevision: 2 }, target)
    expect(reviews.get(a.requestId)).toMatchObject({ revision: 3, message: 'Final question' })
    expect(reviews.get(b.requestId)?.message).toBe(b.message)
  })
  it.each([
    { requestId: 'missing', expectedRevision: 1 },
    { requestId: '' },
    { requestId: 'request-1' },
    { requestId: 'request-1', expectedDraft: 'wrong' },
    { requestId: 'request-1', expectedRevision: 0 },
    { requestId: 'request-1', expectedRevision: 1, expectedDraft: 'wrong' },
  ])('fails closed on missing/stale guards: %j', guard => {
    const { reviews } = fixture()
    const before = reviews.requests
    expect(() => reviews.draft({ ...guard, message: 'Wrong replacement' }, target)).toThrow()
    expect(reviews.requests).toEqual(before)
  })
  it.each(['connectionId', 'profile', 'sessionId', 'generation', 'workerId'] as const)('fences cross-%s revisions', field => {
    const { reviews, a } = fixture()
    const before = reviews.requests
    expect(() => reviews.draft({ requestId: a.requestId, message: 'Wrong target', expectedRevision: 1 },
      { ...target, [field]: field === 'generation' ? 2 : 'other' })).toThrow('different target')
    expect(reviews.requests).toEqual(before)
  })
  it('preserves legacy guarded single-request edits but creates a second on message-only', () => {
    const reviews = new HermesRequestReviews(() => crypto.randomUUID())
    const a = reviews.draft({ message: 'First' }, target)
    expect(reviews.draft({ message: 'Changed', expectedDraft: 'First' }, target).requestId).toBe(a.requestId)
    reviews.draft({ message: 'Another' }, target)
    expect(reviews.requests).toHaveLength(2)
  })
  it('settles the submitted row after selecting, adding, editing and cancelling unrelated rows', () => {
    const { reviews, a, b } = fixture()
    const operation = reviews.begin(a.requestId)!
    expect(reviews.remove(a.requestId)).toBe(false)
    expect(() => reviews.edit(a.requestId, 'Changed while sending')).toThrow()
    reviews.select(b.requestId)
    reviews.edit(b.requestId, 'Second updated')
    const c = reviews.add('Third', target)
    expect(reviews.begin(c.requestId)).toBeNull()
    expect(reviews.remove(b.requestId)).toBe(true)
    expect(reviews.settle(a.requestId, operation.owner, target, 'sent')).toBe(true)
    expect(reviews.get(a.requestId)).toMatchObject({ status: 'sent', message: a.message, maxWorkers: 2 })
    expect(reviews.active?.requestId).toBe(c.requestId)
    expect(reviews.active?.status).toBe('pending')
  })
  it('keeps uncertain delivery locked while other messages remain editable and explicitly sendable', () => {
    const { reviews, a, b } = fixture()
    const operation = reviews.begin(a.requestId)!
    reviews.settle(a.requestId, operation.owner, target, 'uncertain', 'Receipt unavailable')
    expect(reviews.begin(a.requestId)).toBeNull()
    expect(() => reviews.edit(a.requestId, 'Retry')).toThrow()
    reviews.edit(b.requestId, 'Different message')
    expect(reviews.begin(b.requestId)).not.toBeNull()
    expect(reviews.remove(a.requestId)).toBe(true)
    expect(reviews.get(b.requestId)?.status).toBe('submitting')
  })
  it('accepts reconnect-independent receipts and rejects stop/retarget/old-owner receipts', () => {
    const { reviews, a } = fixture()
    const operation = reviews.begin(a.requestId)!
    expect(reviews.settle(a.requestId, Symbol('not owner'), target, 'sent')).toBe(false)
    expect(reviews.settle(a.requestId, operation.owner, { ...target, profile: 'other' } as HermesRequestScope, 'sent')).toBe(false)
    expect(reviews.get(a.requestId)?.status).toBe('submitting')
    reviews.reset()
    const newer = reviews.add('New target request', { ...target, sessionId: 'other' })
    expect(reviews.settle(a.requestId, operation.owner, target, 'sent')).toBe(false)
    expect(reviews.get(newer.requestId)?.status).toBe('pending')
  })
  it('allows a definite refusal to be edited and explicitly retried without claiming completion', () => {
    const { reviews, a, b } = fixture()
    const operation = reviews.begin(a.requestId)!
    reviews.settle(a.requestId, operation.owner, target, 'error', 'Session busy. Nothing was sent.')
    reviews.edit(a.requestId, 'Try a smaller question')
    expect(reviews.get(a.requestId)).toMatchObject({ status: 'pending', error: '', revision: 2 })
    expect(reviews.get(b.requestId)?.status).toBe('pending')
  })
})
