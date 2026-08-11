import { describe, expect, it, vi } from 'vitest'
import type { HermesTransport } from './transport/hermes-transport'
import {
  filterSupportThreads,
  isOmittedSupportParticipant,
  normalizeSupportPlaybackSpeed,
  normalizeSupportMarkdown,
  parseSupportSetupLines,
  parseSupportVoicePresetLines,
  plainSupportTitle,
  probeSupportOps,
  supportHandoffFilename,
  supportHandoffMarkdown,
  supportInvestigationPrompt,
  supportOpsTargetedSyncAvailable,
  supportVisibleParticipants,
} from './support-ops'

function transportWith(
  requestJson: HermesTransport['requestJson'],
): HermesTransport {
  return { requestJson } as HermesTransport
}

describe('Support Ops host capability', () => {
  it('requires the host to explicitly advertise targeted sync', () => {
    expect(supportOpsTargetedSyncAvailable(undefined)).toBe(false)
    expect(
      supportOpsTargetedSyncAvailable({
        capabilities: { targeted_sync: false },
      }),
    ).toBe(false)
    expect(
      supportOpsTargetedSyncAvailable({
        capabilities: { targeted_sync: true },
      }),
    ).toBe(true)
  })

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
      thread_id: '111111111111111111',
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

  it('keeps real participants while omitting the Argus wait-room bot', () => {
    expect(isOmittedSupportParticipant('argus panoptes#4141')).toBe(true)
    expect(
      supportVisibleParticipants([
        'casey',
        'Argus',
        'support-two',
        'CASEY',
        '',
      ]),
    ).toEqual(['casey', 'support-two'])
  })

  it('normalizes portable setup lines and bounded support voice speed', () => {
    expect(parseSupportSetupLines('casey\nsupport-two\ncasey\n')).toEqual([
      'casey',
      'support-two',
    ])
    expect(
      parseSupportVoicePresetLines(
        'casey | xai | Rex | voice-1\nreporter | openai | cedar |',
      ),
    ).toEqual([
      { label: 'casey', provider: 'xai', voice: 'Rex', model: 'voice-1' },
      {
        label: 'reporter',
        provider: 'openai',
        voice: 'cedar',
        model: '',
      },
    ])
    expect(normalizeSupportPlaybackSpeed(9)).toBe(2)
    expect(normalizeSupportPlaybackSpeed(0)).toBe(0.5)
    expect(normalizeSupportPlaybackSpeed('nope')).toBe(1)
  })

  it('normalizes Discord reply and mention syntax before Markdown rendering', () => {
    expect(
      normalizeSupportMarkdown(
        '[reply to operator msg=111111111111111111]\nHello <@222222222222222222>',
        { '222222222222222222': 'operator' },
      ),
    ).toBe('> Replying to **@operator**\nHello **@operator**')
  })

  it('builds a downloadable operator handoff with investigation and transcript', () => {
    const detail = {
      thread_id: '111111111111111111',
      title: '**Windows install failed**',
      discord_url: 'https://discord.com/channels/a/b',
      message_count: 1,
      workspace: { investigation: '## Finding\nSQLite writer pressure.' },
      ticket: { status: 'needs-investigation' },
      messages: [
        {
          author: 'operator',
          timestamp: '2026-08-01T15:00:00Z',
          body: 'Please send logs.',
        },
      ],
      attachments: [
        { filename: 'gateway.log', remote_url: 'https://dpaste.test/log' },
      ],
    }
    const handoff = supportHandoffMarkdown(detail)
    expect(handoff).toContain('# Windows install failed')
    expect(handoff).toContain('## Workspace investigation')
    expect(handoff).toContain('## Discord transcript')
    expect(handoff).toContain('Please send logs.')
    expect(handoff).toContain('gateway.log: https://dpaste.test/log')
    expect(supportHandoffFilename(detail)).toBe(
      'windows-install-failed-111111111111111111.md',
    )
  })

  it('starts a normal session with an explicit no-posting authority boundary', () => {
    const prompt = supportInvestigationPrompt({
      thread_id: '123',
      title: 'Gateway issue',
      workspace: { investigation: 'The socket closes after focus loss.' },
      messages: [
        { author: 'reporter', body: 'It fails after switching apps.' },
      ],
    })
    expect(prompt).toContain('Continue the support investigation')
    expect(prompt).toContain('The socket closes after focus loss.')
    expect(prompt).toContain('It fails after switching apps.')
    expect(prompt).toContain('Do not post to Discord')
  })
})
