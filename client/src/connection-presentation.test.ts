import { describe, expect, test } from 'vitest'
import { hostConnectionPresentation } from './connection-presentation'

describe('host connection presentation', () => {
  test('shows degraded capability state in the host pill', () => {
    expect(
      hostConnectionPresentation(
        'connected',
        'degraded',
        'Cloud agent',
        true,
      ),
    ).toEqual({ label: 'Degraded · Cloud agent', tone: 'degraded' })
  })

  test('distinguishes reconnecting from a user-disconnected host', () => {
    expect(
      hostConnectionPresentation('disconnected', undefined, 'Workstation', true),
    ).toEqual({ label: 'Reconnecting…', tone: 'connecting' })
    expect(
      hostConnectionPresentation(
        'disconnected',
        undefined,
        'Workstation',
        false,
      ),
    ).toEqual({ label: 'Connect', tone: 'disconnected' })
  })

  test('keeps the selected host name for a fully compatible connection', () => {
    expect(
      hostConnectionPresentation(
        'connected',
        'compatible',
        'Workstation',
        true,
      ),
    ).toEqual({ label: 'Workstation', tone: 'connected' })
  })
})
