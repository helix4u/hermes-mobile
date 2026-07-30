import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserConnection } from '../transport/browser-transport'
import { ConnectionSheet } from './ConnectionSheet'

function connection(
  overrides: Partial<BrowserConnection> = {},
): BrowserConnection {
  return {
    id: 'new-host',
    name: 'My Hermes',
    baseUrl: 'https://workstation.example',
    profile: 'default',
    token: '',
    authMode: 'token',
    connectionType: 'direct',
    ...overrides,
  }
}

function renderConnectionSheet(
  target: BrowserConnection,
  savedConnections: BrowserConnection[] = [],
): string {
  return renderToStaticMarkup(
    <ConnectionSheet
      busy={false}
      capabilities={null}
      cloudAgents={[]}
      cloudOrgs={[]}
      cloudSignedIn={false}
      connected={false}
      connection={target}
      nativeClient
      open
      savedConnections={savedConnections}
      onClose={vi.fn()}
      onCloudAgent={vi.fn()}
      onCloudDiscover={vi.fn()}
      onCloudLogin={vi.fn()}
      onCloudLogout={vi.fn()}
      onConnect={vi.fn()}
      onConnectionChange={vi.fn()}
      onDisconnect={vi.fn()}
      onDeleteConnection={vi.fn()}
      onEditConnection={vi.fn()}
      onNewDirect={vi.fn()}
      onSaveConnection={vi.fn()}
      onSavedConnection={vi.fn()}
    />,
  )
}

describe('ConnectionSheet automatic Cloud routing', () => {
  it('explains automatic Nous setup and does not ask for a session token', () => {
    const html = renderConnectionSheet(
      connection({
        baseUrl: 'https://mr-mid-tier-2828.agents.nousresearch.com/',
      }),
    )

    expect(html).toContain('Nous Cloud agent detected')
    expect(html).toContain('The Mobile server plugin is not required')
    expect(html).toContain('Connect with Nous')
    expect(html).not.toContain('Session token')
    expect(html).not.toContain('type="password"')
  })

  it('retains token setup for an ordinary direct host', () => {
    const html = renderConnectionSheet(connection())

    expect(html).toContain('Session token')
    expect(html).toContain('type="password"')
    expect(html).not.toContain('Nous Cloud agent detected')
  })

  it('shows explicit edit and delete actions for saved hosts', () => {
    const saved = connection({
      id: 'workstation',
      name: 'Workstation',
    })
    const html = renderConnectionSheet(saved, [saved])

    expect(html).toContain('Saved hosts')
    expect(html).toContain('Edit')
    expect(html).toContain('Delete')
  })
})
