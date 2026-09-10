import { useEffect, useMemo, useRef, useState } from 'react'
import type { HermesTransport } from '../transport/hermes-transport'
import type { HermesProfile } from '../profiles'
import { CronOutputs } from './CronOutputs'
import { CronClient, cronBusy, cronSchedule, cronStatus, pollCron, type CronJob, type CronRun, type CronRunDetail } from '../cron'

interface Props {
  transport: HermesTransport | null
  profile: string
  active: boolean
  switching: boolean
  onSwitchProfile: (name: string) => Promise<boolean>
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function ProfilesCronPanel({ transport, profile, active, switching, onSwitchProfile }: Props) {
  const [profiles, setProfiles] = useState<HermesProfile[]>([])
  const [profileError, setProfileError] = useState('')
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState('')
  const [jobId, setJobId] = useState('')
  const [runs, setRuns] = useState<CronRun[]>([])
  const [runId, setRunId] = useState('')
  const [detail, setDetail] = useState<CronRunDetail | null>(null)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedule, setSchedule] = useState('')
  const client = useMemo(() => transport ? new CronClient(transport, profile) : null, [transport, profile])
  const owner = useRef(client)
  owner.current = client
  useEffect(() => { owner.current = client; return () => { owner.current = null } }, [client])

  useEffect(() => {
    if (!active || !transport) return
    let cancelled = false
    void transport.gateway.request<{ profiles: HermesProfile[] }>('profiles.list', { include_sessions: false })
      .then(result => { if (!cancelled) { setProfiles(result.profiles); setProfileError('') } })
      .catch(reason => { if (!cancelled) setProfileError(errorText(reason)) })
    return () => { cancelled = true }
  }, [active, transport])
  useEffect(() => {
    if (!active || !client) return
    return pollCron(() => client.list(), rows => { setJobs(rows); setLoaded(true); setPollError('') }, reason => setPollError(errorText(reason)))
  }, [active, client])
  useEffect(() => {
    setRuns([]); setRunId(''); setDetail(null)
    if (!active || !client || !jobId) return
    return pollCron(() => client.runs(jobId), result => setRuns(result.runs), reason => setError(errorText(reason)))
  }, [active, client, jobId])
  useEffect(() => {
    setDetail(null)
    if (!active || !client || !runId) return
    return pollCron(() => client.messages(runId), setDetail, reason => setError(errorText(reason)))
  }, [active, client, runId])

  async function act(job: CronJob, action: 'trigger' | 'pause' | 'resume') {
    if (!client || pending) return
    setPending(job.id); setError('')
    setNotice(action === 'trigger' ? 'Run requested. Watching host state while it executes.' : '')
    try {
      await client.action(job.id, action)
      if (owner.current !== client) return
      setNotice(action === 'trigger' ? 'Host returned from the run request. See the run history for its result.' : 'Schedule updated.')
    } catch (reason) {
      if (owner.current === client) setError(`${errorText(reason)}${action === 'trigger' ? '. The run may have started. Check history before trying again.' : ''}`)
    } finally { if (owner.current === client) setPending('') }
  }

  return <div className="control-panel" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <section className="control-section" style={{ padding: '0.85rem' }}>
      <h2>Profile</h2>
      <label>Active profile
        <select value={profile} disabled={!active || switching || !!pending || !profiles.length}
          onChange={event => { void onSwitchProfile(event.target.value).catch(reason => setProfileError(errorText(reason))) }}>
          {!profiles.some(row => row.name === profile) && <option value={profile}>{profile}</option>}
          {profiles.map(row => <option key={row.name} value={row.name}>{row.display_name || row.name}</option>)}
        </select>
      </label>
      <p>{profiles.find(row => row.name === profile)?.description || 'Chat, settings and cron jobs use this profile. Other running work is left alone.'}</p>
      {switching && <p>Finish the current connection operation or voice call before switching.</p>}
      {profileError && <p role="alert">Profile discovery unavailable: {profileError}</p>}
    </section>
    <details className="control-section" open>
      <summary>Cron jobs ({profile})</summary>
      {!active && <p>Connect to view this profile's scheduled jobs.</p>}
      {active && !loaded && !error && !pollError && <p>Loading jobs...</p>}
      {pollError && <p role="alert">Host refresh failed. {pollError}</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loaded && !jobs.length && <p>No scheduled jobs in this profile.</p>}
      {jobs.map(job => <article key={job.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
        <h3>{job.name || job.id}</h3>
        <p>{cronSchedule(job)}. {cronStatus(job)}</p>
        {job.next_run_at && <p>Next: {job.next_run_at}</p>}
        {job.last_run_at && <p>Last: {job.last_run_at}</p>}
        {[job.latest_execution?.error, job.last_error, job.last_fire_error, job.last_delivery_error].filter(Boolean).map((text, index) => <p key={index} role="alert">{text}</p>)}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button disabled={!active || !!pending || cronBusy(job)} onClick={() => { setJobId(job.id); void act(job, 'trigger') }}>{pending === job.id ? 'Request pending...' : 'Run now'}</button>
          <button disabled={!active || !!pending} onClick={() => void act(job, job.enabled === false || job.state === 'paused' ? 'resume' : 'pause')}>{job.enabled === false || job.state === 'paused' ? 'Resume schedule' : 'Pause schedule'}</button>
          <button disabled={!active} onClick={() => setJobId(job.id)}>Progress and results</button>
        </div>
      </article>)}
      {jobId && <section aria-label="Cron run history">
        <h3>Run history</h3>
        <p>Updates every few seconds. Active means the host reports recent activity, not a completion estimate.</p>
        {!runs.length && <p>No session-based runs yet. Script-only results appear under Saved output.</p>}
        {runs.map(run => <button key={run.id} onClick={() => setRunId(run.id)} style={{ display: 'block', maxWidth: '100%', marginBottom: 8 }}>
          {run.title || run.id}: {run.ended_at ? run.end_reason || 'Finished' : run.is_active ? 'Active on host' : 'No recent activity'}
        </button>)}
        {detail && <div aria-label="Run progress and output">
          <p>Latest {detail.messages.length} messages.</p>
          {detail.messages.map((message, index) => <div key={message.id ?? index}><strong>{message.role}</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '')}</pre></div>)}
        </div>}
      </section>}
      {jobId && <CronOutputs key={`${profile}:${jobId}`} client={client} jobId={jobId} active={active} />}
      <details style={{ padding: '0.85rem' }}><summary>New scheduled job</summary>
        <form onSubmit={event => {
          event.preventDefault()
          if (!client || pending) return
          setPending('create'); setError('')
          void client.create(name, prompt, schedule).then(job => {
            if (owner.current !== client) return
            setJobId(job.id); setNotice('Scheduled on this profile. Results are saved locally on the host.')
            setName(''); setPrompt(''); setSchedule('')
          }).catch(reason => { if (owner.current === client) setError(errorText(reason)) })
            .finally(() => { if (owner.current === client) setPending('') })
        }}>
          <label>Name<input required value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Prompt<textarea required value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
          <label>Schedule<input required value={schedule} placeholder="every 2h or 0 9 * * *" onChange={event => setSchedule(event.target.value)} /></label>
          <p>Creating a schedule can run Hermes at its scheduled time. Delivery is local host storage.</p>
          <button disabled={!active || !!pending}>Create scheduled job</button>
        </form>
      </details>
    </details>
  </div>
}
