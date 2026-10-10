import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { VoiceEffectsControls } from './VoiceEffectsControls'
import { normalizeVoiceEffects, VOICE_EFFECT_PRESETS } from '../voice-effects-settings'

it('renders enabled bounded spatial controls with readable position, distance and headset guidance', () => {
  const html = renderToStaticMarkup(createElement(VoiceEffectsControls, {
    value: normalizeVoiceEffects({ enabled: true, spatial: true, spatialPosition: -0.5, spatialDistance: 2.5 }),
    onChange: vi.fn(), onBend: vi.fn(),
  }))
  expect(html).not.toContain('disabled=""')
  expect(html).toContain('Left 50%')
  expect(html).toContain('2.5 m')
  expect(html).toContain('Stereo headphones')
  expect(html).toMatch(/aria-label="Playback left\/right position"[^>]*min="-1"[^>]*max="1"[^>]*step="0.1"[^>]*value="-0.5"/)
  expect(html).toMatch(/aria-label="Playback distance"[^>]*min="1"[^>]*max="5"[^>]*step="0.1"[^>]*value="2.5"/)
})
it('keeps stored spatial choices disabled while the master effects switch is off', () => {
  const html = renderToStaticMarkup(createElement(VoiceEffectsControls, {
    value: normalizeVoiceEffects({ spatial: true, spatialPosition: 0.5, spatialDistance: 3 }), onChange: vi.fn(),
  }))
  expect(html).toContain('Right 50%')
  expect(html).toContain('3.0 m')
  expect(html).toMatch(/aria-label="Playback left\/right position"[^>]*disabled=""/)
  expect(html).toMatch(/aria-label="Playback distance"[^>]*disabled=""/)
})

it('renders effects off with disabled sliders and available presets', () => {
  const html = renderToStaticMarkup(createElement(VoiceEffectsControls, { onChange: vi.fn(), onBend: vi.fn() }))
  expect(html).toContain('Playback effects')
  expect(html).toContain('Enable playback effects')
  expect(html).toContain('Momentary pitch bend')
  expect(html).toContain('Enable spatial audio')
  expect(html).toContain('Playback left/right position')
  expect(html).toContain('Playback distance')
  expect(html.match(/type="range"/g)).toHaveLength(6)
  expect(html.match(/disabled=""/g)).toHaveLength(8)
  expect(html).toContain('Reset effects')
})
it('keeps effects available during calls and displays an explicit processing failure', () => {
  const html = renderToStaticMarkup(createElement(VoiceEffectsControls, {
    value: VOICE_EFFECT_PRESETS.Deep, onChange: vi.fn(), onBend: vi.fn(),
    warning: 'Voice effects unavailable. Playing the original voice.',
  }))
  expect(html.match(/disabled=""/g)).toHaveLength(2) // Spatial stays off until explicitly selected.
  expect(html).toContain('-4.0')
  expect(html).toContain('role="status"')
  expect(html).toContain('Playing the original voice.')
})
