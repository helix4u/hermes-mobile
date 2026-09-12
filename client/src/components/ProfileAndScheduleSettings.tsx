import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CronClient,
  cronBusy,
  cronSchedule,
  cronStatus,
  pollCron,
  type CronJob,
  type CronRun,
  type CronRunDetail,
} from '../cron'
import type { HermesProfile } from '../profiles'
import type { HermesTransport } from '../transport/hermes-transport'
import { CronOutputs } from './CronOutputs'

interface Props {
  active: boolean
  profile: string
  switching: boolean
  transport: HermesTransport | null
  onSwitchProfile: (name: string) => Promise<boolean>
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export function ProfileAndScheduleSettings({
  active,
  profile,
  switching,
  transport,
  onSwitchProfile,
}: Props) {
  const [profiles, setProfiles] = useState<HermesProfile[]>([])
  const [profileError, setProfileError] = useState('')
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [jobsLoaded, setJobsLoaded] = useState(false)
  const [cronError, setCronError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [runs, setRuns] = useState<CronRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [runDetail, setRunDetail] = useState<CronRunDetail | null>(null)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedule, setSchedule] = useState('')
  const client = useMemo(
    () => (transport ? new CronClient(transport, profile) : null),
    [profile, transport],
  )
  const owner = useRef(client)
  owner.current = client

  useEffect(() => {
    owner.current = client
    return () => {
      owner.current = null
    }
  }, [client])

  useEffect(() => {
    if (!active || !transport) return
    let cancelled = false
    void transport.gateway
      .request<{ profiles: HermesProfile[] }>('profiles.list', {
        include_sessions: false,
      })
      .then(result => {
        if (cancelled) return
        setProfiles(result.profiles)
        setProfileError('')
      })
      .catch(error => {
        if (!cancelled) setProfileError(errorText(error))
      })
    return () => {
      cancelled = true
    }
  }, [active, transport])

  useEffect(() => {
    setJobs([])
    setJobsLoaded(false)
    setCronError('')
    setNotice('')
    setPending('')
    setSelectedJobId('')
    setRuns([])
    setSelectedRunId('')
    setRunDetail(null)
    if (!active || !client) return
    return pollCron(
      () => client.list(),
      rows => {
        setJobs(rows)
        setJobsLoaded(true)
        setCronError('')
        setSelectedJobId(current =>
          current && rows.some(row => row.id === current) ? current : '',
        )
      },
      error => setCronError(`Host refresh failed. ${errorText(error)}`),
    )
  }, [active, client])

  useEffect(() => {
    setRuns([])
    setSelectedRunId('')
    setRunDetail(null)
    if (!active || !client || !selectedJobId) return
    return pollCron(
      () => client.runs(selectedJobId),
      result => setRuns(result.runs),
      error => setCronError(errorText(error)),
    )
  }, [active, client, selectedJobId])

  useEffect(() => {
    setRunDetail(null)
    if (!active || !client || !selectedRunId) return
    return pollCron(
      () => client.messages(selectedRunId),
      setRunDetail,
      error => setCronError(errorText(error)),
    )
  }, [active, client, selectedRunId])

  async function switchProfile(nextProfile: string) {
    if (!nextProfile || nextProfile === profile || switching) return
    setProfileError('')
    try {
      const switched = await onSwitchProfile(nextProfile)
      if (!switched) setProfileError('Hermes did not switch profiles.')
    } catch (error) {
      setProfileError(errorText(error))
    }
  }

  async function act(
    job: CronJob,
    action: 'pause' | 'remove' | 'resume' | 'trigger',
  ) {
    if (!client || pending) return
    const request = `${action}:${job.id}`
    setPending(request)
    setCronError('')
    setNotice(
      action === 'trigger'
        ? 'Run requested. Live host state will update while it executes.'
        : '',
    )
    try {
      const updated = await client.action(job.id, action)
      if (owner.current !== client) return
      if (action === 'remove') {
        setJobs(current => current.filter(row => row.id !== job.id))
        if (selectedJobId === job.id) setSelectedJobId('')
        setNotice('Scheduled job removed.')
      } else if (updated) {
        setJobs(current =>
          current.map(row => (row.id === updated.id ? updated : row)),
        )
        setNotice(
          action === 'trigger'
            ? 'The host accepted the run request. Progress and results are below.'
            : 'Schedule updated.',
        )
        if (action === 'trigger') setSelectedJobId(job.id)
      }
    } catch (error) {
      if (owner.current !== client) return
      setCronError(
        `${errorText(error)}${
          action === 'trigger'
            ? ' The run may have started. Check progress before trying again.'
            : ''
        }`,
      )
    } finally {
      if (owner.current === client) setPending('')
    }
  }

  const runningCount = jobs.filter(cronBusy).length
  const activeProfile = profiles.find(row => row.name === profile)

  return (
    <>
      <details className="control-section">
        <summary>
          <span>
            <strong>Profile</strong>
            <small>{activeProfile?.display_name || profile}</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          <label>
            <span>Active profile</span>
            <select
              value={profile}
              disabled={!active || switching || !profiles.length}
              onChange={event => void switchProfile(event.target.value)}
            >
              {!profiles.some(row => row.name === profile) && (
                <option value={profile}>{profile}</option>
              )}
              {profiles.map(row => (
                <option key={row.name} value={row.name}>
                  {row.display_name || row.name}
                </option>
              ))}
            </select>
          </label>
          <p className="advanced-copy">
            {activeProfile?.description ||
              'Chat, settings, sessions, and scheduled work use this profile.'}
          </p>
          {switching && (
            <p className="advanced-copy" role="status">
              Finish the current connection operation or voice call before
              switching.
            </p>
          )}
          {profileError && <p role="alert">{profileError}</p>}
        </div>
      </details>

      <details className="control-section">
        <summary>
          <span>
            <strong>Scheduled work</strong>
            <small>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} in {profile}
              {runningCount ? `, ${runningCount} running` : ''}
            </small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          {!active && (
            <p className="advanced-copy">
              Connect to view this profile&apos;s scheduled work.
            </p>
          )}
          {active && !jobsLoaded && !cronError && (
            <p role="status">Loading scheduled work...</p>
          )}
          {cronError && <p role="alert">{cronError}</p>}
          {notice && <p role="status">{notice}</p>}

          {jobsLoaded && !jobs.length && (
            <p className="advanced-copy">No scheduled work in this profile.</p>
          )}
          <div className="cron-list">
            {jobs.map(job => {
              const paused = job.enabled === false || job.state === 'paused'
              const selected = selectedJobId === job.id
              return (
                <article className="cron-card" key={job.id}>
                  <div className="cron-card-heading">
                    <strong>{job.name || job.id}</strong>
                    <small>{cronStatus(job)}</small>
                  </div>
                  {job.prompt && <p>{job.prompt}</p>}
                  <small>
                    {cronSchedule(job)}
                    {job.next_run_at ? `, next ${job.next_run_at}` : ''}
                    {job.last_run_at ? `, last ${job.last_run_at}` : ''}
                  </small>
                  {[
                    job.latest_execution?.error,
                    job.last_error,
                    job.last_fire_error,
                    job.last_delivery_error,
                  ]
                    .filter(Boolean)
                    .map((message, index) => (
                      <p key={index} role="alert">
                        {message}
                      </p>
                    ))}
                  <div className="request-actions">
                    <button
                      className="primary-button"
                      disabled={!active || !!pending || cronBusy(job)}
                      type="button"
                      onClick={() => void act(job, 'trigger')}
                    >
                      {pending === `trigger:${job.id}` ? 'Starting...' : 'Run now'}
                    </button>
                    <button
                      className="quiet-button"
                      disabled={!active || !!pending}
                      type="button"
                      onClick={() => void act(job, paused ? 'resume' : 'pause')}
                    >
                      {paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      className="quiet-button"
                      disabled={!active}
                      type="button"
                      aria-expanded={selected}
                      onClick={() => setSelectedJobId(selected ? '' : job.id)}
                    >
                      {selected ? 'Hide progress' : 'Progress and results'}
                    </button>
                    <button
                      className="danger-button"
                      disabled={!active || !!pending}
                      type="button"
                      onClick={() => void act(job, 'remove')}
                    >
                      {pending === `remove:${job.id}` ? 'Removing...' : 'Remove'}
                    </button>
                  </div>

                  {selected && (
                    <div className="cron-progress" aria-label="Cron run history">
                      <h3>Run progress</h3>
                      <p>
                        Active means the host reports recent activity. Completed
                        and script-only output remains available below.
                      </p>
                      {!runs.length && <p>No session-based runs yet.</p>}
                      <div className="cron-run-list">
                        {runs.map(run => (
                          <button
                            className="quiet-button"
                            key={run.id}
                            type="button"
                            onClick={() => setSelectedRunId(run.id)}
                          >
                            {run.title || run.id}: {run.ended_at
                              ? run.end_reason || 'Finished'
                              : run.is_active
                                ? 'Active on host'
                                : 'No recent activity'}
                          </button>
                        ))}
                      </div>
                      {runDetail && (
                        <div aria-label="Run messages">
                          <p>Latest {runDetail.messages.length} messages</p>
                          {runDetail.messages.map((message, index) => (
                            <div className="cron-run-message" key={message.id ?? index}>
                              <strong>{message.role}</strong>
                              <pre>
                                {typeof message.content === 'string'
                                  ? message.content
                                  : JSON.stringify(message.content ?? '')}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                      <CronOutputs
                        active={active}
                        client={client}
                        jobId={job.id}
                      />
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <details className="control-subsection">
            <summary>New scheduled job</summary>
            <form
              className="cron-form"
              onSubmit={event => {
                event.preventDefault()
                if (!client || pending) return
                setPending('create')
                setCronError('')
                void client
                  .create(name, prompt, schedule)
                  .then(job => {
                    if (owner.current !== client) return
                    setJobs(current => [job, ...current])
                    setSelectedJobId(job.id)
                    setName('')
                    setPrompt('')
                    setSchedule('')
                    setNotice(
                      'Scheduled on this profile. Results are saved on the host.',
                    )
                  })
                  .catch(error => {
                    if (owner.current === client) setCronError(errorText(error))
                  })
                  .finally(() => {
                    if (owner.current === client) setPending('')
                  })
              }}
            >
              <label>
                <span>Name</span>
                <input
                  required
                  value={name}
                  onChange={event => setName(event.target.value)}
                />
              </label>
              <label>
                <span>Schedule</span>
                <input
                  required
                  placeholder="every 2h or 0 9 * * *"
                  value={schedule}
                  onChange={event => setSchedule(event.target.value)}
                />
              </label>
              <label>
                <span>Prompt</span>
                <textarea
                  required
                  rows={3}
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                />
              </label>
              <p className="advanced-copy">
                The job runs in {profile}. Delivery is saved locally on the
                selected host.
              </p>
              <button
                className="primary-button"
                disabled={!active || !!pending}
                type="submit"
              >
                {pending === 'create' ? 'Creating...' : 'Create scheduled job'}
              </button>
            </form>
          </details>
        </div>
      </details>
    </>
  )
}
