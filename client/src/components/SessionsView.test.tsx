import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LiveSessionSummary, ProjectTree, SessionSummary } from '../protocol/types'
import { relativeSessionTime, SessionsView } from './SessionsView'

const session: SessionSummary = {
  id: 'session-1',
  title: 'Mobile session browser',
  preview: 'Replace the horizontal project strip',
  started_at: 1,
  message_count: 4,
  source: 'mobile',
  cwd: 'F:\\work\\hermes-mobile',
  git_branch: 'main',
}

const project: ProjectTree = {
  id: 'project-1',
  label: 'Hermes Mobile',
  path: 'F:\\work\\hermes-mobile',
  sessionCount: 1,
  repos: [
    {
      id: 'repo-1',
      label: 'hermes-mobile',
      path: 'F:\\work\\hermes-mobile',
      sessionCount: 1,
      groups: [
        {
          id: 'cwd-1',
          label: 'Worktree',
          path: 'F:\\work\\hermes-mobile',
          sessions: [session],
        },
      ],
    },
  ],
}

function renderSessions(activeProjectId = '', activeSessions: LiveSessionSummary[] = []) {
  return renderToStaticMarkup(
    <SessionsView
      activeSessions={activeSessions}
      activeProjectId={activeProjectId}
      connected
      profile="default"
      projectDetail={activeProjectId ? project : null}
      projectLoading={false}
      projects={[project]}
      selectedSessionId=""
      sessions={[session]}
      onNewSession={vi.fn()}
      onActiveSession={vi.fn().mockResolvedValue(undefined)}
      onProject={vi.fn().mockResolvedValue(undefined)}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onSession={vi.fn().mockResolvedValue(undefined)}
    />,
  )
}

describe('SessionsView', () => {
  it('renders projects as a vertical expandable browser', () => {
    const html = renderSessions()

    expect(html).toContain('session-project-browser')
    expect(html).toContain('aria-label="Session projects"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Latest sessions from this profile')
    expect(html).not.toContain('project-tabs')
  })

  it('renders lazy project folders as nested expandable rows', () => {
    const html = renderSessions('project-1')

    expect(html).toContain('Hermes Mobile')
    expect(html).toContain('session-folder-icon')
    expect(html).toContain('Worktree')
    expect(html).toContain('F:\\work\\hermes-mobile')
    expect(html).toContain('aria-expanded="false"')
  })

  it('renders in-progress sessions with activity state and a resume action', () => {
    const html = renderSessions('', [
      {
        id: 'runtime-1',
        session_key: 'session-1',
        title: 'Still running',
        status: 'working',
        last_active: Date.now() / 1_000,
        message_count: 8,
      },
    ])
    expect(html).toContain('In progress')
    expect(html).toContain('Working')
    expect(html).toContain('Resume')
    expect(html).toContain('status-working')
  })

  it('uses human recency labels before falling back to a calendar date', () => {
    const now = Date.UTC(2026, 7, 7, 12, 0, 0)
    expect(relativeSessionTime((now - 5_000) / 1_000, now)).toBe('just now')
    expect(relativeSessionTime((now - 12 * 60_000) / 1_000, now)).toBe('12m ago')
    expect(relativeSessionTime((now - 3 * 3_600_000) / 1_000, now)).toBe('3h ago')
  })
})
