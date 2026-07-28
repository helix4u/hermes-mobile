import { useMemo, useState } from 'react'
import type {
  ProjectTree,
  SessionSummary,
} from '../protocol/types'
import {
  groupProjectRowsByFolder,
  projectSessionRows,
  sessionMatches,
} from '../state/sessions'

interface SessionsViewProps {
  connected: boolean
  profile: string
  sessions: SessionSummary[]
  projects: ProjectTree[]
  activeProjectId: string
  projectDetail: ProjectTree | null
  projectLoading: boolean
  selectedSessionId: string
  onNewSession: () => void
  onProject: (projectId: string) => Promise<void>
  onRefresh: () => Promise<void>
  onSession: (session: SessionSummary) => Promise<void>
}

function timeLabel(value: number | undefined): string {
  if (!value) return ''
  const milliseconds = value > 10_000_000_000 ? value : value * 1000
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
    timeLabel(session.last_active || session.started_at),
  ]
    .filter(Boolean)
    .join(' · ')
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
  activeProjectId,
  connected,
  onNewSession,
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
  const rows = useMemo(() => projectSessionRows(projectDetail), [projectDetail])
  const folderGroups = useMemo(
    () =>
      groupProjectRowsByFolder(
        rows.filter(row => sessionMatches(row.session, query, row)),
      ),
    [query, rows],
  )
  const recentSessions = useMemo(
    () => sessions.filter(session => sessionMatches(session, query)),
    [query, sessions],
  )

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

      {projects.length > 0 && (
        <nav className="project-tabs" aria-label="Session projects">
          <button
            className={!activeProjectId ? 'active' : ''}
            onClick={() => void onProject('')}
          >
            Recent
            <small>{sessions.length}</small>
          </button>
          {projects.map(project => (
            <button
              className={activeProjectId === project.id ? 'active' : ''}
              key={project.id}
              onClick={() => void onProject(project.id)}
            >
              {project.icon || '◇'} {project.label}
              <small>{project.sessionCount}</small>
            </button>
          ))}
        </nav>
      )}

      <div className="session-list">
        {!connected ? (
          <p className="empty-copy">Connect to load sessions.</p>
        ) : activeProjectId ? (
          projectLoading ? (
            <p className="empty-copy">Loading project sessions…</p>
          ) : folderGroups.length === 0 ? (
            <p className="empty-copy">
              {query ? 'No project sessions match that search.' : 'No sessions in this project.'}
            </p>
          ) : (
            folderGroups.map(group => (
              <section className="cwd-session-group" key={group.key}>
                <div className="cwd-session-heading">
                  <strong>{group.label}</strong>
                  {group.path && <small>{group.path}</small>}
                </div>
                {group.rows.map(row => (
                  <SessionRow
                    key={row.session.id}
                    selected={selectedSessionId === row.session.id}
                    session={row.session}
                    onSession={onSession}
                  />
                ))}
              </section>
            ))
          )
        ) : recentSessions.length === 0 ? (
          <p className="empty-copy">
            {query ? 'No sessions match that search.' : 'No sessions in this profile yet.'}
          </p>
        ) : (
          recentSessions.map(session => (
            <SessionRow
              key={session.id}
              selected={selectedSessionId === session.id}
              session={session}
              onSession={onSession}
            />
          ))
        )}
      </div>
    </>
  )
}
