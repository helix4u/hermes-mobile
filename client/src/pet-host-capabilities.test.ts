import { describe, expect, test } from 'vitest'
import { resolvePetCapabilityProbe } from './pet-host-capabilities'

describe('pet host capability probing', () => {
  test('enables the complete server-backed pet bundle after a successful probe', () => {
    expect(
      resolvePetCapabilityProbe({
        status: 'fulfilled',
        value: { personalities: [] },
      }),
    ).toEqual({
      capabilities: {
        commentary: true,
        mode: 'full',
        personalities: true,
        sidechat: true,
      },
      error: '',
    })
  })

  test('uses a silent visual-only mode for vanilla Hermes hosts', () => {
    expect(
      resolvePetCapabilityProbe({
        reason: new Error(
          'Hermes RPC -32601: unknown method: pet.personality.list',
        ),
        status: 'rejected',
      }),
    ).toEqual({
      capabilities: {
        commentary: false,
        mode: 'visual-only',
        personalities: false,
        sidechat: false,
      },
      error: '',
    })
  })

  test('keeps unexpected probe failures visible without disabling the built-in pet', () => {
    expect(
      resolvePetCapabilityProbe({
        reason: new Error('Gateway timed out'),
        status: 'rejected',
      }),
    ).toEqual({
      capabilities: {
        commentary: false,
        mode: 'visual-only',
        personalities: false,
        sidechat: false,
      },
      error: 'Gateway timed out',
    })
  })
})
