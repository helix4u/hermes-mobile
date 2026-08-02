import { describe, expect, it, vi } from 'vitest'
import type { HermesTransport } from './transport/hermes-transport'
import {
  filterSupportThreads,
  normalizeSupportMarkdown,
  plainSupportTitle,
  probeSupportOps,
} from './support-ops'

function transportWith(requestJson: HermesTransport['requestJson']): HermesTransport {
  return { requestJson } as HermesTransport
}

describe('Support Ops host capability', () => {
  it('reports the host plugin only after its authenticated health probe succeeds', async () => {
    const requestJson = vi.fn().mockResolvedValue({ ok: true })
    await expect(probeSupportOps(transportWith(requestJson))).resolves.toBe(
      'available',
    )
    expect(requestJson).toHaveBeenCalledWith(
      '/api/plugins/support-ops/health',
      undefined,
      { timeoutMs: 8_000 },
    )
  })

  it('distinguishes a missing plugin from a transient host failure', async () => {
    await expect(
      probeSupportOps(
        transportWith(vi.fn().mockRejectedValue(new Error('HTTP 404'))),
      ),
    ).resolves.toBe('missing')
    await expect(
      probeSupportOps(
        transportWith(vi.fn().mockRejectedValue(new Error('HTTP 502'))),
      ),
    ).resolves.toBe('unknown')
  })
})

describe('Support Ops presentation helpers', () => {
  const rows = [
    {
      thread_id: '1533242742740750436',
      title: '**Windows install failed**',
      waiting_on_operator: true,
      last_message_at: '2026-08-01T15:00:00Z',
    },
    {
      thread_id: '1533242742740750437',
      title: 'Provider setup',
      waiting_on_support: true,
      has_ticket: false,
      last_message_at: '2026-08-01T14:00:00Z',
    },
  ]

  it('filters queue summaries and strips title decoration', () => {
    expect(filterSupportThreads(rows, '', 'waiting_operator')).toHaveLength(1)
    expect(filterSupportThreads(rows, 'provider', 'all')[0].thread_id).toBe(
      '1533242742740750437',
    )
    expect(plainSupportTitle(rows[0].title)).toBe('Windows install failed')
  })

  it('normalizes Discord reply and mention syntax before Markdown rendering', () => {
    expect(
      normalizeSupportMarkdown(
        '[reply to gille msg=1533242742740750436]\nHello <@1402802685408837722>',
        { '1402802685408837722': 'gille' },
      ),
    ).toBe('> Replying to **@gille**\nHello **@gille**')
  })
})
