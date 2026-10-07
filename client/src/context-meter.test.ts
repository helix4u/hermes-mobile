import { describe, expect, it } from 'vitest'
import { contextMeterValues } from './context-meter'

describe('context occupancy, not lifetime usage', () => {
  it('shows used, remaining and the effective compression token threshold', () => {
    expect(contextMeterValues({ context_used: 45000, context_max: 100000, context_estimated: false, compression_threshold_tokens: 60000 }))
      .toEqual({ used: 45000, maximum: 100000, remaining: 55000, percent: 45, estimated: false, threshold: 60000 })
  })
  it('does not guess a threshold or show invalid capacity as zero usage', () => {
    expect(contextMeterValues({ context_used: 100, context_max: 0, context_estimated: false })).toBeNull()
    expect(contextMeterValues({ context_used: NaN, context_max: 1000, context_estimated: false })).toBeNull()
    expect(contextMeterValues({ context_used: 1500, context_max: 1000, context_estimated: true })?.remaining).toBe(0)
    expect(contextMeterValues({ context_used: 0, context_max: 1000, context_estimated: true })?.threshold).toBeNull()
  })
})
