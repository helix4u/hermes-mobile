import type { HermesTransport } from './transport/hermes-transport'

export const SUPPORT_OPS_API_ROOT = '/api/plugins/support-ops'

export type SupportOpsAvailability = 'available' | 'missing' | 'unknown'

export interface SupportOpsHealth {
  ok?: boolean
  read_only?: boolean
  external_posting?: boolean
  index_exists?: boolean
  capabilities?: Record<string, unknown>
}

export interface SupportQueueThread {
  thread_id: string
  title?: string
  topic_label?: string
  ticket_status?: string
  ticket_area?: string
  last_message_at?: string
  hours_since_last_message?: number
  waiting_on_operator?: boolean
  waiting_on_support?: boolean
  pr_review_pending?: boolean
  merged_fix_candidate?: boolean
  archive_gap?: boolean
  stale_open?: boolean
  has_ticket?: boolean
  participants?: string[]
  discord_url?: string
}

export interface SupportQueuePayload {
  read_only?: boolean
  external_posting?: boolean
  meta?: Record<string, unknown>
  summary?: Record<string, number>
  threads?: SupportQueueThread[]
}

export interface SupportMessage {
  message_id?: string
  author?: string
  timestamp?: string
  body?: string
  is_operator?: boolean
}

export interface SupportAttachment {
  message_id?: string
  filename?: string
  local_path?: string
  media_path?: string
  remote_url?: string
  downloaded?: boolean
  download_error?: string
}

export interface SupportJob {
  id: string
  kind?: string
  status?: string
  message?: string
  activity_log?: unknown[]
}

export interface SupportSettings {
  workflow?: string
  execution_mode?: string
  program?: string
  profile?: string
  model?: string
  provider?: string
  codex_model?: string
  reasoning_effort?: string
  codex_profile?: string
  custom_instructions?: string
  include_agent_chat?: boolean
  agent_chat_turns?: number
}

export interface SupportOption {
  value?: string
  label?: string
  name?: string
  provider?: string
  model?: string
  is_default?: boolean
}

export interface SupportSettingsPayload {
  settings?: SupportSettings
  scope?: string
  thread_id?: string
  capabilities?: Record<string, unknown>
  options?: {
    workflows?: SupportOption[]
    execution_modes?: SupportOption[]
    programs?: SupportOption[]
    reasoning_efforts?: string[]
    profiles?: SupportOption[]
    models?: SupportOption[]
  }
}

export interface SupportThreadDetail {
  thread_id?: string
  title?: string
  discord_url?: string
  message_count?: number
  messages?: SupportMessage[]
  attachments?: SupportAttachment[]
  mention_names?: Record<string, string>
  stats?: Record<string, unknown>
  ticket?: Record<string, unknown> | null
  workspace?: Record<string, unknown> | null
  agent_chat?: { messages?: Array<Record<string, unknown>> }
  jobs?: SupportJob[]
  detail_pending?: boolean
  detail_message?: string
  detail_warning?: string
  archive_is_current?: boolean
}

export function supportOpsPath(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${SUPPORT_OPS_API_ROOT}${suffix}`
}

export async function probeSupportOps(
  transport: HermesTransport,
): Promise<SupportOpsAvailability> {
  try {
    await transport.requestJson<SupportOpsHealth>(supportOpsPath('/health'), undefined, {
      timeoutMs: 8_000,
    })
    return 'available'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/\bHTTP 404\b|no such api endpoint|not found/i.test(message)) {
      return 'missing'
    }
    // A transient network/auth/backend failure is not evidence that an
    // installed host plugin disappeared. The caller preserves its prior state.
    return 'unknown'
  }
}

export type SupportQueueFilter =
  | 'all'
  | 'waiting_operator'
  | 'waiting_support'
  | 'pr_review'
  | 'merged'
  | 'stale'
  | 'gaps'
  | 'no_ticket'

export function filterSupportThreads(
  rows: SupportQueueThread[],
  query: string,
  filter: SupportQueueFilter,
): SupportQueueThread[] {
  const needle = query.trim().toLowerCase()
  return rows
    .filter(row => {
      const matchesQuery =
        !needle ||
        [
          row.title,
          row.thread_id,
          row.topic_label,
          ...(row.participants ?? []),
        ].some(value => String(value ?? '').toLowerCase().includes(needle))
      if (!matchesQuery) return false
      if (filter === 'waiting_operator') return Boolean(row.waiting_on_operator)
      if (filter === 'waiting_support') return Boolean(row.waiting_on_support)
      if (filter === 'pr_review') return Boolean(row.pr_review_pending)
      if (filter === 'merged') return Boolean(row.merged_fix_candidate)
      if (filter === 'stale') return Boolean(row.stale_open)
      if (filter === 'gaps') return Boolean(row.archive_gap)
      if (filter === 'no_ticket') return !row.has_ticket
      return true
    })
    .sort((left, right) =>
      String(right.last_message_at ?? '').localeCompare(
        String(left.last_message_at ?? ''),
      ),
    )
}

function escapeMarkdownLabel(value: unknown, fallback: string): string {
  const label = String(value ?? fallback).trim() || fallback
  return label.replace(/[\[\]()*_`\\]/g, '\\$&')
}

export function normalizeSupportMarkdown(
  value: unknown,
  mentionNames: Record<string, string> = {},
): string {
  const serialized =
    typeof value === 'string'
      ? value
      : value == null
        ? ''
        : JSON.stringify(value, null, 2)
  const text = serialized ?? String(value ?? '')
  return text
    .replace(/\r\n?/g, '\n')
    .replace(
      /^\[reply to\s+([^\]\s]+)\s+msg=(\d{17,20})\]\s*$/gim,
      (_match, author) => `> Replying to **@${escapeMarkdownLabel(author, 'user')}**`,
    )
    .replace(/<@&(\d{17,20})>/g, '**@role**')
    .replace(/<@!?(\d{17,20})>/g, (_match, userId) => {
      const name = escapeMarkdownLabel(mentionNames[userId], 'Discord user')
      return `**@${name}**`
    })
    .replace(/<#(\d{17,20})>/g, '**#channel**')
    .replace(/<a?:([A-Za-z0-9_]+):\d{17,20}>/g, (_match, name) => `:${name}:`)
    .trim()
}

export function plainSupportTitle(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/\[([^\]]+)]\([^\s)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
}
