import { describe, expect, it } from 'vitest'
import { realtimeError } from './pet-realtime-events'
import { normalizeRealtimeSettings, realtimeSettingsParams } from './pet-realtime-settings'

describe('realtime failures and diagnostics', () => {
  it('surfaces failed generation even when the provider did not emit an error frame', () => {
    expect(realtimeError({ type: 'response.done', response: { status: 'failed',
      status_details: { error: { code: 'rate_limit_exceeded', message: 'private request payload' } } } }))
      .toBe('Live voice response failed (rate_limit_exceeded). Retry live voice.')
    expect(realtimeError({ type: 'response.done', response: { status: 'completed' } })).toBe('')
    expect(realtimeError({ type: 'response.done', response: { status: 'cancelled' } })).toBe('')
  })
  it('reports failed transcription instead of looking ready forever', () => {
    expect(realtimeError({ type: 'conversation.item.input_audio_transcription.failed' })).toContain('could not transcribe')
  })
  it('treats cancellation of already completed output as benign', () => {
    expect(realtimeError({ type: 'error', error: { code: 'response_cancel_not_active' } })).toBe('')
  })
  it('keeps opt-in diagnostics local and outside the model request', () => {
    expect(normalizeRealtimeSettings(null).diagnostics).toBeUndefined()
    const enabled = normalizeRealtimeSettings({ diagnostics: true })
    expect(enabled.diagnostics).toBe(true)
    expect(realtimeSettingsParams(enabled)).not.toHaveProperty('diagnostics')
  })
})
