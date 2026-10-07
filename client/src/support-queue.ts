import { supportOpsPath, type SupportJob } from './support-ops'
import type { HermesTransport } from './transport/hermes-transport'

type Request = HermesTransport['requestJson']
type MutationMethod = 'POST' | 'PUT'

export interface SupportReceipt {
  job: SupportJob
  label: string
  submitted: boolean
  pollError?: string
  sidechat?: { targetId: string; message: string }
}

export interface SupportUnconfirmedIntent {
  id: string
  label: string
  targetId?: string
  retryable: boolean
  error: string
  sending: boolean
}

interface Intent extends SupportUnconfirmedIntent {
  key: string
  path: string
  body: Record<string, unknown>
  method: MutationMethod
  timeoutMs: number
  promise?: Promise<unknown>
}

interface Snapshot {
  receipts: SupportReceipt[]
  unconfirmed: SupportUnconfirmedIntent[]
}

export function supportQueueScope(connectionId: string, baseUrl = '', profile = 'default'): string {
  return JSON.stringify([connectionId, baseUrl, profile])
}

export function isSupportJob(value: unknown): value is SupportJob {
  if (!value || typeof value !== 'object') return false
  const job = value as SupportJob
  return typeof job.id === 'string' && /^[a-f0-9]{12}$/.test(job.id)
}

export function supportJobIsTerminal(job: SupportJob): boolean {
  return ['completed', 'failed', 'cancelled'].includes(job.status ?? '')
}

export function supportQueueActionDisabled(connected: boolean, submitting: boolean,
  prerequisiteMissing: boolean, queuedAdmission: boolean, hasActiveJob: boolean): boolean {
  return !connected || submitting || prerequisiteMissing || (!queuedAdmission && hasActiveJob)
}

export function clearAcceptedSidechat(current: string, submitted: string, accepted: boolean, sameTarget: boolean): string {
  return accepted && sameTarget && current.trim() === submitted ? '' : current
}

export function queuedSupportMutation(path: string, body: Record<string, unknown>, method: string): boolean {
  if (method === 'GET' || /\/jobs\//.test(path)) return false
  if (/^\/threads\/\d+\/(runs|sync|ticket|agent-chat)$/.test(path)) return true
  if (/^\/threads\/\d+\/draft\/reject$/.test(path)) return body.redraft !== false
  return ['/sync', '/runs/bulk', '/tickets/unticketed', '/portable/import', '/portable/backup',
    '/stats/regenerate', '/backend/start', '/backend/stop', '/backend/poll', '/backend/full-sync', '/poll-settings'].includes(path)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]))
  }
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** In-memory only. One instance belongs to exactly one host/connection/profile. */
export class SupportQueueClient {
  private intents = new Map<string, Intent>()
  private receipts = new Map<string, SupportReceipt>()
  private listeners = new Set<() => void>()
  private current: Snapshot = { receipts: [], unconfirmed: [] }
  private polling: Promise<void> | null = null

  constructor(readonly scope: string, private makeId: () => string = () => crypto.randomUUID()) {}

  snapshot = (): Snapshot => this.current
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private changed(): void {
    // Never evict active receipts. Keep a bounded completed display history.
    const terminal = [...this.receipts.values()].reverse().filter(item => supportJobIsTerminal(item.job))
      .sort((a, b) => (b.job.finished_at ?? b.job.created_at ?? '').localeCompare(a.job.finished_at ?? a.job.created_at ?? ''))
    for (const item of terminal.slice(50)) this.receipts.delete(item.job.id)
    this.current = {
      receipts: [...this.receipts.values()],
      unconfirmed: [...this.intents.values()].filter(item => item.error).map(item => ({
        id: item.id, label: item.label, targetId: item.targetId,
        retryable: item.retryable, error: item.error, sending: item.sending,
      })),
    }
    for (const listener of this.listeners) listener()
  }

  receive(value: unknown, label = 'Support job', submitted = false): void {
    const envelope = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const jobs = isSupportJob(value) ? [value] : Array.isArray(envelope.jobs) ? envelope.jobs.filter(isSupportJob) : []
    if (typeof envelope.job_id === 'string' && /^[a-f0-9]{12}$/.test(envelope.job_id)) {
      jobs.push({ id: envelope.job_id })
    }
    for (const job of jobs) {
      const old = this.receipts.get(job.id)
      const intent = [...this.intents.values()].find(item => item.id === job.request_id
        && (!item.targetId || item.targetId === job.thread_id))
      if (intent) this.intents.delete(intent.key)
      // Older list responses and id-only voice receipts cannot regress a terminal job.
      if (old && supportJobIsTerminal(old.job) && !supportJobIsTerminal(job)) continue
      if (old?.job.status === 'running' && job.status === 'queued') continue
      this.receipts.set(job.id, {
        job: { ...old?.job, ...job }, label: intent?.label ?? old?.label ?? label,
        submitted: Boolean(old?.submitted || submitted || intent),
        sidechat: old?.sidechat ?? (intent?.path.endsWith('/agent-chat') && intent.targetId && typeof intent.body.message === 'string'
          ? { targetId: intent.targetId, message: intent.body.message } : undefined),
      })
    }
    this.changed()
  }

