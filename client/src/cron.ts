import type { HermesTransport } from './transport/hermes-transport'
import type { SessionSummary } from './protocol/types'

export interface CronJob {
  id: string
  name?: string
  prompt?: string
  schedule?: { display?: string; type?: string; expr?: string; cron?: string } | string
  schedule_display?: string
  enabled?: boolean
  state?: string
  last_status?: string
  last_error?: string
  last_fire_error?: string
  last_delivery_error?: string
  last_run_at?: string
  next_run_at?: string
  run_claim?: unknown
  fire_claim?: unknown
  latest_execution?: { status?: 'claimed' | 'running' | 'completed' | 'failed' | 'unknown'; started_at?: string; finished_at?: string; error?: string; delivery_outcome?: string } | null
}
export interface CronRun extends SessionSummary { is_active?: boolean; profile?: string }
export interface CronMessage { id?: number; role: string; content?: unknown }
export interface CronRunDetail { messages: CronMessage[]; pagination?: { returned: number; limit: number } }
export interface CronOutput { id: string; size_bytes: number; version: string }
export interface CronOutputs { outputs: CronOutput[]; next_before: string | null }
export interface CronOutputPage { id: string; job_id: string; profile: string; version: string; content: string; offset: number; next_offset: number | null; size_bytes: number }

export function appendCronOutput(current: CronOutputPage | null, page: CronOutputPage): CronOutputPage {
  if (page.offset === 0) return page
  if (!current || current.id !== page.id || current.job_id !== page.job_id || current.profile !== page.profile ||
      current.version !== page.version || current.next_offset !== page.offset) {
    throw new Error('Output changed or belongs to another run. Reload it before continuing.')
  }
  return { ...page, offset: 0, content: current.content + page.content }
}

export function cronStatus(job: CronJob): string {
  if (job.latest_execution?.status === 'running') return 'Running on host'
  if (job.latest_execution?.status === 'claimed') return 'Claimed by scheduler'
  if (job.latest_execution?.status === 'unknown') return 'Last execution outcome unknown'
  if (job.run_claim || job.fire_claim) return 'Claimed by scheduler'
  if (job.enabled === false || job.state === 'paused') return 'Paused'
  return job.last_status ? `Last run: ${job.last_status}` : job.state || 'Scheduled'
}

export function cronBusy(job: CronJob): boolean {
  return job.latest_execution?.status === 'running' || job.latest_execution?.status === 'claimed' || !!job.run_claim || !!job.fire_claim
}

export function cronSchedule(job: CronJob): string {
  if (job.schedule_display) return job.schedule_display
  if (typeof job.schedule === 'string') return job.schedule
  return job.schedule?.display || job.schedule?.expr || job.schedule?.cron || job.schedule?.type || 'Host schedule'
}

export class CronClient {
  private readonly pending = new Set<string>()
  constructor(private readonly transport: HermesTransport, readonly profile: string) {
    if (profile !== transport.connection.profile) throw new Error('Cron profile does not match the connected profile')
  }
  private path(suffix = ''): string {
    return `/api/cron/jobs${suffix}?profile=${encodeURIComponent(this.profile)}`
  }
  list(): Promise<CronJob[]> { return this.transport.requestJson(this.path()) }
  runs(jobId: string): Promise<{ runs: CronRun[] }> {
    return this.transport.requestJson(`${this.path(`/${encodeURIComponent(jobId)}/runs`)}&limit=20`)
  }
  messages(runId: string): Promise<CronRunDetail> {
    return this.transport.requestJson(`/api/sessions/${encodeURIComponent(runId)}/messages?profile=${encodeURIComponent(this.profile)}&limit=100&order=latest`)
  }
  outputs(jobId: string, before = ''): Promise<CronOutputs> {
    return this.transport.requestJson(`${this.path(`/${encodeURIComponent(jobId)}/outputs`)}&limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`)
  }
  output(jobId: string, output: CronOutput, offset = 0): Promise<CronOutputPage> {
    return this.transport.requestJson(`${this.path(`/${encodeURIComponent(jobId)}/outputs/${encodeURIComponent(output.id)}`)}&offset=${offset}&version=${encodeURIComponent(output.version)}`)
  }
  async action(jobId: string, action: 'trigger' | 'pause' | 'resume'): Promise<CronJob> {
    if (this.pending.has(jobId)) throw new Error('A request for this job is already in progress')
    this.pending.add(jobId)
    try {
      // Trigger can wait for execution. Never retry automatically after a lost response.
      return await this.transport.requestJson(this.path(`/${encodeURIComponent(jobId)}/${action}`), {}, { timeoutMs: 120_000 })
    } finally { this.pending.delete(jobId) }
  }
  async create(name: string, prompt: string, schedule: string): Promise<CronJob> {
    if (!name.trim() || !prompt.trim() || !schedule.trim()) throw new Error('Name, prompt and schedule are required')
    if (this.pending.has('')) throw new Error('A schedule creation is already in progress')
    this.pending.add('')
    try {
      return await this.transport.requestJson(this.path(), {
        name: name.trim(), prompt: prompt.trim(), schedule: schedule.trim(), deliver: 'local',
      })
    } finally { this.pending.delete('') }
  }
}

/** One request chain at a time. Disposing rejects late publication, including profile swaps. */
export function pollCron<T>(read: () => Promise<T>, publish: (value: T) => void,
  failed: (error: unknown) => void, intervalMs = 4_000): () => void {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    try { const value = await read(); if (!disposed) publish(value) }
    catch (error) { if (!disposed) failed(error) }
    finally { if (!disposed) timer = setTimeout(() => void run(), intervalMs) }
  }
  void run()
  return () => { disposed = true; clearTimeout(timer) }
}
