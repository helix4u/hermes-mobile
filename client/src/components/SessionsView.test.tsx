import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LiveSessionSummary, ProjectTree, SessionSummary } from '../protocol/types'
import {
  projectBrowserGroups,
  relativeSessionTime,
  selectedSessionEntryKey,
  sessionBrowserEntries,
  SessionRows,
  SessionsView,
} from './SessionsView'
import type { SessionEntry } from './SessionsView'

const session: SessionSummary = {
  id: 'stored-1',
  title: 'Mobile session browser',
  preview: 'Search every conversation',
  started_at: 1,
  last_active: 100,
  message_count: 4,
  source: 'mobile',
  cwd: 'F:\\work\\hermes-mobile',
  git_branch: 'main',
  model: 'test-model',
}

const live: LiveSessionSummary = {
  id: 'runtime-1',
  session_key: session.id,
  title: 'Still running',
  status: 'working',
  last_active: 200,
  message_count: 8,
}

const project: ProjectTree = {
  id: 'project-1',
  label: 'Hermes Mobile',
  path: 'F:\\work\\hermes-mobile',
  sessionCount: 1,
  repos: [{
    id: 'repo-1',
    label: 'hermes-mobile',
    path: 'F:\\work\\hermes-mobile',
    sessionCount: 1,
    groups: [{
      id: 'cwd-1',
      label: 'Worktree',
      path: 'F:\\work\\hermes-mobile',
      sessions: [session],
    }],
  }],
}

