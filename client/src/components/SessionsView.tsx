import { useEffect, useMemo, useState } from 'react'
import type {
  LiveSessionSummary,
  ProjectTree,
  SessionSummary,
} from '../protocol/types'
import {
  groupProjectRowsByFolder,
  groupSessionsByFolder,
  isCompactedSession,
  projectSessionRows,
  sessionMatches,
} from '../state/sessions'

interface SessionsViewProps {
  connected: boolean
  profile: string
  sessions: SessionSummary[]
  activeSessions: LiveSessionSummary[]
  projects: ProjectTree[]
  activeProjectId: string
  projectDetail: ProjectTree | null
  projectLoading: boolean
  selectedSessionId: string
  onNewSession: () => void
  onProject: (projectId: string) => Promise<void>
  onRefresh: () => Promise<void>
  onSession: (session: SessionSummary) => Promise<void>
  onActiveSession: (session: LiveSessionSummary) => Promise<void>
}

export function relativeSessionTime(
  value: number | undefined,
  now = Date.now(),
): string {
  if (!value) return ''
  const milliseconds = value > 10_000_000_000 ? value : value * 1000
  const elapsed = Math.max(0, now - milliseconds)
  if (elapsed < 15_000) return 'just now'
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)}s ago`
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d ago`
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(milliseconds))
}

function metadata(session: SessionSummary): string {
  return [
    session.git_branch,
    session.source,
    session.model,
    `${session.message_count} messages`,
    relativeSessionTime(session.last_active || session.started_at),
  ]
    .filter(Boolean)
    .join(' · ')
}

function liveStatusLabel(status: string): string {
  if (status === 'working') return 'Working'
  if (status === 'starting') return 'Starting'
  if (status === 'waiting') return 'Needs input'
  return 'Live and idle'
}

