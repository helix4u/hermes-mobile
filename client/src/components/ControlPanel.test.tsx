import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { EmbedPreferencesProvider } from '../embeds'
import { ControlPanel } from './ControlPanel'

describe('mobile Control settings disclosures', () => {
  test('defaults every settings section to collapsed', () => {
    const html = renderToStaticMarkup(
      <EmbedPreferencesProvider connectionId="test">
        <ControlPanel
          activeSkinName="default"
          autoSpeak={false}
          connected
          gateway={null}
          preferredWorkspace=""
          profile="default"
          runtimeSessionId=""
          sessionCwd=""
          themeSelection="mobile"
          transport={null}
          voicePhase="idle"
          voiceSelection={{ provider: '', speed: 1, voice: '' }}
          onAutoSpeakChange={() => {}}
          onNotice={() => {}}
          onOpenWorkspace={() => {}}
          onStopSpeech={() => {}}
          onThemeSelectionChange={() => {}}
          onToolDetailModeChange={() => {}}
          onVoiceSelectionChange={() => {}}
        />
      </EmbedPreferencesProvider>,
    )

    expect(html).toContain('Session workspace')
    expect(html).toContain('Rich link embeds')
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|>)/)
  })
})
