import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { ProfilesCronPanel } from './ProfilesCronPanel'

describe('Mobile profiles and cron controls', () => {
  test('disconnected view identifies the selected profile and disables mutations', () => {
    const html = renderToStaticMarkup(<ProfilesCronPanel transport={null} active={false} profile="writer" switching={false} onSwitchProfile={async () => true} />)
    expect(html).toContain('Cron jobs (writer)')
    expect(html).toContain('Connect to view this profile')
    expect(html).toContain('<button disabled="">Create scheduled job</button>')
    expect(html).toContain('value="writer"')
  })
})
