import { describe, expect, test } from 'vitest'
import { isMissingVoiceCatalogError } from './useVoiceCatalog'

describe('voice catalog compatibility', () => {
  test('recognizes browser, native, and generic missing-route errors', () => {
    expect(
      isMissingVoiceCatalogError(
        Object.assign(new Error('Not Found'), { status: 404 }),
      ),
    ).toBe(true)
    expect(
      isMissingVoiceCatalogError(
        new Error('/api/audio/tts/providers returned HTTP 404'),
      ),
    ).toBe(true)
    expect(isMissingVoiceCatalogError(new Error('Not Found'))).toBe(true)
    expect(isMissingVoiceCatalogError(new Error('404: Not Found'))).toBe(true)
    expect(
      isMissingVoiceCatalogError(
        new Error('Native request failed because the route was not_found'),
      ),
    ).toBe(true)
    expect(
      isMissingVoiceCatalogError(
        new Error('No such API endpoint: /api/audio/tts/providers'),
      ),
    ).toBe(true)
  })

  test('does not hide authentication, provider, or network failures', () => {
    expect(
      isMissingVoiceCatalogError(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
      ),
    ).toBe(false)
    expect(isMissingVoiceCatalogError(new Error('Gateway timed out'))).toBe(
      false,
    )
  })
})
