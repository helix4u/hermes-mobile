import type { LiveSessionSummary, SessionSummary } from '../protocol/types'

const VERSION = 1
const MAX_STORED_SESSIONS = 100
const MAX_ACTIVE_SESSIONS = 32

export interface PersistedSessionSnapshot {
  sessions: SessionSummary[]
  activeSessions: LiveSessionSummary[]
  savedAt: number
}

function snapshotKey(connectionId: string, profile: string): string {
  return `hermes-mobile.sessions.v${VERSION}.${encodeURIComponent(connectionId)}.${encodeURIComponent(profile || 'default')}`
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function sessionRows(value: unknown): SessionSummary[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is SessionSummary => Boolean(row && typeof row === 'object' && typeof row.id === 'string'))
    .slice(0, MAX_STORED_SESSIONS)
}

function activeRows(value: unknown): LiveSessionSummary[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is LiveSessionSummary => Boolean(row && typeof row === 'object' && typeof row.id === 'string'))
    .slice(0, MAX_ACTIVE_SESSIONS)
}

export function loadSessionSnapshot(
  connectionId: string,
  profile: string,
): PersistedSessionSnapshot | null {
  const target = storage()
  if (!target || !connectionId) return null
  try {
    const raw = target.getItem(snapshotKey(connectionId, profile))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      sessions: sessionRows(parsed.sessions),
      activeSessions: activeRows(parsed.activeSessions),
      savedAt: Number.isFinite(Number(parsed.savedAt)) ? Number(parsed.savedAt) : 0,
    }
  } catch {
    return null
  }
}

export function persistSessionSnapshot(
  connectionId: string,
  profile: string,
  snapshot: Pick<PersistedSessionSnapshot, 'sessions' | 'activeSessions'>,
  savedAt = Date.now(),
): void {
  const target = storage()
  if (!target || !connectionId) return
  try {
    target.setItem(
      snapshotKey(connectionId, profile),
      JSON.stringify({
        sessions: sessionRows(snapshot.sessions),
        activeSessions: activeRows(snapshot.activeSessions),
        savedAt,
      } satisfies PersistedSessionSnapshot),
    )
  } catch {
    // A cache write is never allowed to make the live connection fail.
  }
}
