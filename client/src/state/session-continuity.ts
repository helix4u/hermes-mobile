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

export function selectedSessionForDisplay(
  selectedStoredId: string,
  runtimeSessionId: string,
  sessions: SessionSummary[],
  activeSessions: LiveSessionSummary[],
): SessionSummary | null {
  const selected = selectedStoredId.trim()
  const runtime = runtimeSessionId.trim()
  const active = activeSessions.find(
    session =>
      (runtime && session.id === runtime) ||
      (selected && (session.session_key === selected || session.id === selected)),
  )
  const durable = sessions.find(
    session =>
      (selected && session.id === selected) ||
      (active?.session_key && session.id === active.session_key),
  )

  if (durable) {
    return {
      ...durable,
      title: durable.title || active?.title || null,
      preview: durable.preview || active?.preview || null,
    }
  }
  if (!active) return null

  return {
    id: active.session_key || selected || active.id,
    title: active.title ?? null,
    preview: active.preview ?? null,
    started_at: active.started_at ?? 0,
    last_active: active.last_active,
    message_count: active.message_count ?? 0,
    source: 'hermes-mobile',
    model: active.model,
  }
}

export function eventTargetsSelectedSession(
  eventSessionId: string,
  runtimeSessionId: string,
  selectedStoredId: string,
  payloadStoredSessionId = '',
): boolean {
  const eventId = eventSessionId.trim()
  const runtimeId = runtimeSessionId.trim()
  const storedId = selectedStoredId.trim()
  const payloadStoredId = payloadStoredSessionId.trim()

  if (!runtimeId && !storedId) return false
  if (!eventId) return true
  if (eventId === runtimeId || eventId === storedId) return true
  return Boolean(storedId && payloadStoredId === storedId)
}

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
