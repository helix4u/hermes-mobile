import type { BrowserConnection } from '../transport/browser-transport'
import { parseHermesUrl } from '../transport/url'

const LEGACY_STORAGE_KEY = 'hermes-mobile.connection.v1'
const CONNECTIONS_STORAGE_KEY = 'hermes-mobile.connections.v2'
const ACTIVE_CONNECTION_STORAGE_KEY = 'hermes-mobile.active-connection.v2'
const DRAFT_PREFIX = 'hermes-mobile.draft.v1.'

interface ConnectionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PersistedConnection {
  id: string
  name: string
  baseUrl: string
  profile: string
  authMode: 'token' | 'oauth'
  connectionType: 'direct' | 'tailnet' | 'cloud'
}

function storageOrNull(): ConnectionStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `connection-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function currentOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

export function createConnection(
  overrides: Partial<BrowserConnection> = {},
): BrowserConnection {
  return {
    id: newId(),
    name: 'My Hermes',
    baseUrl: currentOrigin(),
    profile: 'default',
    token: '',
    authMode: 'token',
    connectionType: 'direct',
    ...overrides,
  }
}

export const defaultConnection: BrowserConnection = createConnection()

function normalizePersisted(value: unknown): PersistedConnection | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<PersistedConnection>
  if (!row.id || !row.baseUrl) return null
  try {
    return {
      id: row.id,
      name: row.name || 'My Hermes',
      baseUrl: parseHermesUrl(row.baseUrl).baseUrl,
      profile: row.profile || 'default',
      authMode: row.authMode === 'oauth' ? 'oauth' : 'token',
      connectionType:
        row.connectionType === 'cloud' || row.connectionType === 'tailnet'
          ? row.connectionType
          : 'direct',
    }
  } catch {
    return null
  }
}

function asConnection(connection: PersistedConnection): BrowserConnection {
  return {
    ...connection,
    token: '',
  }
}

function readStoredConnections(storage: ConnectionStorage): PersistedConnection[] {
  try {
    const parsed = JSON.parse(
      storage.getItem(CONNECTIONS_STORAGE_KEY) || '[]',
    ) as unknown
    return Array.isArray(parsed)
      ? parsed
          .map(normalizePersisted)
          .filter((row): row is PersistedConnection => row !== null)
      : []
  } catch {
    return []
  }
}

function migrateLegacyConnection(
  storage: ConnectionStorage,
): PersistedConnection[] {
  try {
    const raw = storage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const migrated = normalizePersisted(JSON.parse(raw))
    if (!migrated) return []
    storage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify([migrated]))
    storage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, migrated.id)
    storage.removeItem(LEGACY_STORAGE_KEY)
    return [migrated]
  } catch {
    return []
  }
}

export function loadConnections(
  storage = storageOrNull(),
): BrowserConnection[] {
  if (!storage) return []
  const stored = readStoredConnections(storage)
  const rows = stored.length > 0 ? stored : migrateLegacyConnection(storage)
  return rows.map(asConnection)
}

export function loadConnection(
  storage = storageOrNull(),
): BrowserConnection {
  if (!storage) return defaultConnection
  const connections = loadConnections(storage)
  if (connections.length === 0) return defaultConnection
  const activeId = storage.getItem(ACTIVE_CONNECTION_STORAGE_KEY)
  return (
    connections.find(connection => connection.id === activeId) ??
    connections[0]
  )
}

export function persistConnection(
  connection: BrowserConnection,
  storage = storageOrNull(),
): void {
  if (!storage) return
  const safe = normalizePersisted(connection)
  if (!safe) throw new Error('Enter a valid HTTPS Hermes URL')
  const existing = readStoredConnections(storage)
  const index = existing.findIndex(row => row.id === safe.id)
  const next =
    index < 0
      ? [...existing, safe]
      : existing.map((row, rowIndex) => (rowIndex === index ? safe : row))
  storage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(next))
  storage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, safe.id)
}

export function removeConnection(
  connectionId: string,
  storage = storageOrNull(),
): BrowserConnection[] {
  if (!storage) return []
  const next = readStoredConnections(storage).filter(
    row => row.id !== connectionId,
  )
  storage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(next))
  storage.removeItem(`${DRAFT_PREFIX}${connectionId}`)
  if (storage.getItem(ACTIVE_CONNECTION_STORAGE_KEY) === connectionId) {
    if (next[0]) {
      storage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, next[0].id)
    } else {
      storage.removeItem(ACTIVE_CONNECTION_STORAGE_KEY)
    }
  }
  return next.map(asConnection)
}

export function loadDraft(connectionId: string): string {
  const storage = storageOrNull()
  if (!storage) return ''
  return storage.getItem(`${DRAFT_PREFIX}${connectionId}`) ?? ''
}

export function persistDraft(connectionId: string, draft: string): void {
  const storage = storageOrNull()
  if (!storage) return
  const key = `${DRAFT_PREFIX}${connectionId}`
  if (draft) {
    storage.setItem(key, draft)
  } else {
    storage.removeItem(key)
  }
}
