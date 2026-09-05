import type { GatewayEvent } from './protocol/types'

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface MobileTodoItem {
  content: string
  id: string
  parent?: string
  status: TodoStatus
}

export type SubagentStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'

export interface MobileSubagent {
  currentTool?: string
  durationSeconds?: number
  goal: string
  id: string
  model?: string
  parentId?: string
  status: SubagentStatus
  summary?: string
  taskCount: number
  taskIndex: number
  updatedAt: number
}

export interface MobileWorkStatus {
  subagents: MobileSubagent[]
  todoRevision: number | null
  todos: MobileTodoItem[]
}

export interface DelegationStatusResult {
  active?: unknown[]
  scope_session_id?: string
}

const TODO_STATUSES = new Set<TodoStatus>([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
])
const TERMINAL_SUBAGENT_STATUSES = new Set<SubagentStatus>([
  'completed',
  'failed',
  'interrupted',
])

const activeTodo = (item: MobileTodoItem): boolean =>
  item.status === 'pending' || item.status === 'in_progress'

const activeSubagent = (item: MobileSubagent): boolean =>
  item.status === 'queued' || item.status === 'running'

export const emptyWorkStatus = (): MobileWorkStatus => ({
  subagents: [],
  todoRevision: null,
  todos: [],
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function parseRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseTodos(value: unknown, depth = 0): MobileTodoItem[] | null {
  if (depth > 2) return null
  if (typeof value === 'string' && value.trim()) {
    try {
      return parseTodos(JSON.parse(value), depth + 1)
    } catch {
      return null
    }
  }
  if (isRecord(value) && Object.hasOwn(value, 'todos')) {
    return parseTodos(value.todos, depth + 1)
  }
  if (!Array.isArray(value)) return null

  return value.flatMap((item) => {
    if (!isRecord(item) || !TODO_STATUSES.has(item.status as TodoStatus)) {
      return []
    }
    const id = text(item.id)
    const content = text(item.content)
    const parent = text(item.parent)
    return id && content
      ? [{
          content,
          id,
          status: item.status as TodoStatus,
          ...(parent && parent !== id ? { parent } : {}),
        }]
      : []
  })
}

function todoRevision(value: unknown, depth = 0): number | null {
  if (depth > 2) return null
  if (typeof value === 'string' && value.trim()) {
    try {
      return todoRevision(JSON.parse(value), depth + 1)
    } catch {
      return null
    }
  }
  if (!isRecord(value)) return null
  if (
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0
  ) {
    return value.revision
  }
  return Object.hasOwn(value, 'result')
    ? todoRevision(value.result, depth + 1)
    : null
}

function mergeTodoPatch(
  current: readonly MobileTodoItem[],
  value: unknown,
): MobileTodoItem[] | null {
  const args = parseRecord(value)
  if (args.merge !== true || !Array.isArray(args.todos)) return null
  const next = current.map((item) => ({ ...item }))
  const indexById = new Map(next.map((item, index) => [item.id, index]))
  let changed = false

  for (const raw of args.todos) {
    if (!isRecord(raw) || !TODO_STATUSES.has(raw.status as TodoStatus)) continue
    const id = text(raw.id)
    if (!id) continue
    const content = text(raw.content)
    const index = indexById.get(id)
    if (index === undefined) {
      next.push({
        content: content || '(no description)',
        id,
        status: raw.status as TodoStatus,
      })
      indexById.set(id, next.length - 1)
    } else {
      next[index] = {
        ...next[index],
        ...(content ? { content } : {}),
        status: raw.status as TodoStatus,
      }
    }
    changed = true
  }
  return changed ? next : null
}

function applyTodoSnapshot(
  state: MobileWorkStatus,
  value: unknown,
): MobileWorkStatus {
  const todos = parseTodos(value)
  if (todos === null) return state
  const revision = todoRevision(value)
  if (
    revision !== null &&
    state.todoRevision !== null &&
    revision < state.todoRevision
  ) {
    return state
  }
  if (todos.length === 0 && (revision === null || revision === 0)) return state
  return {
    ...state,
    todoRevision: revision ?? state.todoRevision,
    todos,
  }
}

function todoStateFromToolEvent(
  state: MobileWorkStatus,
  payload: Record<string, unknown>,
): MobileWorkStatus {
  const resultTodos = parseTodos(payload.todos) ?? parseTodos(payload.result)
  if (resultTodos) {
    return applyTodoSnapshot(state, {
      revision: todoRevision(payload),
      todos: resultTodos,
    })
  }
  const args = payload.args ?? payload.arguments
  const merged = mergeTodoPatch(state.todos, args)
  if (merged) return { ...state, todos: merged }
  const replacement = parseTodos(args)
  return replacement ? { ...state, todos: replacement } : state
}

function subagentStatus(value: unknown, complete: boolean): SubagentStatus {
  if (value === 'completed') return 'completed'
  if (value === 'failed' || value === 'error' || value === 'timeout') return 'failed'
  if (value === 'interrupted' || value === 'cancelled' || value === 'canceled') {
    return 'interrupted'
  }
  if (complete) return 'failed'
  return value === 'queued' ? 'queued' : 'running'
}

function subagentId(payload: Record<string, unknown>): string {
  return (
    text(payload.subagent_id) ||
    `${text(payload.parent_id) || 'root'}:${finiteNumber(payload.task_index) ?? 0}:${text(payload.goal) || 'Subagent'}`
  )
}

function upsertSubagent(
  state: MobileWorkStatus,
  payload: Record<string, unknown>,
  eventType: string,
): MobileWorkStatus {
  const id = subagentId(payload)
  const index = state.subagents.findIndex((item) => item.id === id)
  const previous = index >= 0 ? state.subagents[index] : undefined
  const refinesInterrupted =
    previous?.status === 'interrupted' && eventType === 'subagent.complete'
  if (
    previous &&
    TERMINAL_SUBAGENT_STATUSES.has(previous.status) &&
    !refinesInterrupted
  ) {
    return state
  }

  const complete = eventType === 'subagent.complete'
  const status = subagentStatus(payload.status, complete)
  const currentTool = text(payload.tool_name) || previous?.currentTool
  const next: MobileSubagent = {
    id,
    goal: text(payload.goal) || previous?.goal || 'Delegated task',
    parentId: text(payload.parent_id) || previous?.parentId,
    model: text(payload.model) || previous?.model,
    status,
    taskCount: finiteNumber(payload.task_count) ?? previous?.taskCount ?? 1,
    taskIndex: finiteNumber(payload.task_index) ?? previous?.taskIndex ?? 0,
    updatedAt: Date.now(),
    durationSeconds:
      finiteNumber(payload.duration_seconds) ?? previous?.durationSeconds,
    summary:
      text(payload.summary) ||
      (eventType === 'subagent.progress' || eventType === 'subagent.thinking'
        ? text(payload.text)
        : '') ||
      previous?.summary,
    ...(!TERMINAL_SUBAGENT_STATUSES.has(status) && currentTool
      ? { currentTool }
      : {}),
  }

  const withoutFallbacks = id.startsWith('delegate-tool:')
    ? state.subagents
    : state.subagents.filter((item) => !item.id.startsWith('delegate-tool:'))
  const targetIndex = withoutFallbacks.findIndex((item) => item.id === id)
  const subagents =
    targetIndex >= 0
      ? withoutFallbacks.map((item, row) => (row === targetIndex ? next : item))
      : [...withoutFallbacks, next]
  return { ...state, subagents }
}

function delegateFallbacks(
  payload: Record<string, unknown>,
  complete: boolean,
): Record<string, unknown>[] {
  if (payload.name !== 'delegate_task') return []
  const args = parseRecord(payload.args ?? payload.input)
  const result = parseRecord(payload.result)
  const tasks = Array.isArray(args.tasks)
    ? args.tasks.map(parseRecord)
    : [args]
  const toolId =
    text(payload.tool_id) ||
    text(payload.tool_call_id) ||
    text(payload.id) ||
    'delegate_task'
  const resultStatus = text(result.status).toLowerCase()
  const failed =
    Boolean(payload.error) ||
    ['timeout', 'error', 'failed', 'failure'].includes(resultStatus)
  return tasks.map((task, index) => ({
    goal: text(task.goal) || text(args.goal) || text(payload.context) || 'Delegated task',
    status: complete ? (failed ? 'failed' : 'completed') : 'running',
    subagent_id: `delegate-tool:${toolId}:${index}`,
    summary: text(result.summary) || text(payload.summary) || text(payload.message),
    task_count: tasks.length,
    task_index: index,
  }))
}

export function reduceWorkStatusEvent(
  state: MobileWorkStatus,
  event: GatewayEvent,
): MobileWorkStatus {
  const payload = isRecord(event.payload) ? event.payload : {}
  if (event.type === 'message.start') {
    return {
      ...state,
      subagents: state.subagents.filter((item) =>
        item.status === 'queued' || item.status === 'running'),
      todos: state.todos.some(activeTodo) ? state.todos : [],
    }
  }
  if (event.type === 'message.complete' || event.type === 'error') {
    return {
      ...state,
      subagents: state.subagents.filter(activeSubagent),
      todos: [],
    }
  }
  if (event.type === 'todo.updated') return applyTodoSnapshot(state, payload)
  if (
    (event.type === 'tool.start' || event.type === 'tool.progress') &&
    payload.name === 'todo'
  ) {
    return todoStateFromToolEvent(state, payload)
  }
  if (event.type === 'tool.complete' && payload.name === 'todo') {
    return todoStateFromToolEvent(state, payload)
  }
  if (event.type.startsWith('subagent.') && event.type !== 'subagent.text') {
    return upsertSubagent(state, payload, event.type)
  }
  if (
    event.type === 'tool.start' ||
    event.type === 'tool.progress' ||
    event.type === 'tool.complete'
  ) {
    return delegateFallbacks(payload, event.type === 'tool.complete').reduce(
      (current, item) =>
        upsertSubagent(
          current,
          item,
          event.type === 'tool.complete'
            ? 'subagent.complete'
            : 'subagent.progress',
        ),
      state,
    )
  }
  return state
}

export function restoreWorkStatusSnapshot(
  state: MobileWorkStatus,
  snapshot: unknown,
  running: boolean,
): MobileWorkStatus {
  if (!running) return { ...state, todoRevision: todoRevision(snapshot), todos: [] }
  const restored = applyTodoSnapshot(state, snapshot)
  return restored.todos.some(activeTodo)
    ? restored
    : { ...restored, todos: [] }
}

export function reconcileDelegationStatus(
  state: MobileWorkStatus,
  result: DelegationStatusResult,
): MobileWorkStatus {
  const activePayloads = Array.isArray(result.active)
    ? result.active.filter(isRecord)
    : []
  const activeIds = new Set(activePayloads.map(subagentId))
  let next: MobileWorkStatus = {
    ...state,
    subagents: state.subagents.map((item) =>
      (item.status === 'queued' || item.status === 'running') &&
      !item.id.startsWith('delegate-tool:') &&
      !activeIds.has(item.id)
        ? { ...item, currentTool: undefined, status: 'interrupted', updatedAt: Date.now() }
        : item,
    ),
  }
  for (const payload of activePayloads) {
    next = upsertSubagent(next, payload, 'subagent.progress')
  }
  return next
}
