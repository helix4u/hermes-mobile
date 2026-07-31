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
          wakeWordAvailable
          wakeWordMode="off"
          wakeWordStatus="off"
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
          pet={{
            catalog: [],
            desktopSpeech: null,
            desktopSpeechStatus: 'missing',
            error: '',
            hostCapabilities: {
              commentary: false,
              mode: 'visual-only',
              personalities: false,
              sidechat: false,
            },
            info: { enabled: false },
            personality: null,
            preferences: {
              commentary: true,
              delaySeconds: 12,
              intervalSeconds: 45,
              commentaryHistory: 5,
              commentaryLens: 'companion',
              contextTurns: 3,
              personalitySlug: 'alien-child',
              roam: true,
              speechMode: 'desktop',
              speechPitch: 0,
              speechProvider: '',
              speechSpeed: 1,
              speechVoice: '',
              speechVolume: 1,
              speakCommentary: false,
              toolTurns: 4,
              visible: true,
            },
            status: 'idle',
            onPreferences: () => {},
            onPreviewVoice: () => {},
            onRefreshDesktopSpeech: () => {},
            onTest: () => {},
          }}
          onAutoSpeakChange={() => {}}
          onWakeWordModeChange={() => {}}
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
    expect(html).toContain('Mobile companion')
    expect(html).toContain('Rich link embeds')
    expect(html).toContain('API credentials and account sign-in')
    expect(html).toContain('“Hey Hermes” behavior')
    expect(html).toContain('Transcribe and send automatically')
    expect(html).toContain('bundled openWakeWord model')
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|>)/)
  })
})
