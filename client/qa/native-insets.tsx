import { createRoot } from 'react-dom/client'
import { ControlPanel } from '../src/components/ControlPanel'
import { EmbedPreferencesProvider } from '../src/embeds'
import '../src/styles.css'
import '../src/skin/index.css'

const noop = () => {}
const surface = new URLSearchParams(location.search).get('surface') || 'control'

createRoot(document.getElementById('root')!).render(
  <div className="app-shell">
    <header className="topbar"><h1>Settings fixture</h1></header>
    <nav className="bottom-nav app-sidebar"><button className="nav-control">Settings</button></nav>
    <div className="mobile-workspace">
      <section className={`app-view ${surface}-view active`}>
        {surface === 'control' ? (
          <EmbedPreferencesProvider connectionId="synthetic-insets">
            <ControlPanel
              active connected gateway={null} transport={null} runtimeSessionId="" profile="default"
              activeSkinName="default" themeSelection="host" themeMode="system"
              preferredWorkspace="" sessionCwd="" switchingProfile={false}
              voicePhase="idle" voiceSelection={{ provider: '', voice: '', speed: 1 }}
              autoSpeak={false} wakeWordAvailable={false} wakeWordMode="off"
              wakeWordModelId="hey_hermes" wakeWordProvider="openwakeword"
              sherpaPetWakePhrase="hey pet" sherpaWakePhrase="hey hermes" wakeWordStatus="off"
              pet={{ catalog: [], desktopSpeech: null, desktopSpeechStatus: 'missing', error: '',
                hostCapabilities: { commentary: false, mode: 'visual-only', personalities: false, sidechat: false },
                info: { enabled: false }, personality: null, personalityEdited: false, status: 'idle',
                preferences: { commentary: true, delaySeconds: 12, intervalSeconds: 45,
                  commentaryHistory: 5, commentaryLens: 'companion', contextTurns: 3,
                  personalitySlug: 'alien-child', roam: false, sidechatCommands: ['Pet'],
                  speechMode: 'desktop', speechPitch: 0, speechProvider: '', speechSpeed: 1,
                  speechVoice: '', speechVolume: 1, speakCommentary: false, toolTurns: 4, visible: false },
                onPreferences: noop, onPersonalityChange: noop, onPersonalityReset: noop,
                onPetChanged: noop, onPreviewVoice: noop, onRefreshDesktopSpeech: noop, onTest: noop }}
              onAutoSpeakChange={noop} onWakeWordModeChange={noop} onWakeWordModelChange={noop}
              onWakeWordProviderChange={noop} onSherpaPetWakePhraseChange={noop} onSherpaWakePhraseChange={noop}
              onNotice={noop} onOpenWorkspace={noop} onStopSpeech={noop} onThemeSelectionChange={noop}
              onThemeModeChange={noop} onToolDetailModeChange={noop} onVoiceSelectionChange={noop}
              onSwitchProfile={async () => true}
            />
          </EmbedPreferencesProvider>
        ) : surface === 'chat' ? (
          <><div className="transcript" style={{ flex: 1 }} /><form className="composer"><div className="composer-box"><textarea aria-label="Synthetic draft" /></div></form></>
        ) : (
          <div className="reader-screen"><p>Isolated reader transport geometry.</p><div className="reader-playback-dock"><button>Pause</button></div></div>
        )}
      </section>
    </div>
  </div>,
)
