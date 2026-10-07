import { describe, expect, test } from 'vitest'
import {
  becameActive,
  usesDocumentVisibility,
  mayReconnectForPlayback,
} from './app-activity'

describe('app activity reconciliation', () => {
  test('keeps native active audio recoverable while locked without waking idle surfaces', () => {
    expect(mayReconnectForPlayback(true, false, true, false, false)).toBe(true)
    expect(mayReconnectForPlayback(true, false, false, true, false)).toBe(true)
    expect(mayReconnectForPlayback(true, false, false, false, true)).toBe(true)
    expect(mayReconnectForPlayback(true, false, false, false, false)).toBe(false)
    expect(mayReconnectForPlayback(false, false, true, true, true)).toBe(false)
    expect(mayReconnectForPlayback(false, true, false, false, false)).toBe(true)
  })
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
