import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { writeClipboardText } from '../clipboard'
import {
  previewMediaInfo,
  previewName,
  type PreviewDocument,
  type PreviewKind,
} from '../preview'
import { saveDataUrl } from '../save-data'
import {
  filterSupportThreads,
  normalizeSupportMarkdown,
  plainSupportTitle,
  supportOpsPath,
  type SupportAttachment,
  type SupportJob,
  type SupportOption,
  type SupportQueueFilter,
  type SupportQueuePayload,
  type SupportQueueThread,
  type SupportSettings,
  type SupportSettingsPayload,
  type SupportThreadDetail,
} from '../support-ops'
import type { HermesTransport } from '../transport/hermes-transport'
import { ImagePreview } from './ImageViewer'
import { MarkdownContent } from './MarkdownContent'

interface SupportOpsViewProps {
  active: boolean
  connected: boolean
  connectionId: string
  transport: HermesTransport | null
  onError?: (message: string) => void
  onNotice?: (message: string) => void
  onOpenDocumentPreviewer?: (document: PreviewDocument) => void
  onOpenDocumentReader?: (document: PreviewDocument) => void
  onVoiceInput?: (target: (text: string) => void) => void
  voicePhase?: string
  voiceRecordingAvailable?: boolean
}

const FILTERS: Array<[SupportQueueFilter, string]> = [
  ['all', 'All open'],
  ['waiting_operator', 'Waiting on operator'],
  ['waiting_support', 'Waiting on support'],
  ['pr_review', 'PR review'],
  ['merged', 'Merged fix'],
  ['stale', 'Stale'],
  ['gaps', 'Archive gaps'],
  ['no_ticket', 'No ticket'],
]