function LiveSessionRow({
  session,
  selected,
  onActiveSession,
}: {
  session: LiveSessionSummary
  selected: boolean
  onActiveSession: SessionsViewProps['onActiveSession']
}) {
  return (
    <button
      className={`session-row live-session-row status-${session.status} ${selected ? 'selected' : ''}`}
      onClick={() => void onActiveSession(session)}
      type="button"
    >
      <span className="session-live-indicator" aria-hidden="true" />
      <span className="session-copy">
        <strong>{session.title || 'Live conversation'}</strong>
        <small>{session.preview || liveStatusLabel(session.status)}</small>
        <span className="session-metadata">
          {[
            liveStatusLabel(session.status),
            session.model,
            `${session.message_count ?? 0} messages`,
            relativeSessionTime(session.last_active || session.started_at),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="session-live-action">Resume</span>
    </button>
  )
}

function SessionRow({
  selected,
  session,
  onSession,
}: {
  selected: boolean
  session: SessionSummary
  onSession: SessionsViewProps['onSession']
}) {
  return (
    <button
      className={`session-row ${selected ? 'selected' : ''}`}
      onClick={() => void onSession(session)}
    >
      <span className="session-icon">✦</span>
      <span className="session-copy">
        <strong>{session.title || 'Untitled session'}</strong>
        <small>{session.preview || metadata(session)}</small>
        <span className="session-metadata">{metadata(session)}</span>
      </span>
      <span className="session-chevron">›</span>
    </button>
  )
}

export function SessionsView({
  activeSessions,
  activeProjectId,
  connected,
  onNewSession,
  onActiveSession,
  onProject,
  onRefresh,
  onSession,
  profile,
  projectDetail,
  projectLoading,
  projects,
  selectedSessionId,
  sessions,
}: SessionsViewProps) {
  const [query, setQuery] = useState('')
  const [showCompacted, setShowCompacted] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  )
  const allRows = useMemo(
    () => projectSessionRows(projectDetail),
    [projectDetail],
  )
  const rows = useMemo(
    () =>
      showCompacted
        ? allRows
        : allRows.filter(row => !isCompactedSession(row.session)),
    [allRows, showCompacted],
  )
  const folderGroups = useMemo(
    () =>
      groupProjectRowsByFolder(
        rows.filter(row => sessionMatches(row.session, query, row)),
      ),
    [query, rows],
  )
  const recentSessions = useMemo(
    () =>
      sessions.filter(
        session =>
          (showCompacted || !isCompactedSession(session)) &&
          sessionMatches(session, query),
      ),
    [query, sessions, showCompacted],
  )
  const recentFolderGroups = useMemo(
    () => groupSessionsByFolder(recentSessions),
    [recentSessions],
  )
  const compactedCount =
    sessions.filter(isCompactedSession).length +
    allRows.filter(row => isCompactedSession(row.session)).length

  useEffect(() => {
    const selectedGroup = folderGroups.find(group =>
      group.rows.some(row => row.session.id === selectedSessionId),
    )
    if (!selectedGroup && !query) return
    setExpandedFolders(current => {
      const next = new Set(current)
      if (selectedGroup) {
        next.add(`${activeProjectId}:${selectedGroup.key}`)
      }
      if (query) {
        for (const group of folderGroups) {
          next.add(`${activeProjectId}:${group.key}`)
        }
      }
      return next
    })
  }, [activeProjectId, folderGroups, query, selectedSessionId])

  useEffect(() => {
    if (activeProjectId) return
    const selectedGroup = recentFolderGroups.find(group =>
      group.sessions.some(session => session.id === selectedSessionId),
    )
    if (!selectedGroup && !query) return
    setExpandedFolders(current => {
      const next = new Set(current)
      if (selectedGroup) next.add(`recent:${selectedGroup.key}`)
      if (query) {
        for (const group of recentFolderGroups) {
          next.add(`recent:${group.key}`)
        }
      }
      return next
    })
  }, [activeProjectId, query, recentFolderGroups, selectedSessionId])

  function toggleFolder(key: string) {
    setExpandedFolders(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{profile || 'default'} profile</p>
          <h1>Sessions</h1>
        </div>
        <button
          aria-label="Refresh sessions"
          className="icon-button"
          disabled={!connected}
          onClick={() => void onRefresh()}
        >
          ↻
        </button>
      </div>

      <div className="session-browser-controls">
        <button
          className="new-session-button"
          disabled={!connected}
          onClick={onNewSession}
        >
          <span>＋</span> New conversation
        </button>
        <label className="session-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Search title, cwd, branch, source, or model"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
      </div>

      {compactedCount > 0 && (
        <label className="session-compacted-toggle">
          <input
            checked={showCompacted}
            type="checkbox"
            onChange={event => setShowCompacted(event.target.checked)}
          />
          Show {compactedCount} compacted segment
          {compactedCount === 1 ? '' : 's'}
        </label>
      )}

      {activeSessions.length > 0 && (
        <section className="live-sessions-panel" aria-label="Sessions in progress">
          <div className="live-sessions-heading">
            <span>
              <strong>In progress</strong>
              <small>Attach without restarting the turn</small>
            </span>
            <span>{activeSessions.length}</span>
          </div>
          <div className="session-list">
            {activeSessions.map(session => (
              <LiveSessionRow
                key={session.id}
                onActiveSession={onActiveSession}
                selected={
                  session.id === selectedSessionId ||
                  Boolean(session.session_key && session.session_key === selectedSessionId)
                }
                session={session}
              />
            ))}
          </div>
        </section>
      )}

      <nav className="session-project-browser" aria-label="Session projects">
        <section className="session-project-branch">
          <button
            aria-expanded={!activeProjectId}
            className={`session-project-row ${!activeProjectId ? 'active' : ''}`}
            onClick={() => void onProject('')}
            type="button"
          >
            <span className="session-tree-chevron">›</span>
            <span className="session-project-icon">◷</span>
            <span className="session-project-copy">
              <strong>Recent</strong>
              <small>Latest sessions from this profile</small>
            </span>
            <span className="session-project-count">{sessions.length}</span>
          </button>
          {!activeProjectId && (
            <div className="session-branch-content">
              {!connected ? (
                <p className="empty-copy">Connect to load sessions.</p>
              ) : recentFolderGroups.length === 0 ? (
                <p className="empty-copy">
                  {query
                    ? 'No sessions match that search.'
                    : 'No sessions in this profile yet.'}
                </p>
              ) : (
                recentFolderGroups.map(group => {
                  const folderKey = `recent:${group.key}`
                  const folderOpen = expandedFolders.has(folderKey)
                  return (
                    <section className="cwd-session-group" key={group.key}>
                      <button
                        aria-expanded={folderOpen}
                        className="cwd-session-heading"
                        onClick={() => toggleFolder(folderKey)}
                        type="button"
                      >
                        <span className="session-tree-chevron">›</span>
                        <span className="session-folder-icon">⌑</span>
                        <span className="session-folder-copy">
                          <strong>{group.label}</strong>
                          {group.path && <small>{group.path}</small>}
                        </span>
                        <span className="session-project-count">
                          {group.sessions.length}
                        </span>
                      </button>
                      {folderOpen && (
                        <div className="session-list session-folder-sessions">
                          {group.sessions.map(session => (
                            <SessionRow
                              key={session.id}
                              selected={selectedSessionId === session.id}
                              session={session}
                              onSession={onSession}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )
                })
              )}
            </div>
          )}
        </section>

        {projects.map(project => {
          const projectOpen = activeProjectId === project.id
          return (
            <section className="session-project-branch" key={project.id}>
              <button
                aria-expanded={projectOpen}
                className={`session-project-row ${projectOpen ? 'active' : ''}`}
                onClick={() =>
                  void onProject(projectOpen ? '' : project.id)
                }
                type="button"
              >
                <span className="session-tree-chevron">›</span>
                <span className="session-project-icon">
                  {project.icon || '◇'}
                </span>
                <span className="session-project-copy">
                  <strong>{project.label}</strong>
                  <small>{project.path || 'Project sessions'}</small>
                </span>
                <span className="session-project-count">
                  {project.sessionCount}
                </span>
              </button>

              {projectOpen && (
                <div className="session-branch-content">
                  {projectLoading ? (
                    <p className="empty-copy">Loading project sessions…</p>
                  ) : folderGroups.length === 0 ? (
                    <p className="empty-copy">
                      {query
                        ? 'No project sessions match that search.'
                        : 'No sessions in this project.'}
                    </p>
                  ) : (
                    folderGroups.map(group => {
                      const folderKey = `${project.id}:${group.key}`
                      const folderOpen = expandedFolders.has(folderKey)
                      return (
                        <section
                          className="cwd-session-group"
                          key={group.key}
                        >
                          <button
                            aria-expanded={folderOpen}
                            className="cwd-session-heading"
                            onClick={() => toggleFolder(folderKey)}
                            type="button"
                          >
                            <span className="session-tree-chevron">›</span>
                            <span className="session-folder-icon">⌑</span>
                            <span className="session-folder-copy">
                              <strong>{group.label}</strong>
                              {group.path && <small>{group.path}</small>}
                            </span>
                            <span className="session-project-count">
                              {group.rows.length}
                            </span>
                          </button>
                          {folderOpen && (
                            <div className="session-list session-folder-sessions">
                              {group.rows.map(row => (
                                <SessionRow
                                  key={row.session.id}
                                  selected={
                                    selectedSessionId === row.session.id
                                  }
                                  session={row.session}
                                  onSession={onSession}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                      )
                    })
                  )}
                </div>
              )}
            </section>
          )
        })}
      </nav>
    </>
  )
}
