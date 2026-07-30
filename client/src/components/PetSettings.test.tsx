import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import {
  BUILTIN_ALIEN_CHILD_INFO,
  BUILTIN_ALIEN_CHILD_PERSONALITY,
  BUILTIN_ALIEN_CHILD_SUMMARY,
  FULL_PET_HOST_CAPABILITIES,
  normalizePetPreferences,
  VISUAL_ONLY_PET_HOST_CAPABILITIES,
} from '../pet'
import type { HermesTransport } from '../transport/hermes-transport'
import { PetSettings } from './PetSettings'

function renderPetSettings(
  hostCapabilities:
    | typeof FULL_PET_HOST_CAPABILITIES
    | typeof VISUAL_ONLY_PET_HOST_CAPABILITIES,
) {
  return renderToStaticMarkup(
    createElement(PetSettings, {
      catalog: [BUILTIN_ALIEN_CHILD_SUMMARY],
      desktopSpeech: null,
      desktopSpeechStatus: 'missing',
      error: '',
      gateway: null,
      hostCapabilities,
      info: BUILTIN_ALIEN_CHILD_INFO,
      onPreferences: () => undefined,
      onPreviewVoice: () => undefined,
      onRefreshDesktopSpeech: () => undefined,
      onTest: () => undefined,
      personality: BUILTIN_ALIEN_CHILD_PERSONALITY,
      preferences: normalizePetPreferences({
        speakCommentary: true,
      }),
      profile: 'default',
      status: 'ready',
      transport: {} as HermesTransport,
    }),
  )
}

describe('pet settings host capabilities', () => {
  test('keeps built-in visuals and host-default speech on vanilla hosts', () => {
    const html = renderPetSettings(VISUAL_ONLY_PET_HOST_CAPABILITIES)

    expect(html).toContain('visual only on this host')
    expect(html).toContain('Alien Child is built into Mobile')
    expect(html).toContain('same host-default TTS path as Listen and Reader')
    expect(html).toContain('Speak pet interactions')
    expect(html).not.toContain('Generate personality commentary')
    expect(html).not.toContain('Commentary model')
  })

  test('restores server-backed commentary controls on capable hosts', () => {
    const html = renderPetSettings(FULL_PET_HOST_CAPABILITIES)

    expect(html).toContain('Generate personality commentary')
    expect(html).toContain('Commentary lens')
    expect(html).toContain('Commentary model')
    expect(html).not.toContain('visual only on this host')
  })
})
