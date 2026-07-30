import { describe, expect, it } from 'vitest'
import {
  loadConnection,
  loadConnections,
  persistConnection,
  removeConnection,
} from './connection'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('connection registry', () => {
  it('migrates the legacy singleton without persisting a token', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'hermes-mobile.connection.v1',
      JSON.stringify({
        id: 'workstation',
        name: 'Workstation',
        baseUrl: 'https://workstation.example.ts.net/',
        profile: 'default',
        authMode: 'token',
        connectionType: 'tailnet',
        token: 'must-not-survive',
      }),
    )

    expect(loadConnection(storage)).toMatchObject({
      id: 'workstation',
      baseUrl: 'https://workstation.example.ts.net',
      token: '',
    })
    expect(storage.getItem('hermes-mobile.connection.v1')).toBeNull()
    expect(storage.getItem('hermes-mobile.connections.v2')).not.toContain(
      'must-not-survive',
    )
  })

  it('keeps a separate saved record and active selection per host', () => {
    const storage = new MemoryStorage()
    persistConnection(
      {
        id: 'tailnet',
        name: 'Workstation',
        baseUrl: 'https://workstation.example.ts.net',
        profile: 'default',
        token: 'keystore-only',
        authMode: 'token',
        connectionType: 'tailnet',
      },
      storage,
    )
    persistConnection(
      {
        id: 'cloud-agent',
        name: 'Cloud Agent',
        baseUrl: 'https://agent.example.cloud',
        profile: 'default',
        token: '',
        authMode: 'oauth',
        connectionType: 'cloud',
      },
      storage,
    )

    expect(loadConnections(storage).map(row => row.id)).toEqual([
      'tailnet',
      'cloud-agent',
    ])
    expect(loadConnection(storage).id).toBe('cloud-agent')
    expect(storage.getItem('hermes-mobile.connections.v2')).not.toContain(
      'keystore-only',
    )
  })

  it('removes one host, its draft, and selects a remaining host', () => {
    const storage = new MemoryStorage()
    persistConnection(
      {
        id: 'workstation',
        name: 'Workstation',
        baseUrl: 'https://workstation.example',
        profile: 'default',
        token: '',
        authMode: 'token',
        connectionType: 'direct',
      },
      storage,
    )
    persistConnection(
      {
        id: 'cloud',
        name: 'Cloud',
        baseUrl: 'https://cloud.example',
        profile: 'default',
        token: '',
        authMode: 'oauth',
        connectionType: 'cloud',
      },
      storage,
    )
    storage.setItem('hermes-mobile.draft.v1.cloud', 'private draft')

    expect(removeConnection('cloud', storage).map(row => row.id)).toEqual([
      'workstation',
    ])
    expect(loadConnection(storage).id).toBe('workstation')
    expect(storage.getItem('hermes-mobile.draft.v1.cloud')).toBeNull()
  })
})
