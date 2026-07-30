import { describe, expect, test } from 'vitest'
import { isMissingCapabilityError } from './capability-errors'

describe('missing host capabilities', () => {
  test('recognizes missing HTTP routes and JSON-RPC methods', () => {
    expect(
      isMissingCapabilityError(
        Object.assign(new Error('Not Found'), { status: 404 }),
      ),
    ).toBe(true)
    expect(
      isMissingCapabilityError(
        new Error('No such API endpoint: /api/audio/tts/providers'),
      ),
    ).toBe(true)
    expect(
      isMissingCapabilityError(
        new Error(
          'Hermes RPC -32601: unknown method: pet.personality.list',
        ),
      ),
    ).toBe(true)
  })

  test('does not hide authentication, timeout, or model failures', () => {
    expect(
      isMissingCapabilityError(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
      ),
    ).toBe(false)
    expect(isMissingCapabilityError(new Error('Gateway timed out'))).toBe(false)
    expect(
      isMissingCapabilityError(new Error('Auxiliary model request failed')),
    ).toBe(false)
  })
})
