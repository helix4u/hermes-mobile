import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HermesTransport } from '../transport/hermes-transport'
import {
  appendSupportDictation,
  supportSetupDraft,
  supportSetupPayload,
  SupportOpsView,
} from './SupportOpsView'

describe('SupportOpsView', () => {
  it('appends dictated text without erasing current field contents', () => {
    expect(appendSupportDictation('Keep this.', 'Add that.')).toBe(
      'Keep this. Add that.',
    )
    expect(appendSupportDictation('  Keep spacing  ', '  Add that.  ')).toBe(
      '  Keep spacing Add that.',
    )
    expect(appendSupportDictation('', '  New note.  ')).toBe('New note.')
    expect(appendSupportDictation('Keep this.', '   ')).toBe('Keep this.')
  })

  it('keeps the host plugin surface explicit and operator-safe', () => {
    const html = renderToStaticMarkup(
      <SupportOpsView
        active
        connected
        connectionId="workstation"
        transport={
          { requestJson: async () => ({}) } as unknown as HermesTransport
        }
      />,
    )

    expect(html).toContain('Support Ops')
    expect(html).toContain('Host plugin')
    expect(html).toContain('No automatic Discord posting')
    expect(html).toContain('Search support threads')
  })

  it('round-trips multiline operator setup into the portable host schema', () => {
    const draft = supportSetupDraft({
      operator_name: 'Casey',
      support_members: ['casey', 'support-two'],
      developer_members: ['developer-one'],
      categories: ['Messaging/gateway'],
      playback_voice: { provider: 'xai', voice: 'Rex', speed: 1.5 },
    })
    draft.support_members += '\nsupport-three\ncasey'
    const payload = supportSetupPayload(draft)
    expect(payload.operator_name).toBe('Casey')
    expect(payload.support_members).toEqual([
      'casey',
      'support-two',
      'support-three',
    ])
    expect(payload.team_members).toEqual([
      'casey',
      'support-two',
      'support-three',
      'developer-one',
    ])
    expect(payload.playback_voice).toEqual({
      provider: 'xai',
      voice: 'Rex',
      speed: 1.5,
    })
  })

  it('does not imply Support Ops exists while disconnected', () => {
    const html = renderToStaticMarkup(
      <SupportOpsView
        active
        connected={false}
        connectionId="cloud"
        transport={null}
      />,
    )
    expect(html).toContain('Connect to a Hermes host with the Support Ops plugin installed.')
  })
})
