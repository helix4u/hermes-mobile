import { supportJobCompletion, supportJobGroups, supportJobIsTerminal, type SupportReceipt, type SupportUnconfirmedIntent } from '../support-queue'
import type { SupportJob } from '../support-ops'

interface Props {
  receipts: SupportReceipt[]
  unconfirmed: SupportUnconfirmedIntent[]
  connected: boolean
  busy: boolean
  onCancel: (id: string) => void
  onRetry: (id: string) => void
}

/** Troubleshooting is an explicit page, never content above the ticket queue. */
export function SupportActivityView({ receipts, unconfirmed, connected, busy, onCancel, onRetry }: Props) {
  const groups = supportJobGroups(receipts.map(item => item.job))
  const details = new Map(receipts.map(item => [item.job.id, item]))
  const recent = receipts.filter(item => supportJobIsTerminal(item.job)).slice(-12).reverse()
  const checking = receipts.filter(item => !item.job.status)
  const row = (job: SupportJob) => {
    const item = details.get(job.id)!
    return <article className="support-job-row" key={job.id}>
      <div className="support-inline-heading"><strong>{item.label || job.kind?.replaceAll('_', ' ') || 'Support task'}</strong>
        <span>{job.status || 'Checking status'}</span></div>
      {job.status === 'queued' && <p>Waiting to start.</p>}
      {item.pollError && <p role="status">Status refresh unavailable. The accepted task is still tracked. {item.pollError}</p>}
      {job.error && <p role="alert">{job.error}</p>}
      {job.status === 'completed' && <p>{supportJobCompletion(job, item.label)}</p>}
      {['queued', 'running'].includes(job.status ?? '') && <button type="button"
        disabled={!connected || busy || job.cancel_requested} onClick={() => onCancel(job.id)}>
        {job.cancel_requested ? 'Cancellation requested' : 'Cancel'}</button>}
      <details className="support-job-diagnostics"><summary>Technical details</summary>
        <dl><dt>Task ID</dt><dd><code>{job.id}</code></dd>
          {job.thread_id && <><dt>Thread</dt><dd>{job.thread_id}</dd></>}
          {typeof job.provenance?.profile === 'string' && <><dt>Profile</dt><dd>{job.provenance.profile}</dd></>}
        </dl>
        {job.message && <p>{job.message}</p>}
        {job.activity_log?.length ? <pre>{job.activity_log.slice(-3).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')}</pre> : null}
      </details>
    </article>
  }
  return <div className="support-activity-view" aria-label="Support task activity">
    <p className="settings-note">Background tasks and troubleshooting. Tickets stay in Queue.</p>
    {groups.running.length > 0 && <section className="support-section"><h2>Running</h2>{groups.running.map(row)}</section>}
    {groups.queued.length > 0 && <section className="support-section"><h2>Waiting to start</h2>{groups.queued.map(row)}</section>}
    {checking.length > 0 && <section className="support-section"><h2>Checking status</h2>{checking.map(item => row(item.job))}</section>}
    {unconfirmed.length > 0 && <section className="support-section"><h2>Needs checking</h2>
      {unconfirmed.map(intent => <article className="support-job-row" key={intent.id}>
        <strong>{intent.label}</strong><p>Acceptance is unconfirmed. {intent.error}</p>
        <button type="button" disabled={!connected || busy || intent.sending || !intent.retryable}
          onClick={() => onRetry(intent.id)}>Check task status</button>
        {!intent.retryable && <p>This host does not advertise safe retries. Check activity before repeating the operation.</p>}
      </article>)}
    </section>}
    {recent.length > 0 && <details className="support-disclosure support-activity-history">
      <summary>Recent activity ({recent.length})</summary>{recent.map(item => row(item.job))}
    </details>}
    {!receipts.length && !unconfirmed.length && <p className="support-muted">No tracked tasks.</p>}
  </div>
}
