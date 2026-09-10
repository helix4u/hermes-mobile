import { describe, expect, test } from 'vitest'
import { assertHttpProfile, canOpenProfileNotification, migrateProfileState, profileLiveSessions, profileStateKey, scopedHttpPath, scopedRpcParams, verifyProfileResult } from './profiles'

describe('profile boundaries', () => {
  test('a profile-less notification cannot switch hosts or resume an unverified runtime', () => {
    expect(canOpenProfileNotification({ connectionId: 'host', runtimeSessionId: 'known' }, 'host', 'known')).toBe(true)
    expect(canOpenProfileNotification({ connectionId: 'host', runtimeSessionId: 'foreign' }, 'host', 'known')).toBe(false)
    expect(canOpenProfileNotification({ connectionId: 'host', runtimeSessionId: 'known' }, 'other', 'known')).toBe(false)
    expect(canOpenProfileNotification({ connectionId: 'host', runtimeSessionId: '' }, 'host', '')).toBe(false)
  })
  test('connection/profile pairs cannot share a UI cache key', () => {
    const key = (id: string, profile: string) => profileStateKey({ id, profile })
    expect(new Set([key('host', 'default'), key('host', 'writer'), key('host:writer', 'default'), key('other', 'writer')]).size).toBe(4)
  })
  test('migrates the previously selected profile once and keeps recovery data', () => {
    const values = new Map<string, string>([
      ['hermes-mobile.session.host.selected', 'old-session'],
      ['hermes-mobile.draft.v1.host', 'unfinished draft'],
      ['hermes-mobile.reader.host.draft', 'unfinished reading'],
      ['hermes-mobile.pet.v1.host', '{"personalitySlug":"synthetic"}'],
    ])
    const storage: Storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
      removeItem: key => { values.delete(key) },
      clear: () => values.clear(),
      key: index => [...values.keys()][index] ?? null,
      get length() { return values.size },
    }
    migrateProfileState({ id: 'host', profile: 'writer' }, storage)
    migrateProfileState({ id: 'host', profile: 'default' }, storage)
    expect(values.get(`hermes-mobile.session.${profileStateKey({ id: 'host', profile: 'writer' })}.selected`)).toBe('old-session')
    expect(values.has(`hermes-mobile.session.${profileStateKey({ id: 'host', profile: 'default' })}.selected`)).toBe(false)
    expect(values.get('hermes-mobile.session.host.selected')).toBe('old-session')
    expect(values.get(`hermes-mobile.reader.${profileStateKey({ id: 'host', profile: 'writer' })}.draft`)).toBe('unfinished reading')
    expect(values.get(`hermes-mobile.pet.v1.${profileStateKey({ id: 'host', profile: 'writer' })}`)).toBe('{"personalitySlug":"synthetic"}')
  })
  test('default means default, never the process launch profile', () => {
    expect(scopedRpcParams('default', { profile: '', session_id: 's' })).toEqual({ profile: 'default', session_id: 's' })
    expect(scopedRpcParams('writer', {})).toEqual({ profile: 'writer' })
    expect(() => scopedRpcParams('writer', { profile: 'default' })).toThrow('different profile')
  })
  test('wrong or absent backend profile receipts fail closed before submission', () => {
    expect(() => verifyProfileResult('writer', 'session.resume', { info: { profile_name: 'other' } })).toThrow('did not confirm')
    expect(() => verifyProfileResult('writer', 'session.create', {})).toThrow('did not confirm')
    const valid = { session_id: 'runtime', info: { profile_name: 'writer' } }
    expect(verifyProfileResult('writer', 'session.activate', valid)).toBe(valid)
    expect(() => assertHttpProfile('/api/config?profile=writer', 'writer', { profile: 'other' })).toThrow('different profile')
    expect(() => assertHttpProfile('/api/env?profile=writer', 'writer', { profile: 'other' })).toThrow('different profile')
  })
  test('scopes supported HTTP routes and preserves the authenticated host/plugin boundary', () => {
    expect(scopedHttpPath('/api/config', 'writer')).toBe('/api/config?profile=writer')
    expect(scopedHttpPath('/api/audio/voice-config', 'writer')).toBe('/api/audio/voice-config?profile=writer')
    expect(scopedHttpPath('/api/env', 'default')).toBe('/api/env?profile=default')
    expect(scopedHttpPath('/api/cron/jobs?profile=writer&limit=20', 'writer')).toBe('/api/cron/jobs?profile=writer&limit=20')
    expect(scopedHttpPath('/api/auth/ws-ticket', 'writer')).toBe('/api/auth/ws-ticket')
    expect(scopedHttpPath('/api/plugins/support-ops/health', 'writer')).toBe('/api/plugins/support-ops/health')
    expect(() => scopedHttpPath('/api/config?profile=other', 'writer')).toThrow('different profile')
    expect(() => scopedHttpPath('/api/fs/default-cwd', 'writer')).toThrow('profile-scoped')
  })
  test('unattributed legacy runtime IDs never establish a cross-profile attachment', () => {
    const rows = [
      { id: 'unknown', status: 'working', session_key: 'colliding-durable-id' },
      { id: 'mine', status: 'working' },
      { id: 'foreign', status: 'working', profile_name: 'other' },
      { id: 'explicit', status: 'working', profile_name: 'writer' },
    ]
    expect(profileLiveSessions(rows, 'writer', 'mine').map(row => row.id)).toEqual(['mine', 'explicit'])
    expect(profileLiveSessions(rows, 'default', '').map(row => row.id)).toEqual([])
  })
})
