import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HermesTransport } from '../transport/hermes-transport'
import { appendSupportDictation, SupportOpsView } from './SupportOpsView'

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
