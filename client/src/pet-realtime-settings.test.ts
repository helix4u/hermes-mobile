import { describe, expect, it } from 'vitest'
import { normalizeRealtimeSettings, realtimeSettingsParams, REALTIME_MODELS, supportsRealtimeEffort } from './pet-realtime-settings'

describe('Realtime call settings', () => {
  it('migrates every legacy gate to mandatory card review without leaking it to the provider', () => {
    const value = {model:'gpt-realtime-2.1-mini',effort:'default',mode:'session',approval:'off',noiseReduction:'far_field',microphoneId:'synthetic'}
    expect(normalizeRealtimeSettings(value)).toMatchObject({...value, approval:'on'})
    expect(realtimeSettingsParams(value)).toEqual({voiceEngine:'realtime',model:value.model,interactionMode:'session',noiseReduction:'far_field'})
    expect(normalizeRealtimeSettings({...value,approval:'verbal'}).approval).toBe('on')
    expect(normalizeRealtimeSettings({...value,approval:'smart'}).approval).toBe('on')
    expect(normalizeRealtimeSettings({...value,approval:'garbage'}).approval).toBe('on')
  })
  it('preserves existing provider behavior until the user selects an effort', () => {
    expect(realtimeSettingsParams(null)).toEqual({ voiceEngine: 'realtime', model: 'gpt-realtime-2.1-mini' })
  })
  it('passes explicit effort to the backend without changing the chosen model', () => {
    expect(realtimeSettingsParams({ model: 'gpt-realtime-2.1', effort: 'medium' })).toEqual({ voiceEngine: 'realtime', model: 'gpt-realtime-2.1', reasoningEffort: 'medium' })
  })
  it('never sends reasoning settings to a non-reasoning model', () => {
    for (const model of REALTIME_MODELS.filter(model => !supportsRealtimeEffort(model))) {
      expect(realtimeSettingsParams({ model, effort: 'high' })).toEqual({ voiceEngine: 'realtime', model })
    }
  })
  it('recovers corrupt stored values without accepting arbitrary model names or efforts', () => {
    expect(normalizeRealtimeSettings({ model: {}, effort: 'ultra' })).toEqual(normalizeRealtimeSettings(null))
    expect(normalizeRealtimeSettings({ model: 'gpt-realtime-2.1', effort: {} })).toEqual({ engine: 'realtime', model: 'gpt-realtime-2.1', effort: 'default' })
  })
})
it('preserves the additive GPT-Live engine without replacing the Realtime default', () => {
  expect(normalizeRealtimeSettings({ engine: 'live' }).engine).toBe('live')
  expect(realtimeSettingsParams({ engine: 'live' }).voiceEngine).toBe('live')
  expect(normalizeRealtimeSettings({ engine: 'unknown' }).engine).toBe('realtime')
})
it('preserves explicit worker budgets without inventing one for older preferences', () => {
  expect(normalizeRealtimeSettings({maxWorkers:0}).maxWorkers).toBe(0)
  expect(normalizeRealtimeSettings({maxWorkers:4}).maxWorkers).toBe(4)
  for (const maxWorkers of [undefined, '4', true, -1, 1.5, 17]) {
    expect(normalizeRealtimeSettings({maxWorkers}).maxWorkers).toBeUndefined()
  }
})
