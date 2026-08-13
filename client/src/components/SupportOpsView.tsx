import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { writeClipboardText } from '../clipboard'
import { markdownToSpeechText } from '../markdown'
import {
  previewMediaInfo,
  previewName,
  type PreviewDocument,
  type PreviewKind,
} from '../preview'
import { saveBlob, saveDataUrl } from '../save-data'
import {
  filterSupportThreads,
  isOmittedSupportParticipant,
  normalizeSupportPlaybackSpeed,
  normalizeSupportMarkdown,
  parseSupportSetupLines,
  parseSupportVoicePresetLines,
  plainSupportTitle,
  supportHandoffFilename,
  supportHandoffMarkdown,
  supportInvestigationPrompt,
  supportOpsPath,
  supportOpsTargetedSyncAvailable,
  supportSetupLines,
  supportVisibleParticipants,
  supportVoicePresetLines,
  type SupportAttachment,
  type SupportJob,
  type SupportOperatorConfig,
  type SupportOperatorConfigPayload,
  type SupportOpsHealth,
  type SupportOption,
  type SupportQueueFilter,
  type SupportQueuePayload,
  type SupportQueueThread,
  type SupportSettings,
  type SupportSettingsPayload,
  type SupportStatsPayload,
  type SupportThreadDetail,
} from '../support-ops'
import { ttsOverride, type VoiceChoice } from '../reader'
import type { HermesTransport } from '../transport/hermes-transport'
import type {
  SpeechSequenceItem,
  SpeechSequenceOptions,
} from '../voice'
import { ImagePreview } from './ImageViewer'
import { MarkdownContent } from './MarkdownContent'
import { useVoiceCatalog } from './useVoiceCatalog'

interface SupportOpsViewProps {
  active: boolean
  connected: boolean
  connectionId: string
  transport: HermesTransport | null
  onError?: (message: string) => void
  onNotice?: (message: string) => void
  onOpenDocumentPreviewer?: (document: PreviewDocument) => void
  onOpenDocumentReader?: (document: PreviewDocument) => void
  onStartSession?: (prompt: string) => Promise<void>
  onStartVoiceSession?: (prompt: string) => Promise<void>
  onSpeak?: (
    items: SpeechSequenceItem[],
    options?: SpeechSequenceOptions,
  ) => Promise<void>
  onStopSpeech?: () => void
  activeSpeechId?: string
  onVoiceInput?: (target: (text: string) => void) => void
  voicePhase?: string
  voiceRecordingAvailable?: boolean
}

