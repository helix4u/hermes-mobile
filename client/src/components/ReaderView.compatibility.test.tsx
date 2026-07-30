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
        transport={{} as HermesTransport}
        onRender={vi.fn()}
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
  })
})
