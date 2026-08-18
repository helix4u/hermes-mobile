import type { LiveSessionSummary, SessionSummary } from '../protocol/types'

function selectedSessionKey(connectionId: string): string {
  return `hermes-mobile.session.${connectionId}.selected`
}

export function loadSelectedSession(connectionId: string): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(selectedSessionKey(connectionId))?.trim() || ''
}

export function persistSelectedSession(
  connectionId: string,
  sessionId: string,
): void {
  const value = sessionId.trim()
  if (!value) {
    window.localStorage.removeItem(selectedSessionKey(connectionId))
    return
  }
  window.localStorage.setItem(selectedSessionKey(connectionId), value)
}

export type SessionRestoreTarget =
  | { kind: 'active'; session: LiveSessionSummary }
  | { kind: 'stored'; session: SessionSummary }
  | null

export function sessionRestoreTarget(
  selectedStoredId: string,
  sessions: SessionSummary[],
  activeSessions: LiveSessionSummary[],
): SessionRestoreTarget {
  const selected = selectedStoredId.trim()
  if (!selected) return null
  const active = activeSessions.find(
    session => session.session_key === selected || session.id === selected,
  )
  if (active) return { kind: 'active', session: active }
  const stored = sessions.find(session => session.id === selected)
  return {
    kind: 'stored',
    session:
      stored ??
      ({
        id: selected,
        title: null,
        preview: null,
        started_at: 0,
        message_count: 0,
        source: null,
      } satisfies SessionSummary),
  }
}
