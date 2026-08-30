import { beforeEach, describe, expect, test } from 'vitest'
import type { LiveSessionSummary, SessionSummary } from '../protocol/types'
import {
  eventTargetsSelectedSession,
  loadSelectedSession,
  persistSelectedSession,
  selectedSessionForDisplay,
  sessionRestoreTarget,
} from './session-continuity'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const stored: SessionSummary = {
  id: 'stored-1',
  title: 'Continuity',
  preview: null,
  started_at: 1,
  message_count: 2,
  source: 'hermes-mobile',
}
const active: LiveSessionSummary = {
  id: 'runtime-1',
  session_key: 'stored-1',
  status: 'working',
}

describe('connection-scoped session continuity', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: new MemoryStorage() },
    })
  })

  test('persists the selected durable session per connection', () => {
    persistSelectedSession('workstation', 'stored-1')
    persistSelectedSession('cloud', 'stored-2')
    expect(loadSelectedSession('workstation')).toBe('stored-1')
    expect(loadSelectedSession('cloud')).toBe('stored-2')
    persistSelectedSession('workstation', '')
    expect(loadSelectedSession('workstation')).toBe('')
  })

  test('reattaches a live runtime before cold-resuming its durable history', () => {
    expect(sessionRestoreTarget('stored-1', [stored], [active])).toEqual({
      kind: 'active',
      session: active,
    })
    expect(sessionRestoreTarget('stored-1', [stored], [])).toEqual({
      kind: 'stored',
      session: stored,
    })
  })

  test('can resume a durable session that fell outside the recent list', () => {
    expect(sessionRestoreTarget('older-session', [], [])).toMatchObject({
      kind: 'stored',
      session: { id: 'older-session' },
    })
  })

  test('uses the live runtime to resolve a compression-rotated durable row', () => {
    const tip = { ...stored, id: 'stored-tip', title: 'Friendly greeting #8' }
    const rotatedActive = {
      ...active,
      session_key: 'stored-tip',
      title: 'Friendly greeting #8',
    }

    expect(
      selectedSessionForDisplay(
        'stored-parent',
        'runtime-1',
        [tip],
        [rotatedActive],
      ),
    ).toMatchObject({
      id: 'stored-tip',
      title: 'Friendly greeting #8',
    })
  })

  test('falls back to live metadata while the durable roster refreshes', () => {
    expect(
      selectedSessionForDisplay('stored-1', 'runtime-1', [], [
        { ...active, title: 'Friendly greeting #8' },
      ]),
    ).toMatchObject({
      id: 'stored-1',
      title: 'Friendly greeting #8',
    })
  })

  test('accepts only events for the selected runtime or durable conversation', () => {
    expect(
      eventTargetsSelectedSession('runtime-1', 'runtime-1', 'stored-1'),
    ).toBe(true)
    expect(
      eventTargetsSelectedSession('stored-1', 'runtime-1', 'stored-1'),
    ).toBe(true)
    expect(
      eventTargetsSelectedSession(
        'runtime-rebuilt',
        'runtime-1',
        'stored-1',
        'stored-1',
      ),
    ).toBe(true)
    expect(
      eventTargetsSelectedSession('runtime-other', 'runtime-1', 'stored-1'),
    ).toBe(false)
    expect(eventTargetsSelectedSession('', '', '')).toBe(false)
  })
})
