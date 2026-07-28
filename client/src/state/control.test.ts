import { describe, expect, test } from 'vitest'
import { modelConfigValue, nextRunLabel } from './control'

describe('control surface helpers', () => {
  test('keeps model changes session-scoped unless persistence is requested', () => {
    expect(modelConfigValue('gpt-5', 'openai', false, true)).toBe(
      'gpt-5 --provider openai',
    )
    expect(modelConfigValue('gpt-5', 'openai', true, true)).toBe(
      'gpt-5 --provider openai --global',
    )
    expect(modelConfigValue('gpt-5', 'openai', false, false)).toBe(
      'gpt-5 --provider openai --global',
    )
  })

  test('renders absent and invalid schedules without inventing a date', () => {
    expect(nextRunLabel(null, 'en-US')).toBe('No next run')
    expect(nextRunLabel('not-a-date', 'en-US')).toBe('not-a-date')
  })
})
