export interface MobileFeatureSet {
  profiles: boolean
  stored_sessions: boolean
  live_sessions: boolean
  projects: boolean
  revisioned_events: boolean
  recoverable_approval: boolean
  recoverable_clarification: boolean
  recoverable_sudo: boolean
  recoverable_secret: boolean
  attachments: boolean
  device_pairing: boolean
  push_notifications: boolean
}

export interface MobileCapabilities {
  contract_version: number
  plugin_version: string
  hermes_version: string
  status: 'compatible' | 'degraded' | 'incompatible' | string
  details: string[]
  features: MobileFeatureSet
}

export interface SessionSummary {
  id: string
  title: string | null
  preview: string | null
  started_at: number
  last_active?: number
  ended_at?: number | null
  message_count: number
  tool_call_count?: number
  source: string | null
  model?: string | null
  cwd?: string | null
  git_branch?: string | null
  git_repo_root?: string | null
  parent_session_id?: string | null
  end_reason?: string | null
  compacted?: boolean
}

export interface SessionListResult {
  sessions: SessionSummary[]
}

export interface SessionProjectGroup {
  id: string
  label: string
  path: string | null
  sessions: SessionSummary[]
}

export interface SessionProjectRepo {
  id: string
  label: string
  path: string | null
  groups: SessionProjectGroup[]
  sessionCount: number
}

export interface ProjectTree {
  id: string
  label: string
  path: string | null
  color?: string | null
  icon?: string | null
  archived?: boolean
  repos: SessionProjectRepo[]
  sessionCount: number
  lastActive?: number
  previewSessions?: SessionSummary[]
}

export interface ProjectsTreeResult {
  projects: ProjectTree[]
  active_id: string | null
  scoped_session_ids: string[]
}

export interface ProjectSessionsResult {
  project: ProjectTree | null
}

export interface SessionCreateResult {
  session_id: string
  stored_session_id: string
  message_count: number
  messages: unknown[]
  info?: {
    branch?: string
    cwd?: string
    model?: string
    profile_name?: string
    project?: unknown
  }
}

export interface SessionResumeResult extends SessionCreateResult {}

export interface GatewayEvent<T = Record<string, unknown>> {
  type: string
  payload: T
}

export type GatewayConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'failed'

export interface GatewayError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse<T> {
  jsonrpc: '2.0'
  id: string | number | null
  result?: T
  error?: GatewayError
}

export interface GatewayEventFrame<T = Record<string, unknown>> {
  jsonrpc: '2.0'
  method: 'event'
  params: GatewayEvent<T>
}
