import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import type { BrowserConnection } from '../transport/browser-transport'
import { ShareSheet } from './ShareSheet'

const workstation: BrowserConnection = {
  id: 'workstation',
  name: 'Workstation',
  baseUrl: 'https://workstation.example',
  profile: 'default',
  token: '',
  authMode: 'token',
  connectionType: 'tailnet',
}

describe('share target sheet', () => {
  test('shows remote, session, and new-session workspace choices before sending', () => {
    const html = renderToStaticMarkup(
      <ShareSheet
        activeConnection={workstation}
        activeSessionId=""
        busy={false}
        connected
        connections={[
          workstation,
          {
            ...workstation,
            id: 'cloud',
            name: 'Cloud agent',
            connectionType: 'cloud',
          },
        ]}
        defaultWorkspace="/work"
        sessions={[
          {
            id: 'session-1',
            title: 'Existing conversation',
            preview: null,
            started_at: 1,
            message_count: 2,
            source: 'desktop',
          },
        ]}
        share={{
          id: 'share-1',
          kind: 'image',
          mimeType: 'image/png',
          name: 'screen.png',
          text: '',
        }}
        shareWorkspace="/chosen"
        onChooseWorkspace={vi.fn()}
        onClose={vi.fn()}
        onConnection={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(html).toContain('Send to Hermes')
    expect(html).toContain('Workstation · tailnet')
    expect(html).toContain('Cloud agent · cloud')
    expect(html).toContain('New conversation')
    expect(html).toContain('Existing conversation')
    expect(html).toContain('/chosen')
    expect(html).toContain('Choose directory')
    expect(html).toContain('Send to Hermes')
  })
})
