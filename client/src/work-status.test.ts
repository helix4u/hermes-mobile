import { describe, expect, it, vi } from 'vitest'

import {
  emptyWorkStatus,
  reconcileDelegationStatus,
  reduceWorkStatusEvent,
  restoreWorkStatusSnapshot,
} from './work-status'

describe('mobile work status', () => {
  it('applies authoritative todo snapshots and rejects older revisions', () => {
    const first = reduceWorkStatusEvent(emptyWorkStatus(), {
      type: 'todo.updated',
      payload: {
        revision: 4,
        todos: [
          { content: 'Trace the event path', id: 'trace', status: 'in_progress' },
          { content: 'Render the state', id: 'render', status: 'pending' },
        ],
      },
    })
    const stale = reduceWorkStatusEvent(first, {
      type: 'todo.updated',
      payload: {
        revision: 3,
        todos: [{ content: 'Old state', id: 'old', status: 'completed' }],
      },
    })

    expect(first.todos).toHaveLength(2)
    expect(stale).toBe(first)
  })

  it('merges partial todo starts and lets the completed snapshot replace them', () => {
    const initial = reduceWorkStatusEvent(emptyWorkStatus(), {
      type: 'tool.complete',
      payload: {
        name: 'todo',
        result: JSON.stringify({
          revision: 1,
          todos: [
            { content: 'One', id: 'one', status: 'in_progress' },
            { content: 'Two', id: 'two', status: 'pending' },
          ],
        }),
      },
    })
    const merged = reduceWorkStatusEvent(initial, {
      type: 'tool.start',
      payload: {
        args: { merge: true, todos: [{ id: 'one', status: 'completed' }] },
        name: 'todo',
      },
    })
    const complete = reduceWorkStatusEvent(merged, {
      type: 'todo.updated',
      payload: {
        revision: 2,
        todos: [
          { content: 'One', id: 'one', status: 'completed' },
          { content: 'Two', id: 'two', status: 'in_progress' },
        ],
      },
    })

    expect(merged.todos.map((item) => item.status)).toEqual(['completed', 'pending'])
    expect(complete.todos.map((item) => item.status)).toEqual(['completed', 'in_progress'])
  })

  it('renders native subagent progress and replaces delegate tool fallbacks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
    const fallback = reduceWorkStatusEvent(emptyWorkStatus(), {
      type: 'tool.start',
      payload: {
        args: { tasks: [{ goal: 'Inspect logs' }, { goal: 'Check state' }] },
        name: 'delegate_task',
        tool_id: 'delegate-1',
      },
    })
    const native = reduceWorkStatusEvent(fallback, {
      type: 'subagent.tool',
      payload: {
        goal: 'Inspect logs',
        status: 'running',
        subagent_id: 'child-1',
        task_count: 2,
        task_index: 0,
        tool_name: 'terminal',
      },
    })
    const finished = reduceWorkStatusEvent(native, {
      type: 'subagent.complete',
      payload: {
        goal: 'Inspect logs',
        status: 'completed',
        subagent_id: 'child-1',
        summary: 'No fatal errors',
      },
    })

    expect(fallback.subagents).toHaveLength(2)
    expect(native.subagents).toHaveLength(1)
    expect(native.subagents[0]).toMatchObject({ id: 'child-1', currentTool: 'terminal' })
    expect(finished.subagents[0]).toMatchObject({
      id: 'child-1',
      status: 'completed',
      summary: 'No fatal errors',
    })
    expect(finished.subagents[0].currentTool).toBeUndefined()
    vi.useRealTimers()
  })

  it('restores todos only when the backend proves the turn is running', () => {
    const snapshot = {
      revision: 8,
      todos: [{ content: 'Keep working', id: 'work', status: 'in_progress' }],
    }

    expect(restoreWorkStatusSnapshot(emptyWorkStatus(), snapshot, true).todos).toHaveLength(1)
    expect(restoreWorkStatusSnapshot(emptyWorkStatus(), snapshot, false).todos).toEqual([])
  })

  it('reconciles a missed subagent completion without borrowing another session', () => {
    const running = reduceWorkStatusEvent(emptyWorkStatus(), {
      type: 'subagent.start',
      payload: { goal: 'Check it', status: 'running', subagent_id: 'child-1' },
    })
    const reconciled = reconcileDelegationStatus(running, { active: [] })

    expect(reconciled.subagents[0].status).toBe('interrupted')

    const lateCompletion = reduceWorkStatusEvent(reconciled, {
      type: 'subagent.complete',
      payload: {
        goal: 'Check it',
        status: 'completed',
        subagent_id: 'child-1',
        summary: 'Finished after reconciliation',
      },
    })
    expect(lateCompletion.subagents[0]).toMatchObject({
      status: 'completed',
      summary: 'Finished after reconciliation',
    })
  })

  it('drops every todo when a turn ends', () => {
    const unfinished = reduceWorkStatusEvent(emptyWorkStatus(), {
      type: 'todo.updated',
      payload: {
        revision: 1,
        todos: [{ content: 'Still going', id: 'a', status: 'in_progress' }],
      },
    })
    const completed = reduceWorkStatusEvent(emptyWorkStatus(), {
      type: 'todo.updated',
      payload: {
        revision: 1,
        todos: [{ content: 'Done', id: 'a', status: 'completed' }],
      },
    })

    expect(reduceWorkStatusEvent(unfinished, { type: 'message.complete', payload: {} }).todos).toEqual([])
    expect(reduceWorkStatusEvent(completed, { type: 'message.complete', payload: {} }).todos).toEqual([])
  })

  it('does not restore a completed-only checklist as live work', () => {
    const snapshot = {
      revision: 9,
      todos: [{ content: 'Old completed task', id: 'old', status: 'completed' }],
    }

    expect(restoreWorkStatusSnapshot(emptyWorkStatus(), snapshot, true).todos).toEqual([])
  })
})
