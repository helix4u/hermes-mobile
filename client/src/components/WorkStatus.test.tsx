import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WorkStatus } from './WorkStatus'

describe('WorkStatus', () => {
  it('renders compact task progress and delegated worker liveness', () => {
    const html = renderToStaticMarkup(
      <WorkStatus
        status={{
          todoRevision: 2,
          todos: [
            { content: 'Inspect the gateway', id: 'one', status: 'completed' },
            { content: 'Verify the phone', id: 'two', status: 'in_progress' },
          ],
          subagents: [
            {
              currentTool: 'terminal',
              goal: 'Inspect reconnect logs',
              id: 'child-1',
              status: 'running',
              taskCount: 1,
              taskIndex: 0,
              updatedAt: 1,
            },
          ],
        }}
      />,
    )

    expect(html).toContain('Tasks 1/2')
    expect(html).toContain('1 agent active')
    expect(html).toContain('Inspect reconnect logs')
    expect(html).toContain('running · terminal')
    expect(html).toContain('Verify the phone')
  })

  it('renders nothing without authoritative work state', () => {
    expect(
      renderToStaticMarkup(
        <WorkStatus status={{ subagents: [], todoRevision: null, todos: [] }} />,
      ),
    ).toBe('')
  })

  it('does not cover chat with completed historical work', () => {
    expect(
      renderToStaticMarkup(
        <WorkStatus
          status={{
            subagents: [],
            todoRevision: 9,
            todos: [
              {
                content: 'Old completed task',
                id: 'old',
                status: 'completed',
              },
            ],
          }}
        />,
      ),
    ).toBe('')
  })
})
