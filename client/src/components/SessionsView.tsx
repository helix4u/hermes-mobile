import { useEffect, useMemo, useState } from 'react'
import { writeClipboardText } from '../clipboard'
import type {
  LiveSessionSummary,
  ProjectTree,
  SessionSummary,
} from '../protocol/types'
import {
  groupProjectRowsByFolder,
  isCompactedSession,
  projectSessionRows,
  sessionMatches,
} from '../state/sessions'
import type { ProjectSessionRow } from '../state/sessions'
import { RefreshIcon } from './UiIcons'
import './SessionsView.css'

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
  selectedRuntimeSessionId?: string
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
  if (status === 'idle') return 'Live and idle'
  return status || 'Live'
}

export type SessionEntry =
  | { kind: 'live'; value: LiveSessionSummary; stored?: SessionSummary }
  | { kind: 'stored'; value: SessionSummary }

type SessionSort = 'recent' | 'title'

function entryKey(entry: SessionEntry): string {
  return `${entry.kind}:${entry.value.id}`
}

function sessionTimestamp(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 0
  return value > 10_000_000_000 ? value : value * 1000
}

// Runtime IDs and durable IDs are separate namespaces. Only session_key
// establishes ownership, never an accidental equality between the two IDs.
export function sessionBrowserEntries(
  sessions: SessionSummary[],
  activeSessions: LiveSessionSummary[],
  {
    query = '',
    sort = 'recent',
    showCompacted = false,
    liveOnly = false,
    contexts = new Map<string, ProjectSessionRow>(),
  }: {
    query?: string
    sort?: SessionSort
    showCompacted?: boolean
    liveOnly?: boolean
    contexts?: Map<string, ProjectSessionRow>
  } = {},
): SessionEntry[] {
  const storedById = new Map(sessions.map(session => [session.id, session]))
  const liveById = new Map(activeSessions.map(session => [session.id, session]))
  const ownedIds = new Set(
    [...liveById.values()].map(session => session.session_key).filter(Boolean),
  )
  const entries: SessionEntry[] = [...liveById.values()].map(value => ({
    kind: 'live',
    value,
    stored: value.session_key ? storedById.get(value.session_key) : undefined,
  }))
  if (!liveOnly) {
    for (const value of storedById.values()) {
      if (!ownedIds.has(value.id) && (showCompacted || !isCompactedSession(value))) {
        entries.push({ kind: 'stored', value })
      }
    }
  }
  const needle = query.trim().toLowerCase()
  return entries.filter(entry => {
    const stored = entry.kind === 'stored' ? entry.value : entry.stored
    if (!needle || (stored && sessionMatches(stored, needle, contexts.get(stored.id)))) {
      return true
    }
    if (entry.kind === 'stored') return false
    return [
      entry.value.id,
      entry.value.session_key,
      entry.value.title,
      entry.value.preview,
      entry.value.model,
      entry.value.status,
      liveStatusLabel(entry.value.status),
    ].some(value => String(value ?? '').toLowerCase().includes(needle))
  }).sort((left, right) => {
    if (sort === 'title') {
      const title = (left.value.title || (left.kind === 'live' ? 'Live conversation' : 'Untitled session'))
        .localeCompare(right.value.title || (right.kind === 'live' ? 'Live conversation' : 'Untitled session'))
      if (title) return title
    }
    const recency = sessionTimestamp(right.value.last_active || right.value.started_at)
      - sessionTimestamp(left.value.last_active || left.value.started_at)
    return recency || entryKey(left).localeCompare(entryKey(right))
  })
}

export function projectBrowserGroups(
  project: ProjectTree | null,
  activeSessions: LiveSessionSummary[],
  options: { query: string; sort: SessionSort; showCompacted: boolean },
) {
  const rows = [...new Map(projectSessionRows(project).map(row => [row.session.id, row])).values()]
  return groupProjectRowsByFolder(rows).map(group => {
    const ids = new Set(group.rows.map(row => row.session.id))
    return {
      ...group,
      entries: sessionBrowserEntries(
        group.rows.map(row => row.session),
        activeSessions.filter(session => session.session_key && ids.has(session.session_key)),
        { ...options, contexts: new Map(group.rows.map(row => [row.session.id, row])) },
      ),
    }
  }).filter(group => group.entries.length > 0)
}

export function selectedSessionEntryKey(
  entries: SessionEntry[],
  storedId: string,
  runtimeId?: string,
): string {
  if (runtimeId) return `live:${runtimeId}`
  if (!storedId) return ''
  const owners = entries.filter(entry =>
    entry.kind === 'live' && entry.value.session_key === storedId,
  )
  // Without an explicit runtime selection, multiple owners are ambiguous.
  // Do not highlight several rows or let filtering invent a unique owner.
  if (owners.length) return runtimeId === undefined && owners.length === 1 ? entryKey(owners[0]) : ''
  return `stored:${storedId}`
}

