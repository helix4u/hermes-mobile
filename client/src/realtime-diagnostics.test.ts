import { describe, expect, it } from 'vitest'
import { voiceFailureReason, voiceProviderFailurePhase } from './realtime-diagnostics'

describe('content-free voice failure diagnostics', () => {
  it.each([
    [{ code: 'response_cancel_not_active' }, 'cancel_already_complete'],
    [{ code: 4007 }, 'session_missing'],
    [{ code: 5031 }, 'context_backend_error'],
    [{ code: 5031, message: 'Instructions cannot be longer than 65536 tokens' }, 'context_capacity'],
    [new Error('Gateway not connected'), 'disconnected'],
    [new Error('request timed out after 30s'), 'timeout'],
    [new Error('Read cancelled by user interruption; request again'), 'interrupted'],
    [{ code: 'private_value', message: 'Private context and credential' }, 'unknown'],
    [{ code: '__proto__' }, 'unknown'],
  ])('classifies failures without copying their contents', (error, expected) => {
    expect(voiceFailureReason(error)).toBe(expected)
  })
  it('distinguishes benign cancellation races from real response failure', () => {
    expect(voiceProviderFailurePhase({ type: 'error', error: { code: 'response_cancel_not_active' } }))
      .toBe('provider.error.cancel_already_complete')
    expect(voiceProviderFailurePhase({ type: 'response.done', response: { status: 'failed', status_details: { error: { code: 'rate_limit_exceeded' } } } }))
      .toBe('provider.response_failed.rate_limited')
    expect(voiceProviderFailurePhase({ type: 'response.done', response: { status: 'completed' } })).toBeNull()
  })
})