function SupportOverview({
  queue,
  stats,
}: {
  queue: SupportQueuePayload | null
  stats: SupportStatsPayload | null
}) {
  if (!stats) {
    return (
      <div className="support-empty-state">
        <h2>No history metrics yet</h2>
        <p>This host did not return the generated Support Ops statistics.</p>
      </div>
    )
  }
  const totals = stats.totals ?? {}
  const chartRows = (stats.daily ?? []).slice(-30)
  const chartMaximum = Math.max(
    1,
    ...chartRows.flatMap(row => [
      Number(row.opened ?? 0),
      Number(row.closed ?? 0),
      Number(row.cumulative_open ?? 0),
    ]),
  )
  const daily = (stats.daily ?? []).slice(-14).reverse()
  const buckets = stats.buckets ?? stats.topic_buckets ?? []
  const health = stats.classification_health ?? {}
  const queueOpen = Number(queue?.summary?.open ?? 0)
  const historyOpen = Number(totals.open_now ?? 0)
  return (
    <div className="support-overview">
      {queue && queueOpen !== historyOpen && (
        <div className="support-inline-warning">
          Queue and history are separate snapshots: queue {queueOpen}, history{' '}
          {historyOpen}.
        </div>
      )}
      <div className="support-history-metrics">
        {[
          ['All threads', totals.all_threads],
          ['Open now', totals.open_now],
          ['Closed', totals.closed],
          ['Opened 7 days', totals.opened_last_7_days],
          ['Closed 7 days', totals.closed_last_7_days],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <span>{label}</span>
            <strong>{Number(value ?? 0)}</strong>
          </article>
        ))}
      </div>
      {chartRows.length > 0 && (
        <section className="support-flow-chart">
          <div className="support-flow-heading">
            <h2>Daily support flow · last 30 days</h2>
            <div>
              <span className="opened">Opened</span>
              <span className="closed">Closed</span>
              <span className="total">Open total</span>
            </div>
          </div>
          <div className="support-flow-scroll">
            <div
              aria-label="Daily opened, closed, and cumulative open support threads"
              className="support-flow-bars"
              role="img"
            >
              {chartRows.map(day => {
                const height = (value: unknown) =>
                  `${Math.max(Number(value) > 0 ? 3 : 0, Math.round((Number(value ?? 0) / chartMaximum) * 88))}px`
                return (
                  <div
                    className="support-flow-day"
                    key={day.date}
                    title={`${day.date}: ${day.opened ?? 0} opened, ${day.closed ?? 0} closed, ${day.cumulative_open ?? 0} open total`}
                  >
                    <div>
                      <i className="opened" style={{ height: height(day.opened) }} />
                      <i className="closed" style={{ height: height(day.closed) }} />
                      <i
                        className="total"
                        style={{ height: height(day.cumulative_open) }}
                      />
                    </div>
                    <span>{String(day.date ?? '').slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
      <div className="support-overview-grid">
        <section>
          <h2>Recent flow</h2>
          {daily.map((day) => {
            const net =
              day.net ?? Number(day.opened ?? 0) - Number(day.closed ?? 0)
            return (
              <div className="support-stat-row flow" key={day.date}>
                <span>{day.date}</span>
                <span>+{day.opened ?? 0}</span>
                <span>-{day.closed ?? 0}</span>
                <strong className={Number(net) > 0 ? 'danger' : 'success'}>
                  net {Number(net) > 0 ? '+' : ''}
                  {net}
                </strong>
              </div>
            )
          })}
        </section>
        <section>
          <h2>Open by topic</h2>
          {buckets.map((bucket) => (
            <div
              className="support-stat-row topic"
              key={bucket.bucket || bucket.label}
            >
              <span>{bucket.label || bucket.bucket || 'Unclassified'}</span>
              <strong>{bucket.open_now ?? bucket.open ?? 0} open</strong>
              <span>{bucket.total_threads ?? bucket.total ?? 0} total</span>
            </div>
          ))}
        </section>
      </div>
      <section className="support-artifact-health">
        <h2>Artifact health</h2>
        <div>
          <span>{health.unclassified ?? 0} unclassified</span>
          <span>{health.general_support ?? 0} general support</span>
          <span>{health.archive_integrity?.archive_gap ?? 0} archive gaps</span>
          <span>{stats.issue_clusters?.cluster_count ?? 0} issue clusters</span>
        </div>
        <small>
          History generated{' '}
          {stats.generated_at
            ? formatTime(stats.generated_at)
            : 'at an unknown time'}
          .
        </small>
      </section>
    </div>
  )
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
  return String(
    option.label ?? option.name ?? option.model ?? option.value ?? '',
  )
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
  headingActions,
  title,
}: {
  children: ReactNode
  copyText?: string
  headingActions?: ReactNode
  title: string
}) {
  return (
    <section className="support-section">
      <div className="support-section-heading">
        <h3>{title}</h3>
        {(headingActions || copyText) && (
          <div className="support-section-actions">
            {headingActions}
            {copyText && <CopyAction label={`Copy ${title}`} text={copyText} />}
          </div>
        )}
      </div>
      <div className="support-section-body">{children}</div>
    </section>
  )
}

function SupportTags({
  operatorName,
  row,
}: {
  operatorName?: string
  row: SupportQueueThread
}) {
  const tags: Array<[string, string]> = []
  if (row.waiting_on_operator)
    tags.push([operatorName?.trim() || 'Operator', 'danger'])
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

function supportSpeechConfig(
  playbackVoice: SupportOperatorConfig['playback_voice'],
  choice?: VoiceChoice,
): Record<string, unknown> | undefined {
  const provider = choice?.provider ?? playbackVoice?.provider ?? ''
  const voice = choice?.voice ?? playbackVoice?.voice ?? ''
  const speed = normalizeSupportPlaybackSpeed(playbackVoice?.speed)
  return ttsOverride(
    { provider, voice, speed },
    { xaiAutoSpeechTags: true },
  )
}

function SupportSpeakButton({
  activeSpeechId,
  config,
  id,
  label = 'Listen',
  onSpeak,
  onStop,
  text,
}: {
  activeSpeechId?: string
  config?: SupportOperatorConfig['playback_voice']
  id: string
  label?: string
  onSpeak?: SupportOpsViewProps['onSpeak']
  onStop?: () => void
  text: string
}) {
  const spoken = markdownToSpeechText(text)
  if (!onSpeak || !spoken) return null
  const active = activeSpeechId === id
  return (
    <button
      aria-label={active ? `Stop ${label.toLowerCase()}` : label}
      className="support-copy-button"
      onClick={() => {
        if (active) {
          onStop?.()
          return
        }
        void onSpeak(
          [{ id, text: spoken, ttsConfig: supportSpeechConfig(config) }],
          { speechId: id },
        )
      }}
      type="button"
    >
      {active ? 'Stop' : label}
    </button>
  )
}

interface SupportSetupDraft {
  operator_name: string
  support_members: string
  developer_members: string
  categories: string
  voice_presets: string
  playback_voice: { provider: string; voice: string; speed: number }
  backup_directory: string
}

export function supportSetupDraft(
  config?: SupportOperatorConfig,
): SupportSetupDraft {
  return {
    operator_name: String(config?.operator_name || 'Operator'),
    support_members: supportSetupLines(config?.support_members),
    developer_members: supportSetupLines(config?.developer_members),
    categories: supportSetupLines(config?.categories),
    voice_presets: supportVoicePresetLines(config?.voice_presets),
    playback_voice: {
      provider: String(config?.playback_voice?.provider || ''),
      voice: String(config?.playback_voice?.voice || ''),
      speed: normalizeSupportPlaybackSpeed(config?.playback_voice?.speed),
    },
    backup_directory: String(config?.backup_directory || ''),
  }
}

export function supportSetupPayload(
  draft: SupportSetupDraft,
): SupportOperatorConfig {
  const supportMembers = parseSupportSetupLines(draft.support_members)
  const developerMembers = parseSupportSetupLines(draft.developer_members)
  return {
    operator_name: draft.operator_name.trim(),
    team_members: [...new Set([...supportMembers, ...developerMembers])],
    support_members: supportMembers,
    developer_members: developerMembers,
    categories: parseSupportSetupLines(draft.categories),
    voice_presets: parseSupportVoicePresetLines(draft.voice_presets),
    playback_voice: {
      provider: draft.playback_voice.provider.trim(),
      voice: draft.playback_voice.voice.trim(),
      speed: normalizeSupportPlaybackSpeed(draft.playback_voice.speed),
    },
    backup_directory: draft.backup_directory.trim(),
  }
}

function SupportVoiceFields({
  choices,
  value,
  onChange,
}: {
  choices: VoiceChoice[]
  value: SupportSetupDraft['playback_voice']
  onChange: (value: SupportSetupDraft['playback_voice']) => void
}) {
  const providers = [...new Set(choices.map(choice => choice.provider))]
  const voices = choices.filter(choice => choice.provider === value.provider)
  return (
    <div className="support-voice-selectors">
      <select
        aria-label="Support read-aloud provider"
        value={value.provider}
        onChange={event => {
          const provider = event.target.value
          const first = choices.find(choice => choice.provider === provider)
          onChange({ ...value, provider, voice: first?.voice ?? '' })
        }}
      >
        <option value="">Main voice default</option>
        {providers.map(provider => (
          <option key={provider} value={provider}>
            {provider}
          </option>
        ))}
      </select>
      <select
        aria-label="Support read-aloud voice"
        disabled={!value.provider || voices.length === 0}
        value={value.voice}
        onChange={event => onChange({ ...value, voice: event.target.value })}
      >
        <option value="">Provider default</option>
        {voices.map(choice => (
          <option key={`${choice.provider}:${choice.voice}`} value={choice.voice}>
            {choice.label}
          </option>
        ))}
      </select>
      <label className="support-speed-field">
        <span>Speed {value.speed.toFixed(2)}×</span>
        <input
          max="2"
          min="0.5"
          step="0.05"
          type="range"
          value={value.speed}
          onChange={event =>
            onChange({ ...value, speed: Number(event.target.value) })
          }
        />
      </label>
    </div>
  )
}

function SupportSetupPanel({
  busy,
  choices,
  config,
  onBackup,
  onExport,
  onImport,
  onImportError,
  onSave,
}: {
  busy: string
  choices: VoiceChoice[]
  config: SupportOperatorConfig | null
  onBackup: () => Promise<void>
  onExport: () => Promise<void>
  onImport: (value: unknown) => Promise<void>
  onImportError: (error: unknown) => void
  onSave: (value: SupportOperatorConfig) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => supportSetupDraft(config ?? undefined))
  const importRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => setDraft(supportSetupDraft(config ?? undefined)), [config])
  const field = (
    label: string,
    description: string,
    control: ReactNode,
  ) => (
    <label className="support-setup-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {control}
    </label>
  )
  return (
    <details className="support-disclosure support-setup-panel">
      <summary>Setup and portability</summary>
      <p className="support-muted">
        Portable plugin state excludes credentials and Discord posting authority.
      </p>
      <div className="support-setup-grid">
        {field(
          'Your display name',
          'Used when Support Ops identifies the specific operator.',
          <input
            value={draft.operator_name}
            onChange={event =>
              setDraft(current => ({
                ...current,
                operator_name: event.target.value,
              }))
            }
          />,
        )}
        {field(
          'Support members',
          'One Discord author alias per line.',
          <textarea
            rows={4}
            value={draft.support_members}
            onChange={event =>
              setDraft(current => ({
                ...current,
                support_members: event.target.value,
              }))
            }
          />,
        )}
        {field(
          'Developers',
          'Aliases assignable from PR mentions, one per line.',
          <textarea
            rows={4}
            value={draft.developer_members}
            onChange={event =>
              setDraft(current => ({
                ...current,
                developer_members: event.target.value,
              }))
            }
          />,
        )}
        {field(
          'Categories',
          'Editable support topic labels, one per line.',
          <textarea
            rows={4}
            value={draft.categories}
            onChange={event =>
              setDraft(current => ({
                ...current,
                categories: event.target.value,
              }))
            }
          />,
        )}
        {field(
          'Read-aloud voice',
          'Uses the connected host voice catalog and applies to Listen.',
          <SupportVoiceFields
            choices={choices}
            value={draft.playback_voice}
            onChange={playback_voice =>
              setDraft(current => ({ ...current, playback_voice }))
            }
          />,
        )}
        {field(
          'Voice presets',
          'Optional participant mappings: label | provider | voice | model.',
          <textarea
            rows={4}
            value={draft.voice_presets}
            onChange={event =>
              setDraft(current => ({
                ...current,
                voice_presets: event.target.value,
              }))
            }
          />,
        )}
        {field(
          'Backup directory',
          'Absolute directory on the connected host; it must already exist.',
          <input
            placeholder="C:\\Backups\\HermesSupport"
            value={draft.backup_directory}
            onChange={event =>
              setDraft(current => ({
                ...current,
                backup_directory: event.target.value,
              }))
            }
          />,
        )}
      </div>
      <input
        ref={importRef}
        accept="application/json,.json"
        hidden
        type="file"
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          void (async () => {
            try {
              await onImport(JSON.parse(await file.text()))
            } catch (error) {
              onImportError(error)
            }
          })()
        }}
      />
      <div className="support-action-row">
        <button disabled={Boolean(busy)} onClick={() => void onExport()} type="button">
          {busy === 'Export setup' ? 'Exporting…' : 'Export'}
        </button>
        <button disabled={Boolean(busy)} onClick={() => importRef.current?.click()} type="button">
          {busy === 'Import setup' ? 'Importing…' : 'Import'}
        </button>
        <button disabled={Boolean(busy)} onClick={() => void onBackup()} type="button">
          {busy === 'Backup setup' ? 'Backing up…' : 'Back up now'}
        </button>
        <button
          className="primary"
          disabled={Boolean(busy)}
          onClick={() => void onSave(supportSetupPayload(draft))}
          type="button"
        >
          {busy === 'Save setup' ? 'Saving…' : 'Save setup'}
        </button>
      </div>
    </details>
  )
}

function SupportThreadReader({
  activeSpeechId,
  choices,
  config,
  detail,
  onSpeak,
  onStop,
}: {
  activeSpeechId?: string
  choices: VoiceChoice[]
  config: SupportOperatorConfig | null
  detail: SupportThreadDetail
  onSpeak?: SupportOpsViewProps['onSpeak']
  onStop?: () => void
}) {
  const participants = supportVisibleParticipants(
    detail.messages?.map(message => message.author),
  )
  const participantKey = participants.join('\u0000')
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  useEffect(() => {
    const presets = config?.voice_presets ?? []
    setAssignments(current =>
      Object.fromEntries(
        participants.map(participant => {
          const preset = presets.find(
            row => row.label?.trim().toLowerCase() === participant.toLowerCase(),
          )
          return [
            participant,
            current[participant] ??
              (preset?.provider || preset?.voice
                ? `${preset.provider ?? ''}:${preset.voice ?? ''}`
                : ''),
          ]
        }),
      ),
    )
  }, [config, detail.thread_id, participantKey])
  if (!onSpeak || !detail.messages?.length) return null
  const active = activeSpeechId === 'support-thread-reader'
  return (
    <details className="support-disclosure support-thread-reader">
      <summary>Read thread</summary>
      <p className="support-muted">
        Assign a connected-host voice per participant, then play the full transcript in order.
      </p>
      <div className="support-reader-assignments">
        {participants.map(participant => (
          <label key={participant}>
            <span>{participant}</span>
            <select
              value={assignments[participant] ?? ''}
              onChange={event =>
                setAssignments(current => ({
                  ...current,
                  [participant]: event.target.value,
                }))
              }
            >
              <option value="">Support default</option>
              {choices.map(choice => (
                <option
                  key={`${choice.provider}:${choice.voice}`}
                  value={`${choice.provider}:${choice.voice}`}
                >
                  {choice.provider} · {choice.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        className="primary"
        onClick={() => {
          if (active) {
            onStop?.()
            return
          }
          const items = (detail.messages ?? [])
            .filter(message => !isOmittedSupportParticipant(message.author))
            .map((message, index) => {
              const author = String(message.author || 'Unknown')
              const selected = assignments[author] ?? ''
              const choice = choices.find(
                row => `${row.provider}:${row.voice}` === selected,
              )
              return {
                id: `support-thread-${message.message_id ?? index}`,
                text: `${author}. ${markdownToSpeechText(
                  normalizeSupportMarkdown(message.body, detail.mention_names),
                )}`,
                ttsConfig: supportSpeechConfig(config?.playback_voice, choice),
              }
            })
            .filter(item => item.text.trim())
          void onSpeak(items, {
            speechId: 'support-thread-reader',
            bufferAhead: 3,
            maxConcurrentSynthesis: 2,
          })
        }}
        type="button"
      >
        {active ? 'Stop thread' : 'Play full thread'}
      </button>
    </details>
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
      .then((result) => {
        if (!cancelled) setPayload(result)
      })
      .catch((reason) => {
        if (cancelled) return
        const message =
          reason instanceof Error ? reason.message : String(reason)
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
    const mimeType =
      payload?.mime_type || inferred?.mimeType || 'application/octet-stream'
    const kind: PreviewKind =
      inferred?.kind ||
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
            <span>
              {mimeType}
              {payload?.byte_size
                ? ` · ${payload.byte_size.toLocaleString()} bytes`
                : ''}
            </span>
          </span>
          <button
            disabled={!payload || downloading}
            onClick={() => void download()}
            type="button"
          >
            {downloading ? 'Saving…' : 'Download'}
          </button>
        </span>
        {loading && !payload && <span>Loading attachment…</span>}
        {kind === 'image' && payload && (
          <ImagePreview alt={name} src={payload.data_url} />
        )}
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
            <button
              onClick={() => setAttempt((value) => value + 1)}
              type="button"
            >
              Retry
            </button>
          </span>
        )}
      </span>
    )
  }
  if (remote) {
    return (
      <a
        className="support-remote-attachment"
        href={remote}
        rel="noreferrer"
        target="_blank"
      >
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

function TicketPanel({
  activeSpeechId,
  onSpeak,
  onStop,
  playbackVoice,
  ticket,
}: {
  activeSpeechId?: string
  onSpeak?: SupportOpsViewProps['onSpeak']
  onStop?: () => void
  playbackVoice?: SupportOperatorConfig['playback_voice']
  ticket: Record<string, unknown> | null | undefined
}) {
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
      <small>
        {String(ticket.ticket_id ?? ticket.path ?? 'Linked ticket')}
      </small>
      {Object.entries(sections).map(([name, value]) => {
        const text = normalizeSupportMarkdown(value)
        if (!text) return null
        return (
          <div className="support-ticket-section" key={name}>
            <div className="support-inline-heading">
              <strong>{name}</strong>
              <span className="support-section-actions">
                <SupportSpeakButton
                  activeSpeechId={activeSpeechId}
                  config={playbackVoice}
                  id={`support-ticket-${name}`}
                  onSpeak={onSpeak}
                  onStop={onStop}
                  text={text}
                />
                <CopyAction label={`Copy ${name}`} text={text} />
              </span>
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
  onSave: (
    settings: SupportSettings,
    scope: 'global' | 'thread',
  ) => Promise<void>
  onVoiceInput?: (target: (text: string) => void) => void
  voicePhase?: string
  voiceRecordingAvailable?: boolean
}) {
  const [value, setValue] = useState<SupportSettings>(payload?.settings ?? {})
  useEffect(() => setValue(payload?.settings ?? {}), [payload])
  if (!payload) return <p>Run settings are unavailable.</p>
  const options = payload.options ?? {}
  const patch = (next: Partial<SupportSettings>) =>
    setValue((current) => ({ ...current, ...next }))
  const profiles = optionRows(options.profiles, [
    { name: 'default', label: 'default' },
  ])
  const models = options.models ?? []
  const selectedModel = value.model
    ? JSON.stringify([value.provider ?? '', value.model])
    : ''
  const accessPresets = optionRows(options.access_presets, [
    { value: 'analysis', label: 'Analysis only' },
    { value: 'support', label: 'Support investigation' },
    { value: 'coding', label: 'Coding workspace' },
    { value: 'full', label: 'Full access / YOLO' },
    { value: 'custom', label: 'Custom' },
  ])
  const toolsetOptions = optionRows(options.hermes_toolsets, [
    { value: 'web', label: 'Web' },
    { value: 'vision', label: 'Vision' },
    { value: 'terminal', label: 'Terminal' },
    { value: 'file', label: 'File' },
    { value: 'skills', label: 'Skills' },
    { value: 'browser', label: 'Browser' },
    { value: 'todo', label: 'Todo' },
    { value: 'memory', label: 'Memory' },
    { value: 'session_search', label: 'Session search' },
    { value: 'code_execution', label: 'Code execution' },
    { value: 'delegation', label: 'Delegation' },
    { value: 'debugging', label: 'Debugging' },
    { value: 'coding', label: 'Coding' },
    { value: 'hermes-cli', label: 'Hermes CLI' },
  ])
  const applyAccessPreset = (access_preset: string) => {
    const presets: Record<string, Partial<SupportSettings>> = {
      analysis: {
        hermes_toolsets: [],
        codex_sandbox: 'read-only',
        codex_yolo: false,
      },
      support: {
        hermes_toolsets: [
          'debugging',
          'skills',
          'vision',
          'todo',
          'session_search',
        ],
        codex_sandbox: 'read-only',
        codex_yolo: false,
      },
      coding: {
        hermes_toolsets: ['coding'],
        codex_sandbox: 'workspace-write',
        codex_yolo: false,
      },
      full: {
        hermes_toolsets: ['hermes-cli'],
        codex_sandbox: 'danger-full-access',
        codex_yolo: true,
      },
    }
    patch({ access_preset, ...(presets[access_preset] ?? {}) })
  }
  const toggleHermesToolset = (name: string, enabled: boolean) => {
    const selected = new Set(value.hermes_toolsets ?? [])
    if (enabled) selected.add(name)
    else selected.delete(name)
    patch({ access_preset: 'custom', hermes_toolsets: [...selected] })
  }

  return (
    <div className="support-settings-grid">
      <label>
        <span>Workflow</span>
        <select
          value={value.workflow ?? 'suggest_reply'}
          onChange={(event) => patch({ workflow: event.target.value })}
        >
          {optionRows(options.workflows, [
            { value: 'investigate', label: 'Investigate' },
            { value: 'suggest_reply', label: 'Suggest response' },
            {
              value: 'investigate_ticket_reply',
              label: 'Investigate + ticket + response',
            },
          ]).map((option) => (
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
          onChange={(event) => patch({ execution_mode: event.target.value })}
        >
          {optionRows(options.execution_modes, [
            { value: 'direct', label: 'Main agent' },
            { value: 'delegated', label: 'Delegated worker' },
          ]).map((option) => (
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
          onChange={(event) => patch({ program: event.target.value })}
        >
          {optionRows(options.programs, [
            { value: 'hermes', label: 'Hermes' },
            { value: 'codex', label: 'Codex' },
          ]).map((option) => (
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
            onChange={(event) => patch({ codex_model: event.target.value })}
            placeholder="Configured default"
          />
        </label>
      ) : (
        <>
          <label>
            <span>Hermes profile</span>
            <select
              value={value.profile ?? 'default'}
              onChange={(event) => patch({ profile: event.target.value })}
            >
              {profiles.map((option) => (
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
              onChange={(event) => {
                if (!event.target.value) {
                  patch({ provider: '', model: '' })
                  return
                }
                const [provider, model] = JSON.parse(event.target.value) as [
                  string,
                  string,
                ]
                patch({ provider, model })
              }}
            >
              <option value="">Hermes configured default</option>
              {models.map((option) => {
                const provider = String(option.provider ?? '')
                const model = String(option.model ?? option.value ?? '')
                const encoded = JSON.stringify([provider, model])
                return (
                  <option key={encoded} value={encoded}>
                    {option.label ||
                      [provider, model].filter(Boolean).join(' · ') ||
                      model}
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
          onChange={(event) => patch({ reasoning_effort: event.target.value })}
        >
          {(options.reasoning_efforts ?? ['', 'low', 'medium', 'high']).map(
            (item) => (
              <option key={item || 'default'} value={item}>
                {item || 'Default'}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="support-wide-field">
        <span>Tools and access preset</span>
        <select
          value={value.access_preset ?? 'support'}
          onChange={(event) => applyAccessPreset(event.target.value)}
        >
          {accessPresets.map((option) => (
            <option key={optionValue(option)} value={optionValue(option)}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
        <small>
          {accessPresets.find(
            (option) =>
              optionValue(option) === (value.access_preset ?? 'support'),
          )?.description ??
            'Choose a preset or customize the runner authority.'}
        </small>
      </label>
      {value.program === 'codex' ? (
        <>
          <label>
            <span>Codex sandbox</span>
            <select
              disabled={Boolean(value.codex_yolo)}
              value={value.codex_sandbox ?? 'read-only'}
              onChange={(event) =>
                patch({
                  access_preset: 'custom',
                  codex_sandbox: event.target
                    .value as SupportSettings['codex_sandbox'],
                  codex_yolo: false,
                })
              }
            >
              {optionRows(options.codex_sandboxes, [
                { value: 'read-only', label: 'Read only' },
                { value: 'workspace-write', label: 'Workspace write' },
                {
                  value: 'danger-full-access',
                  label: 'Unrestricted filesystem',
                },
              ]).map((option) => (
                <option key={optionValue(option)} value={optionValue(option)}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="support-check-row support-danger-access">
            <input
              checked={Boolean(value.codex_yolo)}
              onChange={(event) =>
                patch({
                  access_preset: 'custom',
                  codex_yolo: event.target.checked,
                  codex_sandbox: event.target.checked
                    ? 'danger-full-access'
                    : (value.codex_sandbox ?? 'read-only'),
                })
              }
              type="checkbox"
            />
            <span>YOLO: bypass Codex approvals and sandbox</span>
          </label>
        </>
      ) : (
        <details className="support-toolset-picker support-wide-field">
          <summary>
            Hermes toolsets ({value.hermes_toolsets?.length ?? 0} selected)
          </summary>
          <div className="support-toolset-grid">
            {toolsetOptions.map((option) => {
              const name = optionValue(option)
              return (
                <label key={name} title={option.description ?? ''}>
                  <input
                    checked={(value.hermes_toolsets ?? []).includes(name)}
                    onChange={(event) =>
                      toggleHermesToolset(name, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>{optionLabel(option)}</span>
                </label>
              )
            })}
          </div>
        </details>
      )}
      <label className="support-check-row">
        <input
          checked={Boolean(value.include_agent_chat)}
          onChange={(event) =>
            patch({ include_agent_chat: event.target.checked })
          }
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
          onChange={(event) =>
            patch({ agent_chat_turns: Number(event.target.value) })
          }
        />
      </label>
      <label className="support-wide-field">
        <span>Draft guidance</span>
        <span className="support-voice-field">
          <textarea
            rows={4}
            value={value.custom_instructions ?? ''}
            onChange={(event) =>
              patch({ custom_instructions: event.target.value })
            }
            placeholder="Optional style, routing, or response constraints"
          />
          <VoiceInputButton
            available={voiceRecordingAvailable}
            onTranscript={(text) =>
              setValue((current) => ({
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
        <button
          disabled={busy}
          onClick={() => void onSave(value, 'global')}
          type="button"
        >
          Save as defaults
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void onSave(value, 'thread')}
          type="button"
        >
          Save for thread
        </button>
      </div>
    </div>
  )
}

function SuggestedResponse({
  activeSpeechId,
  busy,
  settings,
  threadId,
  workspace,
  mutate,
  onSpeak,
  onStop,
  onVoiceInput,
  playbackVoice,
  voicePhase = 'idle',
  voiceRecordingAvailable = false,
}: {
  activeSpeechId?: string
  busy: boolean
  settings: SupportSettings
  threadId: string
  workspace: Record<string, unknown> | null | undefined
  mutate: (
    path: string,
    body: Record<string, unknown>,
    method?: 'POST' | 'PUT',
  ) => Promise<void>
  onSpeak?: SupportOpsViewProps['onSpeak']
  onStop?: () => void
  onVoiceInput?: (target: (text: string) => void) => void
  playbackVoice?: SupportOperatorConfig['playback_voice']
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
    <SupportSection
      copyText={draft}
      headingActions={
        <SupportSpeakButton
          activeSpeechId={activeSpeechId}
          config={playbackVoice}
          id={`support-suggested-${threadId}`}
          onSpeak={onSpeak}
          onStop={onStop}
          text={draft}
        />
      }
      title="Suggested response"
    >
      {editing ? (
        <div className="support-voice-field">
          <textarea
            rows={10}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <VoiceInputButton
            available={voiceRecordingAvailable}
            onTranscript={(text) =>
              setDraft((current) => appendSupportDictation(current, text))
            }
            onVoiceInput={onVoiceInput}
            phase={voicePhase}
          />
        </div>
      ) : (
        <MarkdownContent>{draft}</MarkdownContent>
      )}
      <div className="support-action-row">
        <button onClick={() => setEditing((value) => !value)} type="button">
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
          onChange={(event) => setFeedback(event.target.value)}
        />
        <VoiceInputButton
          available={voiceRecordingAvailable}
          onTranscript={(text) =>
            setFeedback((current) => appendSupportDictation(current, text))
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
  activeSpeechId,
  connected,
  connectionId,
  transport,
  onError,
  onNotice,
  onSpeak,
  onStartSession,
  onStartVoiceSession,
  onStopSpeech,
  onVoiceInput,
  voicePhase = 'idle',
  voiceRecordingAvailable = false,
}: SupportOpsViewProps) {
  const [queue, setQueue] = useState<SupportQueuePayload | null>(null)
  const [stats, setStats] = useState<SupportStatsPayload | null>(null)
  const [view, setView] = useState<'queue' | 'overview'>('queue')
  const [health, setHealth] = useState<SupportOpsHealth | null>(null)
  const [operatorConfig, setOperatorConfig] =
    useState<SupportOperatorConfig | null>(null)
  const [queueLoading, setQueueLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const [detail, setDetail] = useState<SupportThreadDetail | null>(null)
  const [settingsPayload, setSettingsPayload] =
    useState<SupportSettingsPayload | null>(null)
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
  const voiceCatalog = useVoiceCatalog(transport, connected)

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

  const loadHealth = useCallback(async () => {
    if (!connected || !transport) return
    try {
      const payload = await transport.requestJson<SupportOpsHealth>(
        supportOpsPath('/health'),
        undefined,
        { timeoutMs: 8_000 },
      )
      setHealth(payload)
    } catch (error) {
      fail(error)
    }
  }, [connected, fail, transport])

  const loadStats = useCallback(async () => {
    if (!connected || !transport) return
    try {
      const payload = await transport.requestJson<SupportStatsPayload>(
        supportOpsPath('/stats'),
        undefined,
        { timeoutMs: 20_000 },
      )
      setStats(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/HTTP 404|no such api endpoint|not found/i.test(message)) fail(error)
    }
  }, [connected, fail, transport])

  const loadOperatorConfig = useCallback(async () => {
    if (!connected || !transport) return
    try {
      const payload = await transport.requestJson<SupportOperatorConfigPayload>(
        supportOpsPath('/operator-config'),
        undefined,
        { timeoutMs: 20_000 },
      )
      setOperatorConfig(payload.config ?? {})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/HTTP 404|no such api endpoint|not found/i.test(message)) fail(error)
    }
  }, [connected, fail, transport])

  const loadThread = useCallback(
    async (threadId: string, showLoading = false) => {
      if (!connected || !transport || !threadId) return
      if (showLoading) setDetailLoading(true)
      const existing = threadLoadRef.current
      if (existing) {
        await existing.promise
        if (
          existing.threadId === threadId ||
          selectedIdRef.current !== threadId
        ) {
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
              supportOpsPath(
                `/jobs?thread_id=${encodeURIComponent(threadId)}&limit=12`,
              ),
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
    setStats(null)
    setHealth(null)
    setOperatorConfig(null)
    setSelectedId('')
    setDetail(null)
    setSettingsPayload(null)
    setJobs([])
    setLocalError('')
  }, [connectionId])

  useEffect(() => {
    if (!active || !connected || !transport) return
    void Promise.all([
      loadQueue(),
      loadHealth(),
      loadStats(),
      loadOperatorConfig(),
    ])
    const timer = window.setInterval(
      () => void Promise.all([loadQueue(), loadHealth()]),
      30_000,
    )
    return () => window.clearInterval(timer)
  }, [
    active,
    connected,
    loadHealth,
    loadOperatorConfig,
    loadQueue,
    loadStats,
    transport,
  ])

  useEffect(() => {
    if (!active || !connected || !transport) return
    const timer = window.setInterval(() => void loadStats(), 60_000)
    return () => window.clearInterval(timer)
  }, [active, connected, loadStats, transport])

  useEffect(() => {
    setDetail(null)
    setSettingsPayload(null)
    setJobs([])
  }, [selectedId])

  useEffect(() => {
    if (!active || !connected || !selectedId) return
    void Promise.all([loadThread(selectedId, true), loadSettings(selectedId)])
    const timer = window.setInterval(() => void loadThread(selectedId), 12_000)
    return () => window.clearInterval(timer)
  }, [active, connected, loadSettings, loadThread, selectedId])

  const rows = useMemo(
    () => filterSupportThreads(queue?.threads ?? [], query, filter),
    [filter, query, queue?.threads],
  )
  const summary = queue?.summary ?? {}
  const settings = settingsPayload?.settings ?? {}
  const operatorLabel = operatorConfig?.operator_name?.trim() || 'Operator'
  const targetedSyncAvailable = supportOpsTargetedSyncAvailable(health)
  const activeJob = jobs.find((job) =>
    ['queued', 'running'].includes(job.status ?? ''),
  )
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

  const pluginAction = useCallback(
    async <T,>(
      path: string,
      body: Record<string, unknown> | undefined,
      method: 'GET' | 'POST' | 'PUT',
      label: string,
      timeoutMs = 45_000,
    ): Promise<T | null> => {
      if (!connected || !transport) return null
      setBusy(label)
      setLocalError('')
      try {
        return await transport.requestJson<T>(supportOpsPath(path), body, {
          method,
          timeoutMs,
        })
      } catch (error) {
        fail(error)
        return null
      } finally {
        setBusy('')
      }
    },
    [connected, fail, transport],
  )

  const saveOperatorConfig = useCallback(
    async (value: SupportOperatorConfig) => {
      const result = await pluginAction<SupportOperatorConfigPayload>(
        '/operator-config',
        value as Record<string, unknown>,
        'PUT',
        'Save setup',
      )
      if (!result) return
      setOperatorConfig(result.config ?? value)
      await loadQueue()
      onNotice?.('Support Ops setup saved')
    },
    [loadQueue, onNotice, pluginAction],
  )

  const exportPortable = useCallback(async () => {
    const bundle = await pluginAction<Record<string, unknown>>(
      '/portable/export',
      undefined,
      'GET',
      'Export setup',
    )
    if (!bundle) return
    const saved = await saveBlob(
      new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      }),
      `hermes-support-ops-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    )
    if (saved) onNotice?.('Support Ops settings exported')
  }, [onNotice, pluginAction])

  const importPortable = useCallback(
    async (bundle: unknown) => {
      if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
        fail(new Error('Support Ops import must be a JSON object'))
        return
      }
      const result = await pluginAction<SupportOperatorConfigPayload>(
        '/portable/import',
        bundle as Record<string, unknown>,
        'POST',
        'Import setup',
      )
      if (!result) return
      await Promise.all([loadOperatorConfig(), loadQueue(), loadStats()])
      onNotice?.('Support Ops settings imported')
    },
    [fail, loadOperatorConfig, loadQueue, loadStats, onNotice, pluginAction],
  )

  const backupPortable = useCallback(async () => {
    const result = await pluginAction<{ filename?: string }>(
      '/portable/backup',
      {},
      'POST',
      'Backup setup',
    )
    if (result) {
      onNotice?.(
        result.filename
          ? `Backup saved as ${result.filename}`
          : 'Support Ops backup saved',
      )
    }
  }, [onNotice, pluginAction])

  const regenerateStats = useCallback(async () => {
    const result = await pluginAction<SupportJob>(
      '/stats/regenerate',
      {},
      'POST',
      'Regenerate stats',
    )
    if (!result) return
    onNotice?.('Support statistics regeneration started')
    window.setTimeout(() => void loadStats(), 2_500)
    window.setTimeout(() => void loadStats(), 7_500)
  }, [loadStats, onNotice, pluginAction])

  const controlBackend = useCallback(
    async (action: 'start' | 'stop' | 'poll') => {
      const result = await pluginAction<SupportJob | SupportOpsHealth['backend']>(
        `/backend/${action}`,
        {},
        'POST',
        `${action === 'poll' ? 'Poll' : action === 'start' ? 'Start' : 'Stop'} backend`,
        action === 'poll' ? 120_000 : 30_000,
      )
      if (!result) return
      await loadHealth()
      if (action === 'poll') {
        onNotice?.('Support poll started')
        window.setTimeout(() => void Promise.all([loadQueue(), loadHealth(), loadStats()]), 4_000)
      } else {
        onNotice?.(`Support backend ${action === 'start' ? 'started' : 'stopped'}`)
      }
    },
    [loadHealth, loadQueue, loadStats, onNotice, pluginAction],
  )

  const refreshFilteredThreads = useCallback(async () => {
    const threadIds = rows.slice(0, 100).map(row => row.thread_id)
    if (!threadIds.length) return
    const result = await pluginAction<{
      started?: number
      failures?: unknown[]
    }>(
      '/sync',
      { thread_ids: threadIds },
      'POST',
      'Refresh filtered',
      120_000,
    )
    if (!result) return
    await loadQueue()
    onNotice?.(
      `Started ${Number(result.started ?? 0)} filtered thread refreshes${
        result.failures?.length ? `; ${result.failures.length} failed` : ''
      }`,
    )
  }, [loadQueue, onNotice, pluginAction, rows])

  const ticketAllUnticketed = useCallback(async () => {
    const count = Number(summary.without_ticket ?? 0)
    if (
      !count ||
      !window.confirm(
        `Create or repair durable local tickets for all ${count} unticketed open threads?\n\nThis does not post to Discord.`,
      )
    ) {
      return
    }
    const result = await pluginAction<{
      requested?: number
      ticketed?: number
      failures?: unknown[]
    }>(
      '/tickets/unticketed',
      { confirm: true },
      'POST',
      'Ticket unticketed',
      120_000,
    )
    if (!result) return
    await loadQueue()
    onNotice?.(
      `Created ${Number(result.ticketed ?? 0)} of ${Number(
        result.requested ?? 0,
      )} requested tickets${
        result.failures?.length ? `; ${result.failures.length} failed` : ''
      }`,
    )
  }, [loadQueue, onNotice, pluginAction, summary.without_ticket])

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
        <p>
          Reconnecting to the selected host. Your Support Ops view will return
          automatically.
        </p>
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
          <div className="support-connection-banner">
            Reconnecting · showing cached Support Ops data
          </div>
        )}
        <header className="support-page-heading support-detail-heading">
          <button
            className="support-back-button"
            onClick={() => setSelectedId('')}
            type="button"
          >
            ← Queue
          </button>
          <div>
            <p className="eyebrow">Support thread</p>
            <h1>{plainSupportTitle(detail?.title) || selectedId}</h1>
            <small>
              {selectedId} · {detail?.message_count ?? 0} messages
            </small>
          </div>
          <div className="support-heading-actions">
            <button
              disabled={!detail}
              onClick={async () => {
                if (!detail) return
                try {
                  const saved = await saveBlob(
                    new Blob([supportHandoffMarkdown(detail)], {
                      type: 'text/markdown',
                    }),
                    supportHandoffFilename(detail),
                    'text/markdown',
                  )
                  if (saved) onNotice?.('Support handoff saved')
                } catch (downloadError) {
                  fail(downloadError)
                }
              }}
              type="button"
            >
              Export
            </button>
            {discordUrl && (
              <a href={discordUrl} rel="noreferrer" target="_blank">
                Discord
              </a>
            )}
            <button
              disabled={!connected || detailLoading}
              onClick={() => void loadThread(selectedId, true)}
              type="button"
            >
              {detailLoading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              disabled={Boolean(!connected || !detail || !onStartVoiceSession)}
              onClick={async () => {
                if (!detail || !onStartVoiceSession) return
                setBusy('Voice session')
                try {
                  await onStartVoiceSession(supportInvestigationPrompt(detail))
                  onNotice?.('Support voice session opened')
                } catch (sessionError) {
                  fail(sessionError)
                } finally {
                  setBusy('')
                }
              }}
              type="button"
            >
              {busy === 'Voice session' ? 'Opening…' : 'Voice session'}
            </button>
          </div>
        </header>

        {localError && <div className="support-inline-error">{localError}</div>}
        {health && !targetedSyncAvailable && (
          <div className="support-inline-warning">
            Targeted thread sync is unavailable on this host. Ticket and agent
            actions remain available.
          </div>
        )}
        {detail?.detail_warning && (
          <div className="support-inline-warning">{detail.detail_warning}</div>
        )}
        {detail?.waiting_on && (
          <div className="support-owner-strip">
            {detail.waiting_on.support?.map(name => (
              <span key={`support-${name}`}>Support: {name}</span>
            ))}
            {detail.waiting_on.developers?.map(name => (
              <span key={`dev-${name}`}>Dev: {name}</span>
            ))}
          </div>
        )}
        {detailLoading && !detail ? (
          <div className="support-loading">Loading thread…</div>
        ) : (
          <div className="support-detail-content">
            <SupportSection title="Operator actions">
              {detail?.detail_pending && (
                <p className="support-muted">
                  {targetedSyncAvailable
                    ? 'Detailed context is catching up. Sync before running an agent workflow.'
                    : 'Detailed context is catching up, but targeted sync is unavailable on this host.'}
                </p>
              )}
              <div className="support-voice-field">
                <textarea
                  disabled={!connected || detail?.detail_pending}
                  placeholder="Operator notes or constraints"
                  rows={4}
                  value={operatorNotes}
                  onChange={(event) => setOperatorNotes(event.target.value)}
                />
                <VoiceInputButton
                  available={voiceRecordingAvailable}
                  onTranscript={(text) =>
                    setOperatorNotes((current) =>
                      appendSupportDictation(current, text),
                    )
                  }
                  onVoiceInput={onVoiceInput}
                  phase={voicePhase}
                />
              </div>
              <div className="support-action-row">
                <button
                  disabled={Boolean(
                    !connected || busy || !detail || !onStartSession,
                  )}
                  onClick={async () => {
                    if (!detail || !onStartSession) return
                    setBusy('Chat session')
                    try {
                      await onStartSession(supportInvestigationPrompt(detail))
                      onNotice?.('Investigation opened in a new Hermes session')
                    } catch (sessionError) {
                      fail(sessionError)
                    } finally {
                      setBusy('')
                    }
                  }}
                  type="button"
                >
                  {busy === 'Chat session' ? 'Opening…' : 'Open in session'}
                </button>
                <button
                  className="primary"
                  disabled={Boolean(
                    !connected || busy || activeJob || detail?.detail_pending,
                  )}
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
                  disabled={Boolean(
                    !connected || busy || activeJob || detail?.detail_pending,
                  )}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/runs`,
                      {
                        action: 'investigate',
                        operator_notes: operatorNotes,
                        settings,
                      },
                      'POST',
                      'Investigation',
                    )
                  }
                  type="button"
                >
                  Investigate
                </button>
                <button
                  disabled={Boolean(
                    !connected || busy || activeJob || detail?.detail_pending,
                  )}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/runs`,
                      {
                        action: 'investigate_ticket',
                        operator_notes: operatorNotes,
                        settings,
                      },
                      'POST',
                      detail?.ticket
                        ? 'Investigation and ticket rebuild'
                        : 'Investigation and ticket generation',
                    )
                  }
                  type="button"
                >
                  {detail?.ticket
                    ? 'Investigate + redo ticket'
                    : 'Investigate + ticket'}
                </button>
                <button
                  disabled={Boolean(
                    !connected || busy || activeJob || detail?.detail_pending,
                  )}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/runs`,
                      {
                        action: 'suggest_reply',
                        operator_notes: operatorNotes,
                        settings,
                      },
                      'POST',
                      'Response draft',
                    )
                  }
                  type="button"
                >
                  Suggest response
                </button>
                <button
                  disabled={Boolean(
                    !connected || busy || activeJob || !targetedSyncAvailable,
                  )}
                  onClick={() =>
                    void mutate(
                      `/threads/${selectedId}/sync`,
                      {},
                      'POST',
                      'Thread sync',
                    )
                  }
                  type="button"
                >
                  Sync thread
                </button>
                <button
                  disabled={Boolean(
                    !connected || busy || detail?.detail_pending,
                  )}
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
                  <span>
                    {activeJob.kind || 'Support job'} · {activeJob.status}
                  </span>
                  <button
                    disabled={Boolean(!connected || busy)}
                    onClick={() =>
                      void mutate(
                        `/jobs/${activeJob.id}/cancel`,
                        {},
                        'POST',
                        'Job cancellation',
                      )
                    }
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </SupportSection>

            {detail && (
              <SupportThreadReader
                activeSpeechId={activeSpeechId}
                choices={voiceCatalog.choices}
                config={operatorConfig}
                detail={detail}
                onSpeak={onSpeak}
                onStop={onStopSpeech}
              />
            )}

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
                    scope === 'global'
                      ? '/settings'
                      : `/threads/${selectedId}/settings`,
                    next as Record<string, unknown>,
                    'PUT',
                    scope === 'global' ? 'Default settings' : 'Thread settings',
                  )
                }}
              />
            </details>

            <SupportSection title="Thread sidechat">
              <p className="support-muted">
                Private operator conversation for this thread. It never posts to
                Discord.
              </p>
              {(detail?.agent_chat?.messages ?? [])
                .slice(-8)
                .map((message, index) => {
                  const content = normalizeSupportMarkdown(message.content)
                  return (
                    <article
                      className="support-sidechat-message"
                      key={String(message.id ?? index)}
                    >
                      <div className="support-inline-heading">
                        <strong>
                          {message.role === 'assistant' ? 'Agent' : 'You'}
                        </strong>
                        <span className="support-section-actions">
                          <SupportSpeakButton
                            activeSpeechId={activeSpeechId}
                            config={operatorConfig?.playback_voice}
                            id={`support-sidechat-${String(message.id ?? index)}`}
                            onSpeak={onSpeak}
                            onStop={onStopSpeech}
                            text={content}
                          />
                          <CopyAction
                            label="Copy sidechat message"
                            text={content}
                          />
                        </span>
                      </div>
                      <MarkdownContent>{content}</MarkdownContent>
                    </article>
                  )
                })}
              <div className="support-voice-field">
                <textarea
                  disabled={Boolean(
                    !connected || busy || activeJob || detail?.detail_pending,
                  )}
                  placeholder="Ask about this thread, ticket, evidence, or next action…"
                  rows={4}
                  value={sidechatMessage}
                  onChange={(event) => setSidechatMessage(event.target.value)}
                />
                <VoiceInputButton
                  available={voiceRecordingAvailable}
                  onTranscript={(text) =>
                    setSidechatMessage((current) =>
                      appendSupportDictation(current, text),
                    )
                  }
                  onVoiceInput={onVoiceInput}
                  phase={voicePhase}
                />
              </div>
              <button
                className="primary support-send-agent"
                disabled={Boolean(
                  !connected || busy || activeJob || !sidechatMessage.trim(),
                )}
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

            <TicketPanel
              activeSpeechId={activeSpeechId}
              onSpeak={onSpeak}
              onStop={onStopSpeech}
              playbackVoice={operatorConfig?.playback_voice}
              ticket={detail?.ticket}
            />

            <SuggestedResponse
              activeSpeechId={activeSpeechId}
              busy={Boolean(!connected || busy)}
              mutate={mutate}
              onSpeak={onSpeak}
              onStop={onStopSpeech}
              onVoiceInput={onVoiceInput}
              playbackVoice={operatorConfig?.playback_voice}
              settings={settings}
              threadId={selectedId}
              voicePhase={voicePhase}
              voiceRecordingAvailable={voiceRecordingAvailable}
              workspace={workspace}
            />

            {workspace &&
              ['investigation', 'operator_notes'].map((key) => {
                const text = normalizeSupportMarkdown(workspace[key])
                if (!text) return null
                return (
                  <SupportSection
                    copyText={text}
                    headingActions={
                      <SupportSpeakButton
                        activeSpeechId={activeSpeechId}
                        config={operatorConfig?.playback_voice}
                        id={`support-workspace-${key}`}
                        onSpeak={onSpeak}
                        onStop={onStopSpeech}
                        text={text}
                      />
                    }
                    key={key}
                    title={
                      key === 'investigation'
                        ? 'Workspace investigation'
                        : 'Operator notes'
                    }
                  >
                    <MarkdownContent>{text}</MarkdownContent>
                  </SupportSection>
                )
              })}

            <SupportSection title="Discord transcript">
              {detail?.messages?.length ? (
                detail.messages.map((message, index) => {
                  const text = normalizeSupportMarkdown(
                    message.body,
                    mentionNames,
                  )
                  const messageId = String(message.message_id ?? '')
                  return (
                    <article
                      className={`support-message ${message.is_operator ? 'operator' : ''}`}
                      id={
                        messageId ? `support-message-${messageId}` : undefined
                      }
                      key={messageId || `${message.timestamp}-${index}`}
                    >
                      <div className="support-message-meta">
                        <strong>{message.author || 'Unknown'}</strong>
                        <span>
                          {formatTime(message.timestamp)}
                          <SupportSpeakButton
                            activeSpeechId={activeSpeechId}
                            config={operatorConfig?.playback_voice}
                            id={`support-message-${messageId || index}`}
                            label="Listen"
                            onSpeak={onSpeak}
                            onStop={onStopSpeech}
                            text={text}
                          />
                          <CopyAction
                            label="Copy Discord message"
                            text={text}
                          />
                        </span>
                      </div>
                      <MarkdownContent>{text}</MarkdownContent>
                      {(attachmentsByMessage.get(messageId) ?? []).map(
                        (attachment, attachmentIndex) => (
                          <SupportAttachmentView
                            attachment={attachment}
                            key={`${attachment.filename}-${attachmentIndex}`}
                            transport={transport}
                          />
                        ),
                      )}
                    </article>
                  )
                })
              ) : (
                <p>
                  {detail?.detail_message ||
                    'No transcript messages available.'}
                </p>
              )}
            </SupportSection>

            {jobs.length > 0 && (
              <SupportSection title="Run history">
                {jobs.slice(0, 12).map((job) => (
                  <article className="support-job-row" key={job.id}>
                    <div className="support-inline-heading">
                      <strong>{job.kind || 'Support job'}</strong>
                      <span>{job.status || 'unknown'}</span>
                    </div>
                    {job.message && <p>{job.message}</p>}
                    {job.activity_log?.length ? (
                      <pre>
                        {job.activity_log
                          .slice(-3)
                          .map((item) =>
                            typeof item === 'string'
                              ? item
                              : JSON.stringify(item),
                          )
                          .join('\n')}
                      </pre>
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
        <div className="support-connection-banner">
          Reconnecting · showing cached Support Ops data
        </div>
      )}
      <header className="support-page-heading">
        <div>
          <p className="eyebrow">Host plugin</p>
          <h1>Support Ops</h1>
          <small>No automatic Discord posting</small>
        </div>
        <div className="support-heading-actions">
          {health?.capabilities?.backend_control === true && (
            <div className="support-view-toggle" role="group" aria-label="Support backend controls">
              <span
                className={health.backend?.running ? 'active' : ''}
                title={health.backend?.last_error || undefined}
              >
                {health.backend?.running
                  ? 'Backend running'
                  : health.backend?.credential_ready === false
                    ? 'Backend needs token'
                    : 'Backend stopped'}
              </span>
              {health.backend?.running ? (
                <button
                  disabled={Boolean(!connected || busy)}
                  onClick={() => void controlBackend('stop')}
                  type="button"
                >
                  {busy === 'Stop backend' ? 'Stopping…' : 'Stop'}
                </button>
              ) : (
                <button
                  disabled={Boolean(
                    !connected || busy || health.backend?.credential_ready === false,
                  )}
                  onClick={() => void controlBackend('start')}
                  type="button"
                >
                  {busy === 'Start backend' ? 'Starting…' : 'Start'}
                </button>
              )}
              <button
                disabled={Boolean(
                  !connected || busy || health.backend?.credential_ready === false,
                )}
                onClick={() => void controlBackend('poll')}
                type="button"
              >
                {busy === 'Poll backend' ? 'Polling…' : 'Poll now'}
              </button>
            </div>
          )}
          <div
            className="support-view-toggle"
            role="group"
            aria-label="Support view"
          >
            <button
              aria-pressed={view === 'queue'}
              onClick={() => setView('queue')}
              type="button"
            >
              Queue
            </button>
            <button
              aria-pressed={view === 'overview'}
              onClick={() => setView('overview')}
              type="button"
            >
              Overview
            </button>
          </div>
          <button
            disabled={!connected || queueLoading}
            onClick={() =>
              void Promise.all([loadQueue(), loadHealth(), loadStats()])
            }
            type="button"
          >
            {queueLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          {view === 'overview' && (
            <button
              disabled={Boolean(!connected || busy)}
              onClick={() => void regenerateStats()}
              title="Re-run the host artifact generator and rebuild Support statistics"
              type="button"
            >
              {busy === 'Regenerate stats' ? 'Generating…' : 'Regenerate stats'}
            </button>
          )}
        </div>
      </header>
      {localError && <div className="support-inline-error">{localError}</div>}
      {health && !targetedSyncAvailable && (
        <div className="support-inline-warning">
          Targeted thread sync is unavailable on this host. Ticket actions
          remain available.
        </div>
      )}
      {operatorConfig && (
        <SupportSetupPanel
          busy={busy}
          choices={voiceCatalog.choices}
          config={operatorConfig}
          onBackup={backupPortable}
          onExport={exportPortable}
          onImport={importPortable}
          onImportError={fail}
          onSave={saveOperatorConfig}
        />
      )}
      {view === 'overview' ? (
        <SupportOverview queue={queue} stats={stats} />
      ) : (
        <>
          <div className="support-metrics" aria-label="Support queue counts">
            {[
              ['all', 'Open', summary.open],
              ['waiting_operator', operatorLabel, summary.waiting_on_operator],
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
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Filter support queue"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as SupportQueueFilter)
              }
            >
              {FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {value === 'waiting_operator'
                    ? `Waiting on ${operatorLabel}`
                    : label}
                </option>
              ))}
            </select>
          </div>
          <div className="support-queue-count">
            {rows.length}/{summary.open ?? 0} open threads
          </div>
          <div className="support-bulk-actions">
            <button
              disabled={Boolean(
                !connected || busy || !rows.length || !targetedSyncAvailable,
              )}
              onClick={() => void refreshFilteredThreads()}
              title="Start targeted sync for up to the first 100 threads in the current filter"
              type="button"
            >
              {busy === 'Refresh filtered'
                ? 'Starting…'
                : `Refresh filtered (${Math.min(rows.length, 100)})`}
            </button>
            <button
              disabled={Boolean(!connected || busy || !summary.without_ticket)}
              onClick={() => void ticketAllUnticketed()}
              title="Create durable local tickets for every currently unticketed queue item"
              type="button"
            >
              {busy === 'Ticket unticketed'
                ? 'Ticketing…'
                : `Ticket unticketed (${Number(summary.without_ticket ?? 0)})`}
            </button>
          </div>
          {queueLoading && !queue ? (
            <div className="support-loading">Loading support queue…</div>
          ) : rows.length ? (
            <div className="support-thread-list">
              {rows.map((row) => (
                <article
                  className="support-thread-card"
                  data-pet-perch
                  key={row.thread_id}
                >
                  <button
                    className="support-thread-open"
                    onClick={() => setSelectedId(row.thread_id)}
                    type="button"
                  >
                    <strong>
                      {plainSupportTitle(row.title) || row.thread_id}
                    </strong>
                    <span>
                      {row.topic_label || 'Unclassified'}
                      {compactAge(row.hours_since_last_message) &&
                        ` · ${compactAge(row.hours_since_last_message)}`}
                    </span>
                    <SupportTags operatorName={operatorLabel} row={row} />
                    {supportVisibleParticipants(row.participants).length > 0 && (
                      <span className="support-participants">
                        {supportVisibleParticipants(row.participants)
                          .slice(0, 4)
                          .map(name => (
                            <span key={name}>{name}</span>
                          ))}
                        {supportVisibleParticipants(row.participants).length >
                          4 && (
                          <span>
                            +{supportVisibleParticipants(row.participants).length - 4}
                          </span>
                        )}
                      </span>
                    )}
                    {(row.waiting_on?.support?.length ||
                      row.waiting_on?.developers?.length) && (
                      <span className="support-waiting-owners">
                        {row.waiting_on.support?.map(name => (
                          <span key={`support-${name}`}>Support: {name}</span>
                        ))}
                        {row.waiting_on.developers?.map(name => (
                          <span key={`dev-${name}`}>Dev: {name}</span>
                        ))}
                      </span>
                    )}
                  </button>
                  <div className="support-thread-actions">
                    <button
                      disabled={Boolean(
                        !connected || busy || !targetedSyncAvailable,
                      )}
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
                    <button
                      onClick={() => setSelectedId(row.thread_id)}
                      type="button"
                    >
                      Open
                    </button>
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
        </>
      )}
    </div>
  )
}
