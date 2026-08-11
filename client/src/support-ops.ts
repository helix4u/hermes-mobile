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

export interface SupportWaitingOwners {
  support?: string[]
  developers?: string[]
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
  waiting_on?: SupportWaitingOwners
  discord_url?: string
}

export interface SupportQueuePayload {
  read_only?: boolean
  external_posting?: boolean
  meta?: Record<string, unknown>
  summary?: Record<string, number>
  threads?: SupportQueueThread[]
}

export interface SupportStatsDay {
  date?: string
  opened?: number
  closed?: number
  net?: number
  cumulative_open?: number
}

export interface SupportStatsBucket {
  bucket?: string
  label?: string
  open_now?: number
  total_threads?: number
  open?: number
  total?: number
}

export interface SupportStatsPayload {
  generated_at?: string
  totals?: {
    all_threads?: number
    open_now?: number
    closed?: number
    opened_last_7_days?: number
    closed_last_7_days?: number
  }
  daily?: SupportStatsDay[]
  buckets?: SupportStatsBucket[]
  topic_buckets?: SupportStatsBucket[]
  classification_health?: {
    unclassified?: number
    general_support?: number
    archive_integrity?: { archive_gap?: number }
  }
  issue_clusters?: { cluster_count?: number }
}

export interface SupportPlaybackVoice {
  provider?: string
  voice?: string
  speed?: number
}

export interface SupportVoicePreset {
  label?: string
  provider?: string
  voice?: string
  model?: string
}

export interface SupportOperatorConfig {
  operator_name?: string
  team_members?: string[]
  support_members?: string[]
  developer_members?: string[]
  categories?: string[]
  voice_presets?: SupportVoicePreset[]
  playback_voice?: SupportPlaybackVoice
  backup_directory?: string
}

export interface SupportOperatorConfigPayload {
  config?: SupportOperatorConfig
  external_posting?: boolean
}

export interface SupportPortableBundle {
  schema?: string
  exported_at?: string
  operator_config?: SupportOperatorConfig
  settings?: SupportSettings
  thread_settings?: Record<string, SupportSettings>
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
  access_preset?: string
  hermes_toolsets?: string[]
  codex_sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  codex_yolo?: boolean
}

export interface SupportOption {
  value?: string
  label?: string
  name?: string
  provider?: string
  model?: string
  is_default?: boolean
  description?: string
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
    access_presets?: SupportOption[]
    codex_sandboxes?: SupportOption[]
    hermes_toolsets?: SupportOption[]
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
  waiting_on?: SupportWaitingOwners
}

export function supportOpsPath(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${SUPPORT_OPS_API_ROOT}${suffix}`
}

export function supportOpsTargetedSyncAvailable(
  health: SupportOpsHealth | null | undefined,
): boolean {
  return health?.capabilities?.targeted_sync === true
}

export async function probeSupportOps(
  transport: HermesTransport,
): Promise<SupportOpsAvailability> {
  try {
    await transport.requestJson<SupportOpsHealth>(
      supportOpsPath('/health'),
      undefined,
      {
        timeoutMs: 8_000,
      },
    )
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
    .filter((row) => {
      const matchesQuery =
        !needle ||
        [
          row.title,
          row.thread_id,
          row.topic_label,
          ...(row.participants ?? []),
        ].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(needle),
        )
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

export function isOmittedSupportParticipant(value: unknown): boolean {
  const name = String(value ?? '').trim().toLowerCase()
  return (
    name === 'argus' ||
    name === 'argus panoptes' ||
    name.startsWith('argus panoptes#')
  )
}

export function supportVisibleParticipants(
  values: unknown[] | null | undefined,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values ?? []) {
    const name = String(value ?? '').trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key) || isOmittedSupportParticipant(name)) continue
    seen.add(key)
    result.push(name)
  }
  return result
}

export function supportSetupLines(values: unknown): string {
  return Array.isArray(values)
    ? values.map(value => String(value ?? '').trim()).filter(Boolean).join('\n')
    : ''
}

export function parseSupportSetupLines(value: unknown): string[] {
  return [
    ...new Set(
      String(value ?? '')
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  ]
}

export function supportVoicePresetLines(values: unknown): string {
  return Array.isArray(values)
    ? values
        .filter(value => value && typeof value === 'object')
        .map(value => {
          const row = value as SupportVoicePreset
          return [row.label, row.provider, row.voice, row.model]
            .map(part => String(part ?? '').trim())
            .join(' | ')
        })
        .join('\n')
    : ''
}

export function parseSupportVoicePresetLines(
  value: unknown,
): SupportVoicePreset[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map(row => {
      const [label = '', provider = '', voice = '', model = ''] = row
        .split('|')
        .map(item => item.trim())
      return { label, provider, voice, model }
    })
    .filter(row => row.label || row.provider || row.voice)
}

export function normalizeSupportPlaybackSpeed(value: unknown): number {
  const speed = Number(value)
  return Number.isFinite(speed) ? Math.max(0.5, Math.min(2, speed)) : 1
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
      (_match, author) =>
        `> Replying to **@${escapeMarkdownLabel(author, 'user')}**`,
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

function markdownSection(title: string, value: unknown): string {
  const body = normalizeSupportMarkdown(value)
  return body ? `## ${title}\n\n${body}` : ''
}