function renderSessions(overrides: Partial<ComponentProps<typeof SessionsView>> = {}) {
  return renderToStaticMarkup(
    <SessionsView
      activeSessions={[]}
      activeProjectId=""
      connected
      profile="default"
      projectDetail={null}
      projectLoading={false}
      projects={[project]}
      selectedSessionId=""
      sessions={[session]}
      onNewSession={vi.fn()}
      onActiveSession={vi.fn().mockResolvedValue(undefined)}
      onProject={vi.fn().mockResolvedValue(undefined)}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onSession={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  )
}

describe('SessionsView default presentation', () => {
  it('shows searchable flat rows immediately, with compact alternate views and sort controls', () => {
    const html = renderSessions()
    expect(html).toMatch(/aria-label="Refresh sessions"[\s\S]*?<svg/)
    expect(html).toContain('aria-label="Search sessions"')
    expect(html).toContain('aria-label="All sessions"')
    expect(html).toContain('Mobile session browser')
    expect(html).toContain('aria-label="Session views"')
    expect(html).toContain('Projects')
    expect(html).toContain('aria-label="Sort sessions"')
    expect(html).not.toContain('Latest sessions from this profile')
    expect(html).not.toContain('session-project-browser')
    expect(html).not.toContain('cwd-session-group')
  })

  it('starts flat even when a previously selected project is retained by the parent', () => {
    const html = renderSessions({ activeProjectId: project.id, projectDetail: project })
    expect(html).toContain('aria-label="All sessions"')
    expect(html).not.toContain('session-branch-content')
  })

  it('renders a linked runtime once, with activity and resume, instead of also showing its stored row', () => {
    const html = renderSessions({ activeSessions: [live], selectedSessionId: session.id })
    expect(html).toContain('Still running')
    expect(html).toContain('Working')
    expect(html).toContain('Resume')
    expect(html).toContain('status-working')
    expect(html).toContain('aria-current="true"')
    expect(html).not.toContain('Mobile session browser')
    expect(html).not.toContain('live-sessions-panel')
  })

  it('keeps cached rows searchable while disconnected and labels their freshness', () => {
    const html = renderSessions({ connected: false })
    expect(html).toContain('Mobile session browser')
    expect(html).toContain('(cached, disconnected)')
    expect(html).toContain('disabled=""')
    expect(renderSessions({ connected: false, sessions: [] })).toContain('Connect to load sessions.')
  })

  it('omits optional Projects when no project navigation is available', () => {
    expect(renderSessions({ projects: [] })).not.toContain('Projects')
  })

  it('uses human recency labels and accepts seconds or milliseconds', () => {
    const now = Date.UTC(2026, 7, 7, 12, 0, 0)
    expect(relativeSessionTime((now - 5_000) / 1_000, now)).toBe('just now')
    expect(relativeSessionTime((now - 12 * 60_000) / 1_000, now)).toBe('12m ago')
    expect(relativeSessionTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relativeSessionTime(undefined, now)).toBe('')
  })
})

describe('local session browser behavior', () => {
  it('searches live records and their linked stored metadata without changing resume ownership', () => {
    for (const query of ['still RUNNING', 'working', 'runtime-1', 'test-model', 'F:\\work', 'MAIN', 'mobile']) {
      const entries = sessionBrowserEntries([session], [live], { query })
      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({ kind: 'live', value: live, stored: session })
      expect(entries[0].value).toBe(live)
    }
    expect(sessionBrowserEntries([session], [live], { query: 'no match' })).toEqual([])
    expect(sessionBrowserEntries([session], [live], { query: '  ' })).toHaveLength(1)
  })

  it('searches an active runtime that has no stored history yet', () => {
    const active = { ...live, session_key: null, title: null, preview: 'Pending approval', status: 'waiting' }
    expect(sessionBrowserEntries([], [active], { query: 'approval' })[0].value).toBe(active)
    expect(sessionBrowserEntries([], [active], { query: 'needs input' })[0].value).toBe(active)
    expect(sessionBrowserEntries([], [active], { query: 'mobile' })).toEqual([])
  })

  it('does not present an unrecognized backend activity state as idle', () => {
    const active = { ...live, session_key: null, status: 'paused' }
    const html = renderSessions({ activeSessions: [active], sessions: [] })
    expect(html).toContain('paused')
    expect(html).not.toContain('Live and idle')
    expect(sessionBrowserEntries([], [active], { query: 'idle' })).toEqual([])
  })

  it('deduplicates within each authority, never across accidental runtime/stored ID collisions', () => {
    const unrelated = { ...live, id: session.id, session_key: null }
    const entries = sessionBrowserEntries([session, session], [unrelated, unrelated])
    expect(entries.map(entry => [entry.kind, entry.value.id])).toEqual([
      ['live', session.id], ['stored', session.id],
    ])
    expect(selectedSessionEntryKey(entries, session.id)).toBe(`stored:${session.id}`)
    expect(selectedSessionEntryKey(entries, session.id, unrelated.id)).toBe(`live:${unrelated.id}`)
  })

  it('keeps distinct runtimes sharing durable history and does not invent a selected owner', () => {
    const other = { ...live, id: 'runtime-2', title: 'Other runtime' }
    const entries = sessionBrowserEntries([session], [live, other])
    expect(entries).toHaveLength(2)
    expect(selectedSessionEntryKey(entries, session.id)).toBe('')
    expect(selectedSessionEntryKey(entries, session.id, other.id)).toBe('live:runtime-2')
    const filtered = sessionBrowserEntries([session], [live, other], { query: 'Other runtime' })
    const selectedKey = selectedSessionEntryKey(entries, session.id)
    expect(renderToStaticMarkup(<SessionRows entries={filtered} selectedKey={selectedKey}
      onSession={vi.fn()} onActiveSession={vi.fn()} onInspect={vi.fn()} />)).not.toContain('aria-current')
  })

  it('selects a unique linked runtime or a stored row, but explicit no-runtime overrides inference', () => {
    const entries = sessionBrowserEntries([session], [live])
    expect(selectedSessionEntryKey(entries, session.id)).toBe('live:runtime-1')
    expect(selectedSessionEntryKey(entries, session.id, '')).toBe('')
    expect(selectedSessionEntryKey(entries, '')).toBe('')
    expect(selectedSessionEntryKey(sessionBrowserEntries([session], []), session.id)).toBe('stored:stored-1')
  })

  it('sorts the whole flat list by recency or title without mutating backend arrays', () => {
    const alpha = { ...session, id: 'alpha', title: 'Alpha', last_active: 1_800_000_000 }
    const beta = { ...session, id: 'beta', title: 'Beta', last_active: 1_900_000_000_000 }
    const active = { ...live, title: 'Gamma', last_active: 1_850_000_000 }
    const stored = [alpha, beta, session]
    const activeSessions = [active]
    expect(sessionBrowserEntries(stored, activeSessions).map(entry => entry.value.id)).toEqual(['beta', 'runtime-1', 'alpha'])
    expect(sessionBrowserEntries(stored, activeSessions, { sort: 'title' }).map(entry => entry.value.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(stored).toEqual([alpha, beta, session])
    expect(activeSessions).toEqual([active])
  })

  it('uses start time when last activity is absent and stable identity for ties', () => {
    const entries = sessionBrowserEntries([
      { ...session, id: 'b', last_active: undefined, started_at: 300 },
      { ...session, id: 'a', last_active: undefined, started_at: 300 },
    ], [{ ...live, session_key: null, started_at: undefined, last_active: undefined }])
    expect(entries.map(entry => entry.value.id)).toEqual(['a', 'b', 'runtime-1'])
  })

  it('filters compacted stored segments, but keeps actual live runtimes accessible', () => {
    const compacted = { ...session, id: 'segment', compacted: true }
    expect(sessionBrowserEntries([compacted], [])).toEqual([])
    expect(sessionBrowserEntries([compacted], [], { showCompacted: true })[0].value).toBe(compacted)
    const active = { ...live, session_key: compacted.id }
    expect(sessionBrowserEntries([compacted], [active])[0].value).toBe(active)
    expect(sessionBrowserEntries([session], [live], { liveOnly: true })).toHaveLength(1)
    expect(sessionBrowserEntries([session], [], { liveOnly: true })).toEqual([])
  })

  it('transfers a completed runtime back to stored history while preserving the selected conversation', () => {
    const entries = sessionBrowserEntries([session], [])
    expect(selectedSessionEntryKey(entries, session.id)).toBe('stored:stored-1')
    expect(entries[0]).toEqual({ kind: 'stored', value: session })
  })
})

describe('project browser behavior', () => {
  it('keeps project/folder context search and only attaches runtimes explicitly belonging to that project', () => {
    const unrelated = { ...live, id: 'elsewhere', session_key: 'other-stored' }
    const options = { query: 'Worktree', sort: 'recent' as const, showCompacted: false }
    const groups = projectBrowserGroups(project, [live, unrelated], options)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Worktree')
    expect(groups[0].entries).toEqual([{ kind: 'live', value: live, stored: session }])
    expect(projectBrowserGroups(project, [live], { ...options, query: 'Hermes Mobile' })).toHaveLength(1)
    expect(projectBrowserGroups(project, [live], { ...options, query: 'absent' })).toEqual([])
    expect(projectBrowserGroups(null, [live], options)).toEqual([])
  })

  it('preserves stored project navigation when no runtime owns the row', () => {
    const groups = projectBrowserGroups(project, [], { query: '', sort: 'title', showCompacted: false })
    expect(groups[0].path).toBe('F:\\work\\hermes-mobile')
    expect(groups[0].entries).toEqual([{ kind: 'stored', value: session }])
  })

  it('does not duplicate runtime rows if the project payload repeats stored history in another folder', () => {
    const repeated = { ...project, repos: [{ ...project.repos[0], groups: [
      ...project.repos[0].groups,
      { ...project.repos[0].groups[0], id: 'other-folder', path: 'F:\\work\\other' },
    ] }] }
    const groups = projectBrowserGroups(repeated, [live], { query: '', sort: 'recent', showCompacted: false })
    expect(groups.flatMap(group => group.entries)).toHaveLength(1)
  })
})

describe('session row actions', () => {
  // Execute the production row components and their handlers, not source text
  // or mocked action dispatch. No DOM/test-renderer dependency is required.
  function rowButtons(entry: SessionEntry, selectedKey: string) {
    const onSession = vi.fn().mockResolvedValue(undefined)
    const onActiveSession = vi.fn().mockResolvedValue(undefined)
    const onInspect = vi.fn()
    const list = SessionRows({ entries: [entry], selectedKey, onSession, onActiveSession, onInspect })
    const row = list.props.children[0]
    const shell = row.type(row.props)
    const buttons = shell.props.children as ReactElement<{ onClick: () => void; 'aria-current'?: string }>[]
    return { buttons, onSession, onActiveSession, onInspect, key: row.key }
  }

  it('resumes and inspects the exact runtime record without calling durable resume', () => {
    const entry: SessionEntry = { kind: 'live', value: live, stored: session }
    const { buttons, onSession, onActiveSession, onInspect, key } = rowButtons(entry, 'live:runtime-1')
    expect(key).toBe('live:runtime-1')
    expect(buttons[0].props['aria-current']).toBe('true')
    buttons[0].props.onClick()
    expect(onActiveSession).toHaveBeenCalledExactlyOnceWith(live)
    expect(onSession).not.toHaveBeenCalled()
    buttons[1].props.onClick()
    expect(onInspect).toHaveBeenCalledExactlyOnceWith(entry)
    expect(onActiveSession).toHaveBeenCalledTimes(1)
  })

  it('opens and inspects stored history without calling runtime activation', () => {
    const entry: SessionEntry = { kind: 'stored', value: session }
    const { buttons, onSession, onActiveSession, onInspect, key } = rowButtons(entry, 'stored:stored-1')
    expect(key).toBe('stored:stored-1')
    expect(buttons[0].props['aria-current']).toBe('true')
    buttons[0].props.onClick()
    expect(onSession).toHaveBeenCalledExactlyOnceWith(session)
    expect(onActiveSession).not.toHaveBeenCalled()
    buttons[1].props.onClick()
    expect(onInspect).toHaveBeenCalledExactlyOnceWith(entry)
    expect(onSession).toHaveBeenCalledTimes(1)
  })
})
