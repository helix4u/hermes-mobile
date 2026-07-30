import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { HermesTransport } from '../transport/hermes-transport'
import { VoiceSettings } from './VoiceSettings'

const voiceCatalogState = vi.hoisted(() => ({
  current: {
    catalog: [
      {
        capabilities: {
          languages: ['Auto', 'English'],
          voice_cloning: true,
          voice_delete: true,
          voice_design: true,
        },
        display: 'Custom TTS',
        id: 'custom',
        voices: [
          {
            deletable: true,
            display: 'Saved Clone',
            id: 'saved-clone',
            kind: 'clone',
            language: 'English',
          },
        ],
      },
    ],
    catalogSupported: true as boolean | null,
    choices: [
      {
        label: 'Saved Clone',
        provider: 'custom',
        voice: 'saved-clone',
      },
    ],
    error: '',
    loading: false,
    providers: ['custom'],
    refresh: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('./useVoiceCatalog', () => ({
  useVoiceCatalog: () => voiceCatalogState.current,
}))

describe('mobile voice settings', () => {
  beforeEach(() => {
    voiceCatalogState.current.catalogSupported = true
    voiceCatalogState.current.error = ''
  })

  test('renders reported voices as a real picker and exposes generic voice creation', () => {
    const html = renderToStaticMarkup(
      <VoiceSettings
        connected
        onChange={vi.fn()}
        selection={{
          instruct: '',
          language: '',
          provider: 'custom',
          speed: 1,
          voice: '',
        }}
        transport={{} as HermesTransport}
      />,
    )

    expect(html).toContain('<option value="saved-clone">Saved Clone</option>')
    expect(html).toContain('1 voices available')
    expect(html).not.toContain('<datalist')
    expect(html).toContain('Custom voice library')
    expect(html).toContain('Clone reference audio')
    expect(html).toContain('Design from instructions')
    expect(html).toContain('Create clone')
  })

  test('uses a quiet host-default explanation when the catalog route is absent', () => {
    voiceCatalogState.current.catalog = []
    voiceCatalogState.current.catalogSupported = false
    voiceCatalogState.current.choices = []
    voiceCatalogState.current.providers = []

    const html = renderToStaticMarkup(
      <VoiceSettings
        connected
        onChange={vi.fn()}
        selection={{
          instruct: '',
          language: '',
          provider: '',
          speed: 1,
          voice: '',
        }}
        transport={{} as HermesTransport}
      />,
    )

    expect(html).toContain('<option value="" selected="">Host default</option>')
    expect(html).toContain(
      'This host does not expose provider and voice catalogs.',
    )
    expect(html).not.toContain('inline-error')
  })
})
