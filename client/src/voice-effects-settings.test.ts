import { afterEach, expect, it, vi } from 'vitest'
import { liveEffectsSettings, normalizeVoiceEffects, VOICE_EFFECT_PRESETS } from './voice-effects-settings'
import { normalizeRealtimeSettings, realtimeSettingsParams } from './pet-realtime-settings'
import { loadRealtimeSettings, saveRealtimeSettings } from './realtime-settings-storage'

afterEach(() => vi.unstubAllGlobals())
it('defaults off and clamps malformed DSP preferences', () => {
  expect(normalizeVoiceEffects(null).enabled).toBe(false)
  expect(normalizeVoiceEffects({ enabled: 'yes', pitch: Infinity, bass: -100, treble: 100, radio: 1 }))
    .toEqual({ enabled: false, pitch: 0, bass: -12, treble: 12, radio: false,
      spatial: false, spatialPosition: 0, spatialDistance: 1 })
})
it('isolates saved effects by connection and keeps them out of provider parameters', () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value) })
  const settings = normalizeRealtimeSettings({ engine: 'live', effects: { enabled: true, pitch: -4,
    spatial: true, spatialPosition: -0.7, spatialDistance: 2.5 } })
  saveRealtimeSettings('effects-a', settings)
  expect(loadRealtimeSettings('effects-a').effects).toMatchObject({ pitch: -4,
    spatial: true, spatialPosition: -0.7, spatialDistance: 2.5 })
  expect(loadRealtimeSettings('effects-b').effects).toBeUndefined()
  expect(realtimeSettingsParams(settings)).not.toHaveProperty('effects')
})
it('upgrades old saved effects without opting into spatial playback', () => {
  expect(normalizeVoiceEffects({ enabled: true, pitch: -4, bass: 3, treble: -2, radio: false }))
    .toEqual({ enabled: true, pitch: -4, bass: 3, treble: -2, radio: false,
      spatial: false, spatialPosition: 0, spatialDistance: 1 })
  for (const preset of Object.values(VOICE_EFFECT_PRESETS)) {
    expect(preset).toMatchObject({ spatial: false, spatialPosition: 0, spatialDistance: 1 })
  }
})
it('bounds and rounds spatial controls, rejecting nonfinite and malformed preferences', () => {
  expect(normalizeVoiceEffects({ spatial: true, spatialPosition: -20, spatialDistance: 100 }))
    .toMatchObject({ spatial: true, spatialPosition: -1, spatialDistance: 5 })
  expect(normalizeVoiceEffects({ spatial: true, spatialPosition: 20, spatialDistance: -100 }))
    .toMatchObject({ spatial: true, spatialPosition: 1, spatialDistance: 1 })
  for (const value of [NaN, Infinity, -Infinity, '3', null]) {
    expect(normalizeVoiceEffects({ spatial: 'yes', spatialPosition: value, spatialDistance: value }))
      .toMatchObject({ spatial: false, spatialPosition: 0, spatialDistance: 1 })
  }
  expect(normalizeVoiceEffects({ spatialPosition: 0.26, spatialDistance: 2.26 }))
    .toMatchObject({ spatialPosition: 0.3, spatialDistance: 2.3 })
})
it('allows playback changes while freezing active provider and microphone choices', () => {
  const current = normalizeRealtimeSettings({ engine: 'live', microphoneId: 'old', maxWorkers: 0 })
  const requested = normalizeRealtimeSettings({ engine: 'realtime', microphoneId: 'new', maxWorkers: 8,
    effects: { enabled: true, pitch: 5, spatial: true, spatialPosition: -0.8, spatialDistance: 4 } })
  expect(liveEffectsSettings(current, requested)).toMatchObject({ engine: 'live', microphoneId: 'old', maxWorkers: 0,
    effects: { enabled: true, pitch: 5, spatial: true, spatialPosition: -0.8, spatialDistance: 4 } })
})