function safeExternalUrl(value: unknown): string {
  try {
    const parsed = new URL(String(value ?? ''))
    return ['http:', 'https:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
      ? parsed.href
      : ''
  } catch {
    return ''
  }
}

function formatTime(value: unknown): string {
  const date = new Date(String(value ?? ''))
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function compactAge(value: unknown): string {
  const hours = Number(value)
  if (!Number.isFinite(hours)) return ''
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

function isExpectedTransportInterruption(message: string): boolean {
  return /interruptedioexception|request (?:was )?cancelled|aborterror/i.test(
    message,
  )
}

export function appendSupportDictation(current: string, text: string): string {
  const existing = current.trimEnd()
  const next = text.trim()
  if (!next) return current
  return existing ? `${existing} ${next}` : next
}

function VoiceInputButton({
  available,
  onTranscript,
  onVoiceInput,
  phase,
}: {
  available: boolean
  onTranscript: (text: string) => void
  onVoiceInput?: (target: (text: string) => void) => void
  phase: string
}) {
  if (!onVoiceInput) return null
  const recording = phase === 'recording'
  const transcribing = phase === 'transcribing'
  const label = recording
    ? 'Stop recording and transcribe into this field'
    : transcribing
      ? 'Transcribing voice input'
      : 'Dictate into this field'
  return (
    <button
      aria-label={label}
      className={`support-voice-button ${recording ? 'recording' : ''}`}
      disabled={!available || transcribing}
      onClick={() => onVoiceInput(onTranscript)}
      title={label}
      type="button"
    >
      {recording ? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect height="10" rx="1.5" width="10" x="7" y="7" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect height="11" rx="4" width="7" x="8.5" y="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3 0h6" />
        </svg>
      )}
    </button>
  )
}

function optionRows(
  values: SupportOption[] | undefined,
  fallback: SupportOption[],
): SupportOption[] {
  return values?.length ? values : fallback
}

function optionValue(option: SupportOption): string {
  return String(option.value ?? option.name ?? option.model ?? '')
}

function optionLabel(option: SupportOption): string {
  return String(option.label ?? option.name ?? option.model ?? option.value ?? '')
}

function CopyAction({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await writeClipboardText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_400)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      aria-label={label}
      className="support-copy-button"
      disabled={!text}
      onClick={() => void copy()}
      type="button"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function SupportSection({
  children,
  copyText = '',
  title,
}: {
  children: ReactNode
  copyText?: string
  title: string
}) {
  return (
    <section className="support-section">
      <div className="support-section-heading">
        <h3>{title}</h3>
        {copyText && <CopyAction label={`Copy ${title}`} text={copyText} />}
      </div>
      <div className="support-section-body">{children}</div>
    </section>
  )
}

function SupportTags({ row }: { row: SupportQueueThread }) {
  const tags: Array<[string, string]> = []
  if (row.waiting_on_operator) tags.push(['Operator', 'danger'])
  else if (row.waiting_on_support) tags.push(['Support', 'accent'])
  else tags.push(['Parked', 'muted'])
  if (row.pr_review_pending) tags.push(['PR review', 'accent'])
  if (row.merged_fix_candidate) tags.push(['Merged', 'success'])
  if (row.archive_gap) tags.push(['Gap', 'danger'])
  if (row.stale_open) tags.push(['Stale', 'muted'])
  return (
    <div className="support-tags">
      {tags.map(([label, tone]) => (
        <span className={`support-tag tone-${tone}`} key={label}>
          {label}
        </span>
      ))}
    </div>
  )
}

function SupportAttachmentView({
  attachment,
  transport,
}: {
  attachment: SupportAttachment
  transport: HermesTransport
}) {
  const path = attachment.media_path ?? ''
  const remote = safeExternalUrl(attachment.remote_url)
  const [payload, setPayload] = useState<{
    byte_size?: number
    data_url: string
    mime_type: string
    name: string
  } | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setLoading(true)
    setError('')
    void transport
      .requestJson<{
        byte_size?: number
        data_url: string
        mime_type: string
        name: string
      }>(supportOpsPath(`/media?path=${encodeURIComponent(path)}`), undefined, {
        timeoutMs: 30_000,
      })
      .then(result => {
        if (!cancelled) setPayload(result)
      })
      .catch(reason => {
        if (cancelled) return
        const message = reason instanceof Error ? reason.message : String(reason)
        if (/interruptedioexception|abort|cancel/i.test(message)) return
        setError(
          /413|too large|16 mib/i.test(message)
            ? 'This attachment is too large for inline mobile preview.'
            : 'Could not load this attachment from Support Ops.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt, path, transport])

  if (path) {
    const name = payload?.name || attachment.filename || previewName(path)
    const inferred = previewMediaInfo(name)
    const mimeType = payload?.mime_type || inferred?.mimeType || 'application/octet-stream'
    const kind: PreviewKind = inferred?.kind ||
      (mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : mimeType.startsWith('video/')
            ? 'video'
            : 'file')
    const download = async () => {
      if (!payload) return
      setDownloading(true)
      try {
        await saveDataUrl(payload.data_url, name, mimeType)
      } catch {
        setError('Could not save this Support Ops attachment.')
      } finally {
        setDownloading(false)
      }
    }
    return (
      <span className="markdown-media remote-media-attachment support-archive-attachment">
        <span className="remote-media-heading">
          <span className="remote-file-title">
            <small>{name}</small>
            <span>{mimeType}{payload?.byte_size ? ` · ${payload.byte_size.toLocaleString()} bytes` : ''}</span>
          </span>
          <button disabled={!payload || downloading} onClick={() => void download()} type="button">
            {downloading ? 'Saving…' : 'Download'}
          </button>
        </span>
        {loading && !payload && <span>Loading attachment…</span>}
        {kind === 'image' && payload && <ImagePreview alt={name} src={payload.data_url} />}
        {kind === 'audio' && payload && (
          <audio controls preload="metadata" src={payload.data_url}>
            This device cannot play this audio format.
          </audio>
        )}
        {kind === 'video' && payload && (
          <video controls playsInline preload="metadata" src={payload.data_url}>
            This device cannot play this video format.
          </video>
        )}
        {error && (
          <span className="remote-media-error">
            {error}{' '}
            <button onClick={() => setAttempt(value => value + 1)} type="button">Retry</button>
          </span>
        )}
      </span>
    )
  }
  if (remote) {
    return (
      <a className="support-remote-attachment" href={remote} rel="noreferrer" target="_blank">
        {attachment.filename || 'Open remote attachment'}
      </a>
    )
  }
  return (
    <small className="support-attachment-missing">
      {attachment.filename || 'Attachment'} ·{' '}
      {attachment.download_error || 'not available on this host'}
    </small>
  )
}

function TicketPanel({ ticket }: { ticket: Record<string, unknown> | null | undefined }) {
  if (!ticket) {
    return (
      <SupportSection title="Ticket">
        <p>No durable ticket linked.</p>
      </SupportSection>
    )
  }
  const sections =
    ticket.sections && typeof ticket.sections === 'object'
      ? (ticket.sections as Record<string, unknown>)
      : {}
  return (
    <SupportSection title={`Ticket · ${String(ticket.status ?? 'linked')}`}>
      <small>{String(ticket.ticket_id ?? ticket.path ?? 'Linked ticket')}</small>
      {Object.entries(sections).map(([name, value]) => {
        const text = normalizeSupportMarkdown(value)
        if (!text) return null
        return (
          <div className="support-ticket-section" key={name}>
            <div className="support-inline-heading">
              <strong>{name}</strong>
              <CopyAction label={`Copy ${name}`} text={text} />
            </div>
            <MarkdownContent>{text}</MarkdownContent>
          </div>
        )
      })}
    </SupportSection>
  )
}

function SettingsEditor({
  payload,
  busy,
  onSave,
  onVoiceInput,
  voicePhase = 'idle',
  voiceRecordingAvailable = false,
}: {
  payload: SupportSettingsPayload | null
  busy: boolean
  onSave: (settings: SupportSettings, scope: 'global' | 'thread') => Promise<void>
  onVoiceInput?: (target: (text: string) => void) => void
  voicePhase?: string
  voiceRecordingAvailable?: boolean
}) {
  const [value, setValue] = useState<SupportSettings>(payload?.settings ?? {})
  useEffect(() => setValue(payload?.settings ?? {}), [payload])
  if (!payload) return <p>Run settings are unavailable.</p>
  const options = payload.options ?? {}
  const patch = (next: Partial<SupportSettings>) =>
    setValue(current => ({ ...current, ...next }))
  const profiles = optionRows(options.profiles, [
    { name: 'default', label: 'default' },
  ])
  const models = options.models ?? []
  const selectedModel = value.model
    ? JSON.stringify([value.provider ?? '', value.model])
    : ''

  return (
    <div className="support-settings-grid">
      <label>
        <span>Workflow</span>
        <select
          value={value.workflow ?? 'suggest_reply'}
          onChange={event => patch({ workflow: event.target.value })}
        >
          {optionRows(options.workflows, [
            { value: 'investigate', label: 'Investigate' },
            { value: 'suggest_reply', label: 'Suggest response' },
            { value: 'investigate_ticket_reply', label: 'Investigate + ticket + response' },
          ]).map(option => (
            <option key={optionValue(option)} value={optionValue(option)}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Execution</span>
        <select
          value={value.execution_mode ?? 'direct'}
          onChange={event => patch({ execution_mode: event.target.value })}
        >
          {optionRows(options.execution_modes, [
            { value: 'direct', label: 'Main agent' },
            { value: 'delegated', label: 'Delegated worker' },
          ]).map(option => (
            <option key={optionValue(option)} value={optionValue(option)}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Program</span>
        <select
          value={value.program ?? 'hermes'}
          onChange={event => patch({ program: event.target.value })}
        >
          {optionRows(options.programs, [
            { value: 'hermes', label: 'Hermes' },
            { value: 'codex', label: 'Codex' },
          ]).map(option => (
            <option key={optionValue(option)} value={optionValue(option)}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </label>
      {value.program === 'codex' ? (
        <label>
          <span>Codex model</span>
          <input
            value={value.codex_model ?? ''}
            onChange={event => patch({ codex_model: event.target.value })}
            placeholder="Configured default"
          />
        </label>
      ) : (
        <>
          <label>
            <span>Hermes profile</span>
            <select
              value={value.profile ?? 'default'}
              onChange={event => patch({ profile: event.target.value })}
            >
              {profiles.map(option => (
                <option key={optionValue(option)} value={optionValue(option)}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Provider / model</span>
            <select
              value={selectedModel}
              onChange={event => {
                if (!event.target.value) {
                  patch({ provider: '', model: '' })
                  return
                }
                const [provider, model] = JSON.parse(event.target.value) as [string, string]
                patch({ provider, model })
              }}
            >
              <option value="">Hermes configured default</option>
              {models.map(option => {
                const provider = String(option.provider ?? '')
                const model = String(option.model ?? option.value ?? '')
                const encoded = JSON.stringify([provider, model])
                return (
                  <option key={encoded} value={encoded}>
                    {option.label || [provider, model].filter(Boolean).join(' · ') || model}
                  </option>
                )
              })}
            </select>
          </label>
        </>
      )}
      <label>
        <span>Reasoning</span>
        <select
          value={value.reasoning_effort ?? ''}
          onChange={event => patch({ reasoning_effort: event.target.value })}
        >
          {(options.reasoning_efforts ?? ['', 'low', 'medium', 'high']).map(item => (
            <option key={item || 'default'} value={item}>
              {item || 'Default'}
            </option>
          ))}
        </select>
      </label>
      <label className="support-check-row">
        <input
          checked={Boolean(value.include_agent_chat)}
          onChange={event => patch({ include_agent_chat: event.target.checked })}
          type="checkbox"
        />
        <span>Include recent operator/agent chat</span>
      </label>
      <label>
        <span>Recent chat exchanges</span>
        <input
          disabled={!value.include_agent_chat}
          max={50}
          min={0}
          type="number"
          value={value.agent_chat_turns ?? 6}
          onChange={event => patch({ agent_chat_turns: Number(event.target.value) })}
        />
      </label>
      <label className="support-wide-field">
        <span>Draft guidance</span>
        <span className="support-voice-field">
          <textarea
            rows={4}
            value={value.custom_instructions ?? ''}
            onChange={event => patch({ custom_instructions: event.target.value })}
            placeholder="Optional style, routing, or response constraints"
          />
          <VoiceInputButton
            available={voiceRecordingAvailable}
            onTranscript={text =>
              setValue(current => ({
                ...current,
                custom_instructions: appendSupportDictation(
                  current.custom_instructions ?? '',
                  text,
                ),
              }))
            }
            onVoiceInput={onVoiceInput}
            phase={voicePhase}
          />
        </span>
      </label>
      <div className="support-action-row support-wide-field">
        <button disabled={busy} onClick={() => void onSave(value, 'global')} type="button">
          Save as defaults
        </button>
        <button className="primary" disabled={busy} onClick={() => void onSave(value, 'thread')} type="button">
          Save for thread
        </button>
      </div>
    </div>
  )
}

function SuggestedResponse({
  busy,
  settings,
  threadId,
  workspace,
  mutate,
  onVoiceInput,
  voicePhase = 'idle',
  voiceRecordingAvailable = false,
}: {
  busy: boolean
  settings: SupportSettings
  threadId: string
  workspace: Record<string, unknown> | null | undefined
  mutate: (path: string, body: Record<string, unknown>, method?: 'POST' | 'PUT') => Promise<void>
  onVoiceInput?: (target: (text: string) => void) => void
  voicePhase?: string
  voiceRecordingAvailable?: boolean
}) {
  const current = String(workspace?.reply_draft ?? workspace?.draft ?? '')
  const draftId = String(workspace?.selected_reply_draft_id ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current)
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    setDraft(current)
    setEditing(false)
  }, [current, draftId])
  if (!current) {
    return (
      <SupportSection title="Suggested response">
        <p>No suggested response yet.</p>
      </SupportSection>
    )
  }
  return (
    <SupportSection copyText={draft} title="Suggested response">
      {editing ? (
        <div className="support-voice-field">
          <textarea rows={10} value={draft} onChange={event => setDraft(event.target.value)} />
          <VoiceInputButton
            available={voiceRecordingAvailable}
            onTranscript={text =>
              setDraft(current => appendSupportDictation(current, text))
            }
            onVoiceInput={onVoiceInput}
            phase={voicePhase}
          />
        </div>
      ) : (
        <MarkdownContent>{draft}</MarkdownContent>
      )}
      <div className="support-action-row">
        <button onClick={() => setEditing(value => !value)} type="button">
          {editing ? 'Preview Markdown' : 'Edit response'}
        </button>
        {draft !== current && (
          <button
            disabled={busy}
            onClick={() =>
              void mutate(
                `/threads/${threadId}/workspace`,
                { reply_draft: draft },
                'PUT',
              )
            }
            type="button"
          >
            Save edit
          </button>
        )}
      </div>
      <div className="support-feedback support-voice-field">
        <textarea
          placeholder="What should change on the next attempt?"
          rows={3}
          value={feedback}
          onChange={event => setFeedback(event.target.value)}
        />
        <VoiceInputButton
          available={voiceRecordingAvailable}
          onTranscript={text =>
            setFeedback(current => appendSupportDictation(current, text))
          }
          onVoiceInput={onVoiceInput}
          phase={voicePhase}
        />
      </div>
      <div className="support-action-row">
        <button
          disabled={busy || !feedback.trim()}
          onClick={() =>
            void mutate(`/threads/${threadId}/draft/reject`, {
              reply: current,
              draft_id: draftId,
              feedback,
              redraft: false,
            })
          }
          type="button"
        >
          Reject
        </button>
        <button
          className="primary"
          disabled={busy || !feedback.trim()}
          onClick={() =>
            void mutate(`/threads/${threadId}/draft/reject`, {
              reply: current,
              draft_id: draftId,
              feedback,
              redraft: true,
              settings,
            })
          }
          type="button"
        >
          Reject + redo
        </button>
      </div>
    </SupportSection>
  )
}

export function SupportOpsView({
  active,
  connected,
  connectionId,
  transport,
  onError,
  onNotice,
  onVoiceInput,
  voicePhase = 'idle',
  voiceRecordingAvailable = false,
}: SupportOpsViewProps) {
  const [queue, setQueue] = useState<SupportQueuePayload | null>(null)
  const [queueLoading, setQueueLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const [detail, setDetail] = useState<SupportThreadDetail | null>(null)
  const [settingsPayload, setSettingsPayload] = useState<SupportSettingsPayload | null>(null)
  const [jobs, setJobs] = useState<SupportJob[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SupportQueueFilter>('waiting_operator')
  const [busy, setBusy] = useState('')
  const [localError, setLocalError] = useState('')
  const [operatorNotes, setOperatorNotes] = useState('')
  const [sidechatMessage, setSidechatMessage] = useState('')
  const threadLoadRef = useRef<{
    promise: Promise<void>
    threadId: string
  } | null>(null)

  const fail = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (isExpectedTransportInterruption(message)) return
      setLocalError(message)
      onError?.(message)
    },
    [onError],
  )

  const loadQueue = useCallback(async () => {
    if (!connected || !transport) return
    setQueueLoading(true)
    try {
      const payload = await transport.requestJson<SupportQueuePayload>(
        supportOpsPath('/queue'),
        undefined,
        { timeoutMs: 30_000 },
      )
      setQueue(payload)
      setLocalError('')
    } catch (error) {
      fail(error)
    } finally {
      setQueueLoading(false)
    }
  }, [connected, fail, transport])

  const loadThread = useCallback(
    async (threadId: string, showLoading = false) => {
      if (!connected || !transport || !threadId) return
      if (showLoading) setDetailLoading(true)
      const existing = threadLoadRef.current
      if (existing) {
        await existing.promise
        if (existing.threadId === threadId || selectedIdRef.current !== threadId) {
          return
        }
      }
      const promise = (async () => {
        try {
          const [nextDetail, nextJobs] = await Promise.all([
            transport.requestJson<SupportThreadDetail>(
              supportOpsPath(`/threads/${threadId}`),
              undefined,
              { timeoutMs: 30_000 },
            ),
            transport.requestJson<{ jobs?: SupportJob[] }>(
              supportOpsPath(`/jobs?thread_id=${encodeURIComponent(threadId)}&limit=12`),
              undefined,
              { timeoutMs: 20_000 },
            ),
          ])
          if (selectedIdRef.current !== threadId) return
          setDetail(nextDetail)
          setJobs(nextJobs.jobs ?? [])
          if (showLoading) {
            setOperatorNotes(String(nextDetail.workspace?.operator_notes ?? ''))
          }
          setLocalError('')
        } catch (error) {
          fail(error)
        } finally {
          setDetailLoading(false)
        }
      })()
      threadLoadRef.current = { promise, threadId }
      try {
        await promise
      } finally {
        if (threadLoadRef.current?.promise === promise) {
          threadLoadRef.current = null
        }
      }
    },
    [connected, fail, transport],
  )

  const loadSettings = useCallback(
    async (threadId: string) => {
      if (!connected || !transport || !threadId) return
      try {
        const payload = await transport.requestJson<SupportSettingsPayload>(
          supportOpsPath(`/threads/${threadId}/settings`),
          undefined,
          { timeoutMs: 30_000 },
        )
        setSettingsPayload(payload)
      } catch (error) {
        fail(error)
      }
    },
    [connected, fail, transport],
  )

  useEffect(() => {
    setQueue(null)
    setSelectedId('')
    setDetail(null)
    setSettingsPayload(null)
    setJobs([])
    setLocalError('')
  }, [connectionId])

  useEffect(() => {
    if (!active || !connected || !transport) return
    void loadQueue()
    const timer = window.setInterval(() => void loadQueue(), 30_000)
    return () => window.clearInterval(timer)
  }, [active, connected, loadQueue, transport])

  useEffect(() => {
    setDetail(null)
    setSettingsPayload(null)
    setJobs([])
  }, [selectedId])

  useEffect(() => {
    if (!active || !connected || !selectedId) return
    void Promise.all([
      loadThread(selectedId, true),
      loadSettings(selectedId),
    ])
    const timer = window.setInterval(() => void loadThread(selectedId), 12_000)
    return () => window.clearInterval(timer)
  }, [active, connected, loadSettings, loadThread, selectedId])

  const rows = useMemo(
    () => filterSupportThreads(queue?.threads ?? [], query, filter),
    [filter, query, queue?.threads],
  )
  const summary = queue?.summary ?? {}
  const settings = settingsPayload?.settings ?? {}
  const activeJob = jobs.find(job => ['queued', 'running'].includes(job.status ?? ''))
  const attachmentsByMessage = useMemo(() => {
    const result = new Map<string, SupportAttachment[]>()
    for (const attachment of detail?.attachments ?? []) {
      const messageId = String(attachment.message_id ?? '')
      if (!messageId) continue
      result.set(messageId, [...(result.get(messageId) ?? []), attachment])
    }
    return result
  }, [detail?.attachments])

  const mutate = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      method: 'POST' | 'PUT' = 'POST',
      label = 'Updating Support Ops',
    ) => {
      if (!connected || !transport || !selectedId) return
      setBusy(label)
      setLocalError('')
      try {
        await transport.requestJson(supportOpsPath(path), body, {
          method,
          timeoutMs: 30_000,
        })
        await Promise.all([
          loadThread(selectedId),
          loadSettings(selectedId),
          loadQueue(),
        ])
        onNotice?.(`${label} started`)
      } catch (error) {
        fail(error)
      } finally {
        setBusy('')
      }
    },
    [
      fail,
      connected,
      loadQueue,
      loadSettings,
      loadThread,
      onNotice,
      selectedId,
      transport,
    ],
  )

  const quickAction = useCallback(
    async (row: SupportQueueThread, action: 'sync' | 'ticket') => {
      if (!connected || !transport) return
      setBusy(`${action}:${row.thread_id}`)
      setLocalError('')
      try {
        await transport.requestJson(
          supportOpsPath(
            `/threads/${row.thread_id}/${action === 'sync' ? 'sync' : 'ticket'}`,
          ),
          action === 'sync'
            ? {}
            : row.has_ticket
              ? { sync_workspace: true }
              : { area: 'support', status: 'needs-investigation' },
          {
            method: action === 'sync' ? 'POST' : 'PUT',
            timeoutMs: 30_000,
          },
        )
        await loadQueue()
        onNotice?.(
          action === 'sync'
            ? 'Thread sync started'
            : row.has_ticket
              ? 'Ticket update started'
              : 'Ticket generated',
        )
      } catch (error) {
        fail(error)
      } finally {
        setBusy('')
      }
    },
    [connected, fail, loadQueue, onNotice, transport],
  )

  if (!transport) {
    return (
      <div className="support-ops-screen support-empty-state">
        <h1>Support Ops</h1>
        <p>Connect to a Hermes host with the Support Ops plugin installed.</p>
      </div>
    )
  }

  if (!connected && !queue && !detail) {
    return (
      <div className="support-ops-screen support-empty-state">
        <h1>Support Ops</h1>
        <p>Reconnecting to the selected host. Your Support Ops view will return automatically.</p>
      </div>
    )
  }

  if (selectedId) {
    const mentionNames = detail?.mention_names ?? {}
    const workspace = detail?.workspace
    const discordUrl = safeExternalUrl(detail?.discord_url)
    return (
      <div className="support-ops-screen support-detail-screen">
        {!connected && (
          <div className="support-connection-banner">Reconnecting · showing cached Support Ops data</div>
        )}
        <header className="support-page-heading support-detail-heading">
          <button className="support-back-button" onClick={() => setSelectedId('')} type="button">
            ← Queue
          </button>
          <div>
            <p className="eyebrow">Support thread</p>
            <h1>{plainSupportTitle(detail?.title) || selectedId}</h1>
            <small>{selectedId} · {detail?.message_count ?? 0} messages</small>
          </div>
          <div className="support-heading-actions">
            {discordUrl && (
              <a href={discordUrl} rel="noreferrer" target="_blank">Discord</a>
            )}
            <button disabled={!connected || detailLoading} onClick={() => void loadThread(selectedId, true)} type="button">
              {detailLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </header>

        {localError && <div className="support-inline-error">{localError}</div>}
        {detail?.detail_warning && <div className="support-inline-warning">{detail.detail_warning}</div>}
        {detailLoading && !detail ? (
          <div className="support-loading">Loading thread…</div>
        ) : (
          <div className="support-detail-content">
            <SupportSection title="Operator actions">
              {detail?.detail_pending && (
                <p className="support-muted">
                  Detailed context is catching up. Sync before running an agent workflow.
                </p>
              )}
              <div className="support-voice-field">
                <textarea
                  disabled={!connected || detail?.detail_pending}
                  placeholder="Operator notes or constraints"
                  rows={4}
                  value={operatorNotes}
                  onChange={event => setOperatorNotes(event.target.value)}
                />
                <VoiceInputButton
                  available={voiceRecordingAvailable}
                  onTranscript={text =>
                    setOperatorNotes(current =>
                      appendSupportDictation(current, text),
                    )
                  }
                  onVoiceInput={onVoiceInput}
                  phase={voicePhase}
                />
              </div>
              <div className="support-action-row">
                <button
                  className="primary"
                  disabled={Boolean(!connected || busy || activeJob || detail?.detail_pending)}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/runs`,
                      {
                        action: settings.workflow ?? 'suggest_reply',
                        operator_notes: operatorNotes,
                        settings,
                      },
                      'POST',
                      'Workflow',
                    )
                  }
                  type="button"
                >
                  {busy === 'Workflow' ? 'Starting…' : 'Run workflow'}
                </button>
                <button
                  disabled={Boolean(!connected || busy || activeJob || detail?.detail_pending)}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/runs`,
                      { action: 'investigate', operator_notes: operatorNotes, settings },
                      'POST',
                      'Investigation',
                    )
                  }
                  type="button"
                >
                  Investigate
                </button>
                <button
                  disabled={Boolean(!connected || busy || activeJob || detail?.detail_pending)}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/runs`,
                      { action: 'suggest_reply', operator_notes: operatorNotes, settings },
                      'POST',
                      'Response draft',
                    )
                  }
                  type="button"
                >
                  Suggest response
                </button>
                <button
                  disabled={Boolean(!connected || busy || activeJob)}
                  onClick={() =>
                    void mutate(`/threads/${selectedId}/sync`, {}, 'POST', 'Thread sync')
                  }
                  type="button"
                >
                  Sync thread
                </button>
                <button
                  disabled={Boolean(!connected || busy || detail?.detail_pending)}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/ticket`,
                      detail?.ticket
                        ? { sync_workspace: true }
                        : { area: 'support', status: 'needs-investigation' },
                      'PUT',
                      detail?.ticket ? 'Ticket sync' : 'Ticket generation',
                    )
                  }
                  type="button"
                >
                  {detail?.ticket ? 'Update ticket' : 'Generate ticket'}
                </button>
              </div>
              {activeJob && (
                <div className="support-active-job">
                  <span>{activeJob.kind || 'Support job'} · {activeJob.status}</span>
                  <button
                    disabled={Boolean(!connected || busy)}
                    onClick={() =>
                      void mutate(`/jobs/${activeJob.id}/cancel`, {}, 'POST', 'Job cancellation')
                    }
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </SupportSection>

            <details className="support-disclosure">
              <summary>Thread run settings</summary>
              <SettingsEditor
                busy={Boolean(!connected || busy)}
                payload={settingsPayload}
                onVoiceInput={onVoiceInput}
                voicePhase={voicePhase}
                voiceRecordingAvailable={voiceRecordingAvailable}
                onSave={async (next, scope) => {
                  await mutate(
                    scope === 'global' ? '/settings' : `/threads/${selectedId}/settings`,
                    next as Record<string, unknown>,
                    'PUT',
                    scope === 'global' ? 'Default settings' : 'Thread settings',
                  )
                }}
              />
            </details>

            <SupportSection title="Thread sidechat">
              <p className="support-muted">
                Private operator conversation for this thread. It never posts to Discord.
              </p>
              {(detail?.agent_chat?.messages ?? []).slice(-8).map((message, index) => {
                const content = normalizeSupportMarkdown(message.content)
                return (
                  <article className="support-sidechat-message" key={String(message.id ?? index)}>
                    <div className="support-inline-heading">
                      <strong>{message.role === 'assistant' ? 'Agent' : 'You'}</strong>
                      <CopyAction label="Copy sidechat message" text={content} />
                    </div>
                    <MarkdownContent>{content}</MarkdownContent>
                  </article>
                )
              })}
              <div className="support-voice-field">
                <textarea
                  disabled={Boolean(!connected || busy || activeJob || detail?.detail_pending)}
                  placeholder="Ask about this thread, ticket, evidence, or next action…"
                  rows={4}
                  value={sidechatMessage}
                  onChange={event => setSidechatMessage(event.target.value)}
                />
                <VoiceInputButton
                  available={voiceRecordingAvailable}
                  onTranscript={text =>
                    setSidechatMessage(current =>
                      appendSupportDictation(current, text),
                    )
                  }
                  onVoiceInput={onVoiceInput}
                  phase={voicePhase}
                />
              </div>
              <button
                className="primary support-send-agent"
                disabled={Boolean(!connected || busy || activeJob || !sidechatMessage.trim())}
                onClick={() => {
                  const message = sidechatMessage.trim()
                  setSidechatMessage('')
                  void mutate(
                    `/threads/${selectedId}/agent-chat`,
                    { message, settings },
                    'POST',
                    'Agent sidechat',
                  )
                }}
                type="button"
              >
                Ask agent
              </button>
            </SupportSection>

            <TicketPanel ticket={detail?.ticket} />

            <SuggestedResponse
              busy={Boolean(!connected || busy)}
              mutate={mutate}
              onVoiceInput={onVoiceInput}
              settings={settings}
              threadId={selectedId}
              voicePhase={voicePhase}
              voiceRecordingAvailable={voiceRecordingAvailable}
              workspace={workspace}
            />

            {workspace && ['investigation', 'operator_notes'].map(key => {
              const text = normalizeSupportMarkdown(workspace[key])
              if (!text) return null
              return (
                <SupportSection
                  copyText={text}
                  key={key}
                  title={key === 'investigation' ? 'Workspace investigation' : 'Operator notes'}
                >
                  <MarkdownContent>{text}</MarkdownContent>
                </SupportSection>
              )
            })}

            <SupportSection title="Discord transcript">
              {detail?.messages?.length ? (
                detail.messages.map((message, index) => {
                  const text = normalizeSupportMarkdown(message.body, mentionNames)
                  const messageId = String(message.message_id ?? '')
                  return (
                    <article
                      className={`support-message ${message.is_operator ? 'operator' : ''}`}
                      id={messageId ? `support-message-${messageId}` : undefined}
                      key={messageId || `${message.timestamp}-${index}`}
                    >
                      <div className="support-message-meta">
                        <strong>{message.author || 'Unknown'}</strong>
                        <span>
                          {formatTime(message.timestamp)}
                          <CopyAction label="Copy Discord message" text={text} />
                        </span>
                      </div>
                      <MarkdownContent>{text}</MarkdownContent>
                      {(attachmentsByMessage.get(messageId) ?? []).map((attachment, attachmentIndex) => (
                        <SupportAttachmentView
                          attachment={attachment}
                          key={`${attachment.filename}-${attachmentIndex}`}
                          transport={transport}
                        />
                      ))}
                    </article>
                  )
                })
              ) : (
                <p>{detail?.detail_message || 'No transcript messages available.'}</p>
              )}
            </SupportSection>

            {jobs.length > 0 && (
              <SupportSection title="Run history">
                {jobs.slice(0, 12).map(job => (
                  <article className="support-job-row" key={job.id}>
                    <div className="support-inline-heading">
                      <strong>{job.kind || 'Support job'}</strong>
                      <span>{job.status || 'unknown'}</span>
                    </div>
                    {job.message && <p>{job.message}</p>}
                    {job.activity_log?.length ? (
                      <pre>{job.activity_log.slice(-3).map(item =>
                        typeof item === 'string'
                          ? item
                          : JSON.stringify(item),
                      ).join('\n')}</pre>
                    ) : null}
                  </article>
                ))}
              </SupportSection>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="support-ops-screen support-queue-screen">
      {!connected && (
        <div className="support-connection-banner">Reconnecting · showing cached Support Ops data</div>
      )}
      <header className="support-page-heading">
        <div>
          <p className="eyebrow">Host plugin</p>
          <h1>Support Ops</h1>
          <small>No automatic Discord posting</small>
        </div>
        <button disabled={!connected || queueLoading} onClick={() => void loadQueue()} type="button">
          {queueLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {localError && <div className="support-inline-error">{localError}</div>}
      <div className="support-metrics" aria-label="Support queue counts">
        {[
          ['all', 'Open', summary.open],
          ['waiting_operator', 'Operator', summary.waiting_on_operator],
          ['waiting_support', 'Support', summary.waiting_on_support],
          ['pr_review', 'PR review', summary.pr_review_pending],
          ['stale', 'Stale', summary.stale],
        ].map(([value, label, count]) => (
          <button
            aria-pressed={filter === value}
            className={filter === value ? 'active' : ''}
            key={String(value)}
            onClick={() => setFilter(value as SupportQueueFilter)}
            type="button"
          >
            <span>{label}</span>
            <strong>{Number(count ?? 0)}</strong>
          </button>
        ))}
      </div>
      <div className="support-queue-tools">
        <input
          aria-label="Search support threads"
          placeholder="Search title, ID, participant…"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <select
          aria-label="Filter support queue"
          value={filter}
          onChange={event => setFilter(event.target.value as SupportQueueFilter)}
        >
          {FILTERS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="support-queue-count">{rows.length}/{summary.open ?? 0} open threads</div>
      {queueLoading && !queue ? (
        <div className="support-loading">Loading support queue…</div>
      ) : rows.length ? (
        <div className="support-thread-list">
          {rows.map(row => (
            <article className="support-thread-card" key={row.thread_id}>
              <button className="support-thread-open" onClick={() => setSelectedId(row.thread_id)} type="button">
                <strong>{plainSupportTitle(row.title) || row.thread_id}</strong>
                <span>
                  {row.topic_label || 'Unclassified'}
                  {compactAge(row.hours_since_last_message) && ` · ${compactAge(row.hours_since_last_message)}`}
                </span>
                <SupportTags row={row} />
              </button>
              <div className="support-thread-actions">
                <button
                  disabled={Boolean(!connected || busy)}
                  onClick={() => void quickAction(row, 'sync')}
                  type="button"
                >
                  {busy === `sync:${row.thread_id}` ? 'Starting…' : 'Sync'}
                </button>
                <button
                  disabled={Boolean(!connected || busy)}
                  onClick={() => void quickAction(row, 'ticket')}
                  type="button"
                >
                  {busy === `ticket:${row.thread_id}`
                    ? 'Saving…'
                    : row.has_ticket
                      ? 'Update ticket'
                      : 'Create ticket'}
                </button>
                <button onClick={() => setSelectedId(row.thread_id)} type="button">Open</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="support-empty-state">
          <h2>No matching threads</h2>
          <p>Change the filter or clear the search.</p>
        </div>
      )}
    </div>
  )
}
