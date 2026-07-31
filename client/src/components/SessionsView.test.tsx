import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectTree, SessionSummary } from '../protocol/types'
import { SessionsView } from './SessionsView'

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

function renderSessions(activeProjectId = '') {
  return renderToStaticMarkup(
    <SessionsView
      activeProjectId={activeProjectId}
      connected
      profile="default"
      projectDetail={activeProjectId ? project : null}
      projectLoading={false}
      projects={[project]}
      selectedSessionId=""
      sessions={[session]}
      onNewSession={vi.fn()}
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
})
