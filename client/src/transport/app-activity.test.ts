import { describe, expect, test } from 'vitest'
import {
  becameActive,
  usesDocumentVisibility,
} from './app-activity'

describe('app activity reconciliation', () => {
  test('schedules one foreground probe only on an inactive-to-active edge', () => {
    expect(becameActive(true, true)).toBe(false)
    expect(becameActive(true, false)).toBe(false)
    expect(becameActive(false, false)).toBe(false)
    expect(becameActive(false, true)).toBe(true)
  })

  test('uses the native lifecycle as the sole authority on Android', () => {
    expect(usesDocumentVisibility(true)).toBe(false)
    expect(usesDocumentVisibility(false)).toBe(true)
  })
})
