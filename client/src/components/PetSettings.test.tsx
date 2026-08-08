import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import {
  BUILTIN_ALIEN_CHILD_INFO,
  BUILTIN_ALIEN_CHILD_PERSONALITY,
  BUILTIN_MOBILE_PET_CATALOG,
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
      catalog: BUILTIN_MOBILE_PET_CATALOG,
      desktopSpeech: null,
      desktopSpeechStatus: 'missing',
      error: '',
      gateway: null,
      hostCapabilities,
      info: BUILTIN_ALIEN_CHILD_INFO,
      onPreferences: () => undefined,
      onPersonalityChange: () => undefined,
      onPersonalityReset: () => undefined,
      onPetChanged: () => undefined,
      onPreviewVoice: () => undefined,
      onRefreshDesktopSpeech: () => undefined,
      onTest: () => undefined,
      personality: BUILTIN_ALIEN_CHILD_PERSONALITY,
      personalityEdited: false,
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
    expect(html).toContain('Pet personalities are built into Mobile')
    expect(html).toContain('Your pet presets')
    expect(html).toContain('Dr. House')
    expect(html).toContain('Ponytail Principal')
    expect(html).toContain('Adapted Hermes defaults')
    expect(html).toContain('Technical Expert')
    expect(html).toContain('Edit selected personality')
    expect(html).toContain('Sidechat command words')
    expect(html).toContain('Pet, Alien Child, Jaskass')
    expect(html).toContain('Add likely STT spellings as separate aliases')
    expect(html).toContain('separate sidechat command aliases')
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
