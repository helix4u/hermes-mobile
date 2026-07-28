import { describe, expect, it } from 'vitest'
import {
  groupProjectRowsByFolder,
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
})
