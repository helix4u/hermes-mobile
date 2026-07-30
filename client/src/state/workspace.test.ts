import { beforeEach, describe, expect, test } from 'vitest'
import {
  loadPreferredWorkspace,
  persistPreferredWorkspace,
  sessionCreateParams,
} from './workspace'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('connection-scoped session workspaces', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: new MemoryStorage() },
    })
  })

  test('keeps each connection cwd isolated', () => {
    persistPreferredWorkspace('tailnet', 'C:\\work\\hermes')
    persistPreferredWorkspace('cloud', '/workspace/cloud')

    expect(loadPreferredWorkspace('tailnet')).toBe('C:\\work\\hermes')
    expect(loadPreferredWorkspace('cloud')).toBe('/workspace/cloud')
  })

  test('passes an explicit cwd when creating a mobile session', () => {
    expect(
      sessionCreateParams({
        cwd: ' C:\\work\\hermes ',
        preview: 'hello',
        profile: 'default',
      }),
    ).toEqual({
      cols: 100,
      cwd: 'C:\\work\\hermes',
      preview: 'hello',
      profile: '',
      source: 'hermes-mobile',
    })
  })

  test('omits cwd only when no workspace has been resolved', () => {
    expect(
      sessionCreateParams({
        cwd: '',
        profile: 'coder',
      }),
    ).toEqual({
      cols: 100,
      profile: 'coder',
      source: 'hermes-mobile',
    })
  })
})