function supportTranscriptMarkdown(detail: SupportThreadDetail): string {
  return (detail.messages ?? [])
    .map((message) => {
      const author = String(message.author || 'Unknown')
      const timestamp = message.timestamp ? ` (${message.timestamp})` : ''
      const body = normalizeSupportMarkdown(message.body, detail.mention_names)
      return body ? `### ${author}${timestamp}\n\n${body}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function supportAttachmentsMarkdown(detail: SupportThreadDetail): string {
  return (detail.attachments ?? [])
    .map((attachment) => {
      const name = String(attachment.filename || 'attachment')
      const location = String(
        attachment.remote_url ||
          attachment.media_path ||
          attachment.local_path ||
          '',
      )
      const status = attachment.download_error
        ? `download error: ${attachment.download_error}`
        : attachment.downloaded === false
          ? 'not archived locally'
          : ''
      return `- ${name}${location ? `: ${location}` : ''}${status ? ` (${status})` : ''}`
    })
    .join('\n')
}

export function supportInvestigationPrompt(
  detail: SupportThreadDetail,
): string {
  const workspace = detail.workspace ?? {}
  const investigation = normalizeSupportMarkdown(workspace.investigation)
  const operatorNotes = normalizeSupportMarkdown(workspace.operator_notes)
  const ticket = normalizeSupportMarkdown(detail.ticket)
  const transcript = supportTranscriptMarkdown(detail)
  const attachments = supportAttachmentsMarkdown(detail)
  return [
    `Continue the support investigation for "${plainSupportTitle(detail.title) || detail.thread_id || 'this support thread'}" in a normal Hermes session.`,
    `Thread ID: ${detail.thread_id || 'unknown'}`,
    detail.discord_url ? `Discord reference: ${detail.discord_url}` : '',
    'This is an operator workspace. Do not post to Discord or mutate external support state unless I explicitly ask in this session.',
    investigation ? `\n## Existing investigation\n\n${investigation}` : '',
    operatorNotes ? `\n## Operator notes\n\n${operatorNotes}` : '',
    ticket ? `\n## Current ticket\n\n${ticket}` : '',
    transcript ? `\n## Discord transcript\n\n${transcript}` : '',
    attachments ? `\n## Attachments\n\n${attachments}` : '',
    '\nReview the existing evidence, identify the next defensible action, and continue from there.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function supportHandoffMarkdown(detail: SupportThreadDetail): string {
  const title =
    plainSupportTitle(detail.title) || detail.thread_id || 'Support handoff'
  const workspace = detail.workspace ?? {}
  const transcript = supportTranscriptMarkdown(detail)
  const attachments = supportAttachmentsMarkdown(detail)
  return [
    `# ${title}`,
    `- Thread ID: ${detail.thread_id || 'unknown'}`,
    detail.discord_url ? `- Discord: ${detail.discord_url}` : '',
    `- Messages: ${detail.message_count ?? detail.messages?.length ?? 0}`,
    `- Exported: ${new Date().toISOString()}`,
    markdownSection('Workspace investigation', workspace.investigation),
    markdownSection('Operator notes', workspace.operator_notes),
    markdownSection('Suggested response', workspace.suggested_response),
    markdownSection('Ticket', detail.ticket),
    attachments ? `## Attachments\n\n${attachments}` : '',
    transcript ? `## Discord transcript\n\n${transcript}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function supportHandoffFilename(detail: SupportThreadDetail): string {
  const title =
    plainSupportTitle(detail.title) || detail.thread_id || 'support-handoff'
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return `${stem || 'support-handoff'}-${detail.thread_id || 'thread'}.md`
}