  submit<T>(request: Request, path: string, body: Record<string, unknown>, method: MutationMethod,
    label: string, retryable: boolean, timeoutMs = 30_000): Promise<T> {
    const frozen = JSON.parse(JSON.stringify(canonical(body))) as Record<string, unknown>
    const key = JSON.stringify([method, path, frozen])
    let intent = this.intents.get(key)
    if (!intent) {
      intent = {
        id: this.makeId(), key, path, body: frozen, method, label, retryable,
        timeoutMs: retryable ? 30_000 : timeoutMs,
        targetId: /^\/threads\/(\d+)\//.exec(path)?.[1], error: '', sending: false,
      }
      this.intents.set(key, intent)
    } else if (intent.error && !intent.retryable) {
      return Promise.reject(new Error('Acceptance is unconfirmed. This host does not support safe request retries. Check job history before repeating it.'))
    }
    return this.attempt(request, intent) as Promise<T>
  }

  async retry(request: Request, id: string): Promise<{ value: unknown; targetId?: string; message?: string }> {
    const intent = [...this.intents.values()].find(item => item.id === id)
    if (!intent?.retryable) throw new Error('This request cannot be safely retried.')
    const value = await this.attempt(request, intent)
    return { value, targetId: intent.targetId,
      message: intent.path.endsWith('/agent-chat') && typeof intent.body.message === 'string' ? intent.body.message : undefined }
  }

  private attempt(request: Request, intent: Intent): Promise<unknown> {
    if (intent.promise) return intent.promise
    intent.sending = true
    this.changed()
    const promise = request<unknown>(supportOpsPath(intent.path), {
      ...intent.body, async: true, request_id: intent.id,
    }, { method: intent.method, timeoutMs: intent.timeoutMs }).then(value => {
      const bulk = value && typeof value === 'object' ? (value as { jobs?: unknown }).jobs : undefined
      if (intent.retryable && !isSupportJob(value) && !(Array.isArray(bulk) && bulk.every(isSupportJob))) {
        throw new Error('Support host did not return an operation receipt. Acceptance is unconfirmed.')
      }
      this.receive(value, intent.label, true)
      this.intents.delete(intent.key)
      return value
    }).catch(error => {
      const accepted = [...this.receipts.values()].find(item => item.job.request_id === intent.id)
      if (accepted) return accepted.job
      if (this.intents.get(intent.key) === intent) intent.error = errorMessage(error)
      throw error
    }).finally(() => {
      intent.sending = false
      intent.promise = undefined
      this.changed()
    })
    intent.promise = promise
    return promise
  }

  poll(request: Request, current: () => boolean = () => true): Promise<void> {
    if (this.polling) return this.polling
    this.polling = this.pollOnce(request, current).finally(() => { this.polling = null })
    return this.polling
  }

  private async pollOnce(request: Request, current: () => boolean): Promise<void> {
    // Known IDs survive thread changes and a truncated /jobs listing.
    for (const { job } of [...this.receipts.values()]) {
      if (supportJobIsTerminal(job)) continue
      if (!current()) return
      try {
        const next = await request<SupportJob>(supportOpsPath(`/jobs/${job.id}`), undefined, { timeoutMs: 10_000 })
        if (!isSupportJob(next) || next.id !== job.id) throw new Error('Job status did not match its receipt.')
        this.receive(next)
      } catch (error) {
        const item = this.receipts.get(job.id)
        if (item) item.pollError = errorMessage(error)
        this.changed()
        if (!/^HTTP 404\b/.test(errorMessage(error))) return
      }
    }
  }
}

export function supportJobGroups(jobs: SupportJob[]): { running: SupportJob[]; queued: SupportJob[] } {
  return {
    running: jobs.filter(job => job.status === 'running'),
    queued: jobs.filter(job => job.status === 'queued')
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
  }
}

export function supportJobCompletion(job: SupportJob, label: string): string {
  if (job.status !== 'completed') return `${label} ${job.status}: ${job.error || 'No work will be repeated automatically.'}`
  const result = job.result && typeof job.result === 'object' ? job.result as Record<string, unknown> : {}
  if (typeof result.filename === 'string') return `Backup saved as ${result.filename}`
  if (typeof result.ticketed === 'number') return `${result.ticketed} durable tickets saved${Array.isArray(result.failures) && result.failures.length ? `, ${result.failures.length} failed` : ''}`
  return `${label} completed`
}
