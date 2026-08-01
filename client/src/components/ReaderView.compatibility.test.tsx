import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { HermesTransport } from '../transport/hermes-transport'
import { ReaderView } from './ReaderView'

vi.mock('./useVoiceCatalog', () => ({
  useVoiceCatalog: () => ({
    catalog: [],
    catalogSupported: false,
    choices: [],
    error: '',
    loading: false,
    providers: [],
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('Reader host compatibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('keeps old hosts readable through their default TTS without empty voice controls', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) =>
          key.endsWith('.draft') ? '(Narrator)\nHello from the old host.' : null,
        setItem: vi.fn(),
      },
    })

    const html = renderToStaticMarkup(
      <ReaderView
        active
        activeSpeechId=""
        connected
        connectionId="cloud-old"
        importedDocument={null}
        latestText=""
        normalVoice={{
          provider: 'qwen',
          speed: 1,
          voice: 'local-clone',
        }}
        phase="idle"
        playbackPaused={false}
        transport={{} as HermesTransport}
        onPause={vi.fn()}
        onRender={vi.fn()}
        onResume={vi.fn()}
        onSpeak={vi.fn()}
        onStop={vi.fn()}
      />,
    )

    expect(html).toContain('Host default voice')
    expect(html).toContain('Host default</span>')
    expect(html).toContain('Switching to a compatible host restores')
    expect(html).toContain('Smart assign')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('aria-label="Narrator voice"')
    expect(html).not.toContain('inline-error')
    expect(html).toContain('Reader playback controls')
    expect(html).toContain('Reader ready')
    expect(html).toContain('>Play</button>')
    expect(html).toContain('>Pause</button>')
    expect(html).toContain('>Stop</button>')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('>Follow</button>')
  })

  test('shows persistent resume and stop controls for paused Reader audio', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) =>
          key.endsWith('.draft') ? '(Narrator)\nPaused here.' : null,
        setItem: vi.fn(),
      },
    })

    const html = renderToStaticMarkup(
      <ReaderView
        active
        activeSpeechId="reader"
        connected
        connectionId="reader-paused"
        importedDocument={null}
        latestText=""
        normalVoice={{ provider: '', speed: 1, voice: '' }}
        phase="speaking"
        playbackPaused
        transport={{} as HermesTransport}
        onPause={vi.fn()}
        onRender={vi.fn()}
        onResume={vi.fn()}
        onSpeak={vi.fn()}
        onStop={vi.fn()}
      />,
    )

    expect(html).toContain('Reader paused')
    expect(html).toContain('>Resume</button>')
    expect(html).toContain('>Stop</button>')
    expect(html).toContain('>Follow</button>')
  })
})