function LiveSessionRow({
  session,
  selected,
  onActiveSession,
  onInspect,
}: {
  session: LiveSessionSummary
  selected: boolean
  onActiveSession: SessionsViewProps['onActiveSession']
  onInspect: (session: LiveSessionSummary) => void
}) {
  return (
    <div className="session-row-shell">
      <button
        aria-current={selected ? 'true' : undefined}
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
      <button
        aria-label={`Preview ${session.title || 'live conversation'} data`}
        className="session-inspect-button"
        onClick={() => onInspect(session)}
        type="button"
      >
        i
      </button>
    </div>
  )
}

function SessionRow({
  selected,
  session,
  onSession,
  onInspect,
}: {
  selected: boolean
  session: SessionSummary
  onSession: SessionsViewProps['onSession']
  onInspect: (session: SessionSummary) => void
}) {
  return (
    <div className="session-row-shell">
      <button
        aria-current={selected ? 'true' : undefined}
        className={`session-row ${selected ? 'selected' : ''}`}
        onClick={() => void onSession(session)}
        type="button"
      >
        <span className="session-icon">✦</span>
        <span className="session-copy">
          <strong>{session.title || 'Untitled session'}</strong>
          <small>{session.preview || metadata(session)}</small>
          <span className="session-metadata">{metadata(session)}</span>
        </span>
        <span className="session-chevron">›</span>
      </button>
      <button
        aria-label={`Preview ${session.title || 'untitled session'} data`}
        className="session-inspect-button"
        onClick={() => onInspect(session)}
        type="button"
      >
        i
      </button>
    </div>
  )
}

