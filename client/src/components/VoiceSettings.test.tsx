import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import type { HermesTransport } from '../transport/hermes-transport'
import { VoiceSettings } from './VoiceSettings'

vi.mock('./useVoiceCatalog', () => ({
  useVoiceCatalog: () => ({
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
  }),
}))

describe('mobile voice settings', () => {
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
})
