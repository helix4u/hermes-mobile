import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { HermesTransport } from '../transport/hermes-transport'
import { CapabilitiesPanel } from './CapabilitiesPanel'

describe('Mobile capabilities surface', () => {
  it('does not install, authorize or fetch while settings are collapsed', () => {
    const request = vi.fn()
    const html = renderToStaticMarkup(<CapabilitiesPanel connected
      transport={{ gateway: { request }, connection: { id: 'host', profile: 'default' } } as unknown as HermesTransport}
      onNotice={() => {}} />)
    expect(request).not.toHaveBeenCalled()
    expect(html).toContain('Plugins, MCP servers and connectors')
    expect(html).toContain('Nothing installs or authorizes automatically')
    expect(html).not.toContain(' open="')
  })
})
