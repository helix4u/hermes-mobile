import { useState } from 'react'

import type { MobileWorkStatus, TodoStatus } from '../work-status'

interface WorkStatusProps {
  status: MobileWorkStatus
}

const TODO_GLYPH: Record<TodoStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '✓',
  cancelled: '×',
}

const activeSubagent = (status: string) =>
  status === 'queued' || status === 'running'

export function WorkStatus({ status }: WorkStatusProps) {
  const [open, setOpen] = useState(true)
  const hasActiveTodo = status.todos.some(
    (item) => item.status === 'pending' || item.status === 'in_progress',
  )
  const hasActiveSubagent = status.subagents.some((item) =>
    activeSubagent(item.status),
  )
  if (!hasActiveTodo && !hasActiveSubagent) return null

  const countedTodos = status.todos.filter((item) => item.status !== 'cancelled')
  const completedTodos = countedTodos.filter(
    (item) => item.status === 'completed',
  ).length
  const runningSubagents = status.subagents.filter((item) =>
    activeSubagent(item.status),
  ).length
  const failedSubagents = status.subagents.filter(
    (item) => item.status === 'failed',
  ).length
  const summary = [
    countedTodos.length ? `Tasks ${completedTodos}/${countedTodos.length}` : '',
    status.subagents.length
      ? runningSubagents
        ? `${runningSubagents}${runningSubagents < status.subagents.length ? `/${status.subagents.length}` : ''} agent${status.subagents.length === 1 ? '' : 's'} active`
        : `${status.subagents.length} agent${status.subagents.length === 1 ? '' : 's'} finished`
      : '',
    failedSubagents ? `${failedSubagents} need attention` : '',
  ].filter(Boolean).join(' · ')

  return (
    <details
      className="work-status"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="work-status-title">
          <span aria-hidden="true" className={runningSubagents ? 'work-pulse' : 'work-dot'} />
          Work
        </span>
        <strong>{summary}</strong>
        <span aria-hidden="true" className="work-status-chevron">⌄</span>
      </summary>
      <div className="work-status-body">
        {status.todos.length > 0 && (
          <section aria-label="Agent task list">
            <h3>Tasks</h3>
            <ol className="work-todo-list">
              {status.todos.map((item) => (
                <li className={`work-todo-${item.status}`} key={item.id}>
                  <span aria-hidden="true">{TODO_GLYPH[item.status]}</span>
                  <span>{item.content}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {status.subagents.length > 0 && (
          <section aria-label="Delegated agents">
            <h3>Delegated agents</h3>
            <ul className="work-agent-list">
              {status.subagents.map((agent) => (
                <li key={agent.id}>
                  <span
                    aria-hidden="true"
                    className={activeSubagent(agent.status) ? 'work-pulse' : 'work-dot'}
                  />
                  <span className="work-agent-copy">
                    <strong>{agent.goal}</strong>
                    <small>
                      {agent.status}
                      {agent.currentTool ? ` · ${agent.currentTool}` : ''}
                      {agent.summary ? ` · ${agent.summary}` : ''}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  )
}
