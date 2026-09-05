import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRealtimeSettings, saveRealtimeSettings } from './realtime-settings-storage'

afterEach(() => vi.unstubAllGlobals())

describe('voice settings storage', () => {
  it('isolates connections and restores the selected effort', () => {
    const entries = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) })
    saveRealtimeSettings('connection-a', { model: 'gpt-realtime-2.1', effort: 'high' })
    expect(loadRealtimeSettings('connection-a')).toEqual({ model: 'gpt-realtime-2.1', effort: 'high' })
    expect(loadRealtimeSettings('connection-b').effort).toBe('default')
  })
  it('remains usable if local storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(loadRealtimeSettings('connection-a').effort).toBe('default')
    expect(saveRealtimeSettings('connection-a', { model: 'gpt-realtime-2.1', effort: 'low' }).effort).toBe('low')
  })
})
