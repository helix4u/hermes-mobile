import { beforeEach, describe, expect, test } from 'vitest'
import type { LiveSessionSummary, SessionSummary } from '../protocol/types'
import { loadSessionSnapshot, persistSessionSnapshot } from './session-snapshot'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function stored(id: string): SessionSummary {
  return { id, title: id, preview: null, started_at: 1, message_count: 1, source: 'hermes-mobile' }
}

function active(id: string): LiveSessionSummary {
  return { id, status: 'working' }
}

describe('persisted session snapshots', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: new MemoryStorage() },
    })
  })

  test('isolates cached rosters by connection and profile', () => {
    persistSessionSnapshot('workstation', 'default', {
      sessions: [stored('local')],
      activeSessions: [active('local-live')],
    }, 10)
    persistSessionSnapshot('workstation', 'support', {
      sessions: [stored('support')],
      activeSessions: [],
    }, 20)
    persistSessionSnapshot('cloud', 'default', {
      sessions: [stored('cloud')],
      activeSessions: [],
    }, 30)

    expect(loadSessionSnapshot('workstation', 'default')).toEqual({
      sessions: [stored('local')],
      activeSessions: [active('local-live')],
      savedAt: 10,
    })
    expect(loadSessionSnapshot('workstation', 'support')?.sessions[0]?.id).toBe('support')
    expect(loadSessionSnapshot('cloud', 'default')?.sessions[0]?.id).toBe('cloud')
  })

  test('bounds stored and active rows and ignores corrupt cache data', () => {
    persistSessionSnapshot('host', 'default', {
      sessions: Array.from({ length: 140 }, (_, index) => stored(`s-${index}`)),
      activeSessions: Array.from({ length: 50 }, (_, index) => active(`a-${index}`)),
    })
    expect(loadSessionSnapshot('host', 'default')?.sessions).toHaveLength(100)
    expect(loadSessionSnapshot('host', 'default')?.activeSessions).toHaveLength(32)

    window.localStorage.setItem('hermes-mobile.sessions.v1.broken.default', '{')
    expect(loadSessionSnapshot('broken', 'default')).toBeNull()
  })
})
