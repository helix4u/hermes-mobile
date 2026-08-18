import { describe, expect, test } from 'vitest'
import { canSubmitComposer } from './composer'

describe('composer controls', () => {
  test('keeps active-turn interrupt and steer input available', () => {
    expect(canSubmitComposer(true, true, true, 'steer this way')).toBe(true)
    expect(canSubmitComposer(true, true, false, 'wait')).toBe(false)
    expect(canSubmitComposer(false, false, true, 'offline')).toBe(false)
    expect(canSubmitComposer(true, false, false, '   ')).toBe(false)
  })
})
