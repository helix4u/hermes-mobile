import { describe, expect, it } from 'vitest'
import { RealtimeUsageMeter } from './realtimeUsage'

function done(id = 'response-1', extra = {}) {
  return { type: 'response.done', response: { id, status: 'completed', usage: {
    input_tokens: 150, output_tokens: 30, total_tokens: 180,
    input_token_details: { text_tokens: 100, audio_tokens: 50, cached_tokens: 60,
      cached_tokens_details: { text_tokens: 40, audio_tokens: 20 } },
    output_token_details: { text_tokens: 10, audio_tokens: 20 }
  }, ...extra } }
}
function meter() {
  const m = new RealtimeUsageMeter()
  m.setModel('gpt-realtime')
  return m
}
describe('Realtime response billing', () => {
  it('prices uncached and cached text/audio at distinct rates', () => {
    const m = meter()
    m.accept(done())
    expect(m.snapshot.usd).toBeCloseTo((60*4+40*.4+30*32+20*.4+10*16+20*64)/1e6)
    expect(m.snapshot).toMatchObject({ input: 150, output: 30, cached: 60, pricedResponses: 1, unpricedResponses: 0 })
  })
  it('counts cancelled generation, but never counts response replay twice', () => {
    const m = meter()
    expect(m.accept(done('r', { status: 'cancelled' }))).toBe(true)
    expect(m.accept(done('r', { status: 'cancelled' }))).toBe(false)
    expect(m.snapshot.pricedResponses).toBe(1)
  })
  it('retains priced subtotal across reconnect model changes', () => {
    const m = meter()
    m.accept(done())
    const first = m.snapshot.usd
    m.accept({ type: 'session.updated', session: { model: 'unknown-future-model' } })
    m.accept(done('response-2'))
    expect(m.snapshot).toMatchObject({ usd: first, total: 360, pricedResponses: 1, unpricedResponses: 1 })
  })
  it('does not call missing detail a zero-cost response', () => {
    const m = meter()
    m.accept(done('r', { usage: { input_tokens: 10, output_tokens: 20 } }))
    expect(m.snapshot).toMatchObject({ usd: 0, pricedResponses: 0, unpricedResponses: 1, total: 30 })
  })
  it('rejects inconsistent cache counts and malformed counts', () => {
    const m = meter()
    const e = done()
    e.response.usage.input_token_details.cached_tokens = 149
    m.accept(e)
    m.accept(done('r2', { usage: { input_tokens: -2, output_tokens: Infinity } }))
    expect(m.snapshot).toMatchObject({ usd: 0, pricedResponses: 0, unpricedResponses: 2 })
  })
  it('reports transcription separately and deduplicates items', () => {
    const m = meter()
    const e = { type: 'conversation.item.input_audio_transcription.completed', item_id: 'input-1', usage: { input_tokens: 40 } }
    m.accept(e); m.accept(e)
    expect(m.snapshot).toMatchObject({ transcriptions: 1, usd: 0, input: 0, pricedResponses: 0 })
  })
  it('does not meter transcript deltas or mutate previous snapshots', () => {
    const m = meter(), before = m.snapshot
    expect(m.accept({ type: 'response.output_audio.delta', delta: 'private' })).toBe(false)
    m.accept(done())
    expect(before.total).toBe(0)
    expect(m.snapshot.total).toBe(180)
    expect(new RealtimeUsageMeter().snapshot.total).toBe(0)
  })
  it('handles zero cached tokens without cache modality fields', () => {
    const m = meter(), e = done()
    e.response.usage.input_token_details.cached_tokens = 0
    e.response.usage.input_token_details.cached_tokens_details = {} as never
    m.accept(e)
    expect(m.snapshot.pricedResponses).toBe(1)
  })
})
