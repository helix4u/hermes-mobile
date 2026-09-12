import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { ProfileAndScheduleSettings } from './ProfileAndScheduleSettings'

describe('integrated profile and scheduled-work controls', () => {
  test('uses normal collapsed Control sections while disconnected', () => {
    const html = renderToStaticMarkup(
      <ProfileAndScheduleSettings
        active={false}
        profile="writer"
        switching={false}
        transport={null}
        onSwitchProfile={async () => true}
      />,
    )

    expect(html).toContain('<strong>Profile</strong>')
    expect(html).toContain('<strong>Scheduled work</strong>')
    expect(html).toContain("Connect to view this profile&#x27;s scheduled work")
    expect(html).toContain('value="writer"')
    expect(html).toContain('class="control-section"')
    expect(html).not.toContain('class="control-panel"')
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|>)/)
  })
})
