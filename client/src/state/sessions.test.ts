import { describe, expect, it } from 'vitest'
import {
  groupProjectRowsByFolder,
  groupSessionsByFolder,
  isCompactedSession,
  projectSessionRows,
  sessionMatches,
} from './sessions'

const project = {
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
          id: 'lane-1',
          label: 'feature/mobile',
          path: 'F:\\work\\hermes-mobile\\.worktrees\\mobile',
          sessions: [
            {
              id: 'session-1',
              title: 'Fix mobile tools',
              preview: 'Render tool output',
              started_at: 1,
              message_count: 3,
              source: 'desktop',
              cwd: 'F:\\work\\hermes-mobile\\.worktrees\\mobile',
              git_branch: 'feature/mobile',
            },
          ],
        },
      ],
    },
  ],
}

describe('project session projection', () => {
  it('flattens authoritative project lanes and groups them by cwd', () => {
    const rows = projectSessionRows(project)
    const groups = groupProjectRowsByFolder(rows)

    expect(rows[0]).toMatchObject({
      projectLabel: 'Hermes Mobile',
      groupLabel: 'feature/mobile',
    })
    expect(groups[0].path).toBe(
      'F:\\work\\hermes-mobile\\.worktrees\\mobile',
    )
    expect(groups[0].rows[0].session.id).toBe('session-1')
  })

  it('searches cwd, branch, source, and project context', () => {
    const row = projectSessionRows(project)[0]
    expect(sessionMatches(row.session, 'feature/mobile', row)).toBe(true)
    expect(sessionMatches(row.session, 'desktop', row)).toBe(true)
    expect(sessionMatches(row.session, 'unrelated', row)).toBe(false)
  })

  it('groups recent sessions by cwd before rendering their rows', () => {
    const sessions = [
      project.repos[0].groups[0].sessions[0],
      {
        ...project.repos[0].groups[0].sessions[0],
        id: 'session-2',
        title: 'Another mobile turn',
      },
      {
        ...project.repos[0].groups[0].sessions[0],
        id: 'session-3',
        cwd: '',
        source: 'cloud',
      },
    ]

    const groups = groupSessionsByFolder(sessions)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      label: 'mobile',
      path: 'F:\\work\\hermes-mobile\\.worktrees\\mobile',
    })
    expect(groups[0].sessions).toHaveLength(2)
    expect(groups[1]).toMatchObject({
      key: 'source:cloud',
      label: 'cloud',
    })
  })

  it('only classifies sessions as compacted from explicit host metadata', () => {
    const session = project.repos[0].groups[0].sessions[0]
    expect(isCompactedSession(session)).toBe(false)
    expect(
      isCompactedSession({ ...session, end_reason: 'compressed' }),
    ).toBe(true)
    expect(isCompactedSession({ ...session, compacted: true })).toBe(true)
    expect(
      isCompactedSession({
        ...session,
        parent_session_id: 'parent',
        end_reason: 'branched',
      }),
    ).toBe(false)
  })
})