export function SessionRows({
  entries,
  selectedKey,
  onActiveSession,
  onSession,
  onInspect,
}: {
  entries: SessionEntry[]
  selectedKey: string
  onActiveSession: SessionsViewProps['onActiveSession']
  onSession: SessionsViewProps['onSession']
  onInspect: (entry: SessionEntry) => void
}) {
  return (
    <div className="session-list">
      {entries.map(entry => entry.kind === 'live' ? (
        <LiveSessionRow
          key={entryKey(entry)}
          session={entry.value}
          selected={selectedKey === entryKey(entry)}
          onActiveSession={onActiveSession}
          onInspect={() => onInspect(entry)}
        />
      ) : (
        <SessionRow
          key={entryKey(entry)}
          session={entry.value}
          selected={selectedKey === entryKey(entry)}
          onSession={onSession}
          onInspect={() => onInspect(entry)}
        />
      ))}
    </div>
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
  selectedRuntimeSessionId,
  selectedSessionId,
  sessions,
}: SessionsViewProps) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'all' | 'live' | 'projects'>('all')
  const [sort, setSort] = useState<SessionSort>('recent')
  const [showCompacted, setShowCompacted] = useState(false)
  const [inspected, setInspected] = useState<SessionEntry | null>(null)
  const [copyState, setCopyState] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  )
  const allRows = useMemo(
    () => projectSessionRows(projectDetail?.id === activeProjectId ? projectDetail : null),
    [activeProjectId, projectDetail],
  )
  const allEntries = useMemo(
    () => sessionBrowserEntries(sessions, activeSessions, { showCompacted }),
    [sessions, activeSessions, showCompacted],
  )
  const visibleEntries = useMemo(
    () => sessionBrowserEntries(sessions, activeSessions, {
      query, sort, showCompacted, liveOnly: view === 'live',
    }),
    [sessions, activeSessions, query, sort, showCompacted, view],
  )
  const projectGroups = useMemo(() => projectBrowserGroups(
    projectDetail?.id === activeProjectId ? projectDetail : null,
    activeSessions, { query, sort, showCompacted },
  ), [activeProjectId, projectDetail, activeSessions, query, sort, showCompacted])
  const selectionEntries = useMemo(() => sessionBrowserEntries(
    [...sessions, ...allRows.map(row => row.session)], activeSessions, { showCompacted: true },
  ), [sessions, allRows, activeSessions])
  const selectedKey = selectedSessionEntryKey(selectionEntries, selectedSessionId, selectedRuntimeSessionId)
  const compactedCount = new Set(
    (view === 'projects' ? allRows.map(row => row.session) : sessions)
      .filter(isCompactedSession).map(session => session.id),
  ).size

  useEffect(() => {
    const selectedGroup = projectGroups.find(group =>
      group.entries.some(entry => entryKey(entry) === selectedKey),
    )
    if (!selectedGroup && !query.trim()) return
    setExpandedFolders(current => {
      const next = new Set(current)
      if (selectedGroup) {
        next.add(`${activeProjectId}:${selectedGroup.key}`)
      }
      if (query.trim()) {
        for (const group of projectGroups) {
          next.add(`${activeProjectId}:${group.key}`)
        }
      }
      return next
    })
  }, [activeProjectId, projectGroups, query, selectedKey])

  function toggleFolder(key: string) {
    setExpandedFolders(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function inspect(entry: SessionEntry) {
    setCopyState('')
    setInspected(entry)
  }

  return (
    <div className="session-browser">
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
          <RefreshIcon />
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
            aria-label="Search sessions"
            type="search"
            placeholder="Search title, cwd, branch, source, or model"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="session-view-toolbar">
        <nav className="session-view-switch" aria-label="Session views">
          <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
            All <span>{allEntries.length}</span>
          </button>
          <button type="button" aria-pressed={view === 'live'} onClick={() => setView('live')}>
            Live <span>{allEntries.filter(entry => entry.kind === 'live').length}</span>
          </button>
          {(projects.length > 0 || activeProjectId) && (
            <button type="button" aria-pressed={view === 'projects'} onClick={() => setView('projects')}>
              Projects
            </button>
          )}
        </nav>
        <div className="session-sort-switch" role="group" aria-label="Sort sessions">
          <button type="button" aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>Recent</button>
          <button type="button" aria-pressed={sort === 'title'} onClick={() => setSort('title')}>Title</button>
        </div>
      </div>

      {compactedCount > 0 && view !== 'live' && (
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

      {view !== 'projects' && (
        <section className="session-flat-results" aria-label={view === 'live' ? 'Live sessions' : 'All sessions'}>
          <p className="session-result-summary" role="status">
            {visibleEntries.length} {visibleEntries.length === 1 ? 'session' : 'sessions'}
            {query.trim() ? ' matching search' : ''}
            {!connected && visibleEntries.length > 0 ? ' (cached, disconnected)' : ''}
          </p>
          {visibleEntries.length > 0 ? (
            <SessionRows entries={visibleEntries} selectedKey={selectedKey}
              onActiveSession={onActiveSession} onSession={onSession} onInspect={inspect} />
          ) : (
            <p className="empty-copy">
              {query.trim() ? 'No sessions match that search.' : !connected
                ? 'Connect to load sessions.' : view === 'live'
                  ? 'No live sessions in this profile.' : 'No sessions in this profile yet.'}
            </p>
          )}
        </section>
      )}

      {view === 'projects' && (
        <nav className="session-project-browser" aria-label="Session projects">
        {projects.length === 0 && <p className="empty-copy">No projects in this profile.</p>}
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
                  ) : projectDetail?.id !== project.id ? (
                    <p className="empty-copy">Project sessions are not loaded. Refresh to try again.</p>
                  ) : projectGroups.length === 0 ? (
                    <p className="empty-copy">
                      {query.trim()
                        ? 'No project sessions match that search.'
                        : 'No sessions in this project.'}
                    </p>
                  ) : (
                    projectGroups.map(group => {
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
                              {group.entries.length}
                            </span>
                          </button>
                          {folderOpen && (
                            <div className="session-folder-sessions">
                              <SessionRows entries={group.entries} selectedKey={selectedKey}
                                onActiveSession={onActiveSession} onSession={onSession} onInspect={inspect} />
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
      )}
      {inspected && (
        <div className="session-inspector-backdrop" role="presentation">
          <section
            aria-label="Session data preview"
            aria-modal="true"
            className="session-inspector"
            role="dialog"
          >
            <header>
              <div>
                <small>{inspected.kind === 'live' ? 'Live gateway record' : 'Stored session summary'}</small>
                <strong>{inspected.value.title || 'Untitled session'}</strong>
              </div>
              <button onClick={() => setInspected(null)} type="button">Close</button>
            </header>
            <p>
              This is the exact bounded record currently shown by the selector. It is not a full transcript.
            </p>
            <pre>{JSON.stringify(inspected.value, null, 2)}</pre>
            <footer>
              <button
                onClick={async () => {
                  try {
                    await writeClipboardText(JSON.stringify(inspected.value, null, 2))
                    setCopyState('Copied')
                  } catch (error) {
                    setCopyState(error instanceof Error ? error.message : String(error))
                  }
                }}
                type="button"
              >
                Copy JSON
              </button>
              <button
                onClick={() => {
                  if (inspected.kind === 'live') void onActiveSession(inspected.value)
                  else void onSession(inspected.value)
                  setInspected(null)
                }}
                type="button"
              >
                Open session
              </button>
              {copyState && <span role="status">{copyState}</span>}
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
