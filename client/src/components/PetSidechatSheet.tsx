import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { LiveVoiceMicrophoneButton } from './LiveVoiceMicrophoneButton'
import { RealtimeInputSettings } from './RealtimeInputSettings'
import { RealtimeCostMeter } from './RealtimeCostMeter'
import {
  PET_REALTIME_VOICES,
  type PetRealtimeSnapshot,
} from '../usePetRealtime'
import type { PetPersonalitySummary } from '../pet'
import { MarkdownContent } from './MarkdownContent'
import { REALTIME_MODELS, REALTIME_EFFORTS, supportsRealtimeEffort, type RealtimeSettings } from '../pet-realtime-settings'

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m14 5-7 7 7 7M7 12h14" />
    </svg>
  )
}

function MicrophoneIcon({ recording = false }: { recording?: boolean }) {
  return recording ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="10" rx="1.5" width="10" x="7" y="7" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="11" rx="4" width="7" x="8.5" y="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3 0h6" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m4 12 16-8-5.5 16-3-6.5L4 12Zm7.5 1.5L20 4" />
    </svg>
  )
}

function HandoffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12h12m-4-4 4 4-4 4M19 5v14" />
    </svg>
  )
}

interface SidechatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
}

interface PetSidechatSheetProps {
  settingsRequest?: number
  busy: boolean
  error: string
  messages: SidechatMessage[]
  name: string
  open: boolean
  onClose: () => void
  onLoad: () => void
  onPersonalityChange: (slug: string) => void
  onReset: () => void
  onSend: (text: string) => Promise<boolean>
  onSendToHermes: (text: string) => void
  onTranscriptTarget: (target: ((text: string) => void) | null) => void
  onToggleRecording: () => void
  personalities: PetPersonalitySummary[]
  personalitySlug: string
  realtime: {
    testMicrophone?: () => Promise<void>
    setMicrophoneMuted?: (muted: boolean) => void
    settings?: RealtimeSettings
    setSettings?: (settings: RealtimeSettings) => void
    approveHermesDraft: () => Promise<boolean>
    cancelHermesDraft: () => void
    snapshot: PetRealtimeSnapshot
    start: () => Promise<boolean>
    stop: () => void
    voice: string
    setVoice: (voice: string) => void
    updateHermesDraft: (message: string) => void
  }
  voicePhase: string
  voiceRecordingAvailable: boolean
}

export function PetSidechatSheet({
  settingsRequest = 0,
  busy,
  error,
  messages,
  name,
  onClose,
  onLoad,
  onPersonalityChange,
  onReset,
  onSend,
  onSendToHermes,
  onToggleRecording,
  onTranscriptTarget,
  open,
  personalities,
  personalitySlug,
  realtime,
  voicePhase,
  voiceRecordingAvailable,
}: PetSidechatSheetProps) {
  const [draft, setDraft] = useState('')
  const [showContext, setShowContext] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const settingsRef = useRef<HTMLDetailsElement | null>(null)
  const reviewRef = useRef<HTMLElement | null>(null)
  const handledSettingsRequest = useRef(0)
  const followRef = useRef(true)
  const reviewPending = ['pending', 'submitting', 'error'].includes(realtime.snapshot.hermesDraftStatus)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const page = pageRef.current
    if (!open || !page) return
    // Presentation is not call ownership. Back/rotation never stop the transport
    // or unmount the attached session; only End voice owns that action.
    const siblings = Array.from(page.parentElement?.children ?? [])
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== page)
      .map(node => ({ node, inert: node.inert }))
    siblings.forEach(({ node }) => { node.inert = true })
    const resize = () => {
      const viewport = window.visualViewport
      page.style.height = `${viewport?.height || window.innerHeight}px`
      page.style.width = `${viewport?.width || window.innerWidth}px`
      page.style.top = `${viewport?.offsetTop || 0}px`
      page.style.left = `${viewport?.offsetLeft || 0}px`
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current() }
    }
    resize()
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize)
    document.addEventListener('keydown', key)
    const listener = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener('backButton', () => closeRef.current()) : null
    return () => {
      siblings.forEach(({ node, inert }) => { node.inert = inert })
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize)
      document.removeEventListener('keydown', key)
      void listener?.then(handle => handle.remove())
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    if (settingsRequest !== handledSettingsRequest.current && settingsRef.current) {
      handledSettingsRequest.current = settingsRequest
      followRef.current = false
      settingsRef.current.open = true
      settingsRef.current.scrollIntoView({ block: 'start', behavior: 'instant' })
    } else if (reviewPending && reviewRef.current) {
      followRef.current = false
      if (settingsRef.current) settingsRef.current.open = false
      reviewRef.current.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
  }, [open, settingsRequest, reviewPending])
  const lastMessage = messages.at(-1)
  const onLoadRef = useRef(onLoad)

  useEffect(() => {
    onLoadRef.current = onLoad
  }, [onLoad])

  useEffect(() => {
    if (open) onLoadRef.current()
  }, [open])

  useEffect(() => {
    if (!open) return
    onTranscriptTarget(text =>
      setDraft(current => {
        const existing = current.trimEnd()
        return existing ? `${existing} ${text}` : text
      }),
    )
    return () => onTranscriptTarget(null)
  }, [onTranscriptTarget, open])

  useEffect(() => {
    // An explicit settings/review interaction owns this viewport. Late history
    // and voice text must not scroll those controls away beneath old messages.
    if (!open || !followRef.current || settingsRef.current?.open || reviewPending) return
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'instant',
    })
  }, [lastMessage?.id, lastMessage?.text, messages.length, open, realtime.snapshot.transcript, reviewPending])

  if (!open) return null

  const submit = async () => {
    const text = draft.trim()
    if (!text || busy) return
    if (await onSend(text)) setDraft('')
  }

  const recording = voicePhase === 'recording'
  const transcribing = voicePhase === 'transcribing'
  const microphoneLabel = recording
    ? 'Stop pet sidechat recording'
    : transcribing
      ? 'Transcribing pet sidechat recording'
      : 'Record a pet sidechat message'
  const realtimeActive = realtime.snapshot.active || realtime.snapshot.status === 'connecting'
  const stats = realtime.snapshot.contextStats

  return (
    <div className="pet-sidechat-popout voice-page" ref={pageRef} role="presentation">
      <section
        aria-label={`${name} voice conversation`}
        className={`pet-sidechat-sheet${showTranscript ? '' : ' transcript-hidden'}`}
        role="region"
      >
        <header className="pet-sidechat-heading">
          <button aria-label="Close pet sidechat" className="pet-sidechat-icon-button"
            onClick={onClose} title="Back to session (voice keeps running)" type="button"><CloseIcon /></button>
          <div className="pet-sidechat-identity">
            <span aria-hidden="true" className="pet-sidechat-mark">✦</span>
            <div>
              <strong>{name}</strong>
              <span>Voice conversation · EXP</span>
            </div>
          </div>
          <div className="pet-sidechat-header-actions">
            <button
              aria-label={showContext ? 'Hide live voice context' : 'Inspect live voice context'}
              className={`pet-sidechat-text-toggle ${showContext ? 'active' : ''}`}
              onClick={() => setShowContext(current => !current)}
              type="button"
            >
              Context
            </button>
            <button
              aria-label={showTranscript ? 'Hide sidechat transcript' : 'Show sidechat transcript'}
              className="pet-sidechat-text-toggle"
              onClick={() => setShowTranscript(current => !current)}
              type="button"
            >
              {showTranscript ? 'Hide text' : 'Show text'}
            </button>
          </div>
        </header>
        <div className="pet-realtime-controls">
          <button
            aria-label={realtimeActive ? 'End live voice' : 'Start live voice'}
            className={`pet-realtime-button ${realtimeActive ? 'active' : ''}`}
            disabled={busy && !realtimeActive}
            onClick={() => {
              if (realtimeActive) realtime.stop()
              else void realtime.start()
            }}
            type="button"
          >
            {realtime.snapshot.status === 'connecting'
              ? 'Cancel voice'
              : realtime.snapshot.status === 'testing' ? 'Stop mic test'
              : realtimeActive
                ? 'End voice'
                : 'Live voice'}
          </button>
          {realtimeActive && realtime.snapshot.status !== 'testing' && (
            <LiveVoiceMicrophoneButton
              className="pet-realtime-button"
              muted={!!realtime.snapshot.microphoneMuted}
              onChange={muted => realtime.setMicrophoneMuted?.(muted)}
            />
          )}
          <span role="status" className={`pet-realtime-state ${realtime.snapshot.status}`}>
            {realtimeActive ? realtime.snapshot.inputStatus || (realtime.snapshot.microphoneMuted
              ? 'Microphone muted' : realtime.snapshot.status === 'speaking'
                ? 'Speaking' : realtime.snapshot.status) : 'Voice off'}
          </span>
        </div>
        <div className="pet-sidechat-body">
        {realtime.snapshot.attachedContextTitle && <div className="pet-realtime-context-target" role="status">
          {realtime.snapshot.status === 'connecting' ? 'Connecting to: ' : 'Voice context: '}{realtime.snapshot.attachedContextTitle}
        </div>}
        {showTranscript && <div className="pet-sidechat-messages" ref={scrollRef} onScroll={event => {
          const node = event.currentTarget
          followRef.current = node.scrollHeight - node.clientHeight - node.scrollTop < 48
        }}>
          {messages.length === 0 && !realtimeActive && !realtime.snapshot.transcript && (
            <div className="pet-sidechat-empty">
              <span aria-hidden="true">✦</span>
              <strong>Talk privately with {name}</strong>
              <p>
                Ask about the attached Hermes session. This conversation keeps
                its own history and stays out of the main transcript.
              </p>
            </div>
          )}
          {messages.map(message => (
            <article
              className={`pet-sidechat-message ${message.role}`}
              key={message.id}
            >
              <small>{message.role === 'user' ? 'You' : name}</small>
              <MarkdownContent>{message.text}</MarkdownContent>
              {message.role === 'assistant' && (
                <button
                  aria-label="Send this reply to Hermes"
                  className="pet-sidechat-handoff"
                  onClick={() => {
                    onSendToHermes(message.text)
                    onClose()
                  }}
                  title="Send to Hermes composer"
                  type="button"
                >
                  <HandoffIcon />
                  <span>Hermes</span>
                </button>
              )}
            </article>
          ))}
          {realtime.snapshot.transcript && realtimeActive && (
            <article className="pet-sidechat-message assistant pet-realtime-live-text" aria-live="polite">
              <small>{name}</small>
              <MarkdownContent>{realtime.snapshot.transcript}</MarkdownContent>
            </article>
          )}
        </div>}
        <details className="pet-realtime-settings" ref={settingsRef}>
          <summary>Voice settings</summary>
          <button aria-label="Clear pet sidechat history" disabled={busy || messages.length === 0}
            onClick={onReset} type="button">Clear conversation history</button>
          {realtimeActive && realtime.snapshot.inputRoute && <small>Capturing: {realtime.snapshot.inputRoute}</small>}
          <label>Voice
          <select
            aria-label="Pet live voice"
            disabled={realtimeActive}
            onChange={event => realtime.setVoice(event.target.value)}
            value={realtime.voice}
          >
            {PET_REALTIME_VOICES.map(option => (
              <option key={option} value={option}>
                {option[0].toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
          </label>
          <label>Personality
          <select
            aria-label="Pet live voice personality"
            disabled={realtimeActive}
            onChange={event => onPersonalityChange(event.target.value)}
            value={personalitySlug}
          >
            {personalities.filter(option => option.valid).map(option => (
              <option key={option.slug} value={option.slug}>
                {option.displayName}
              </option>
            ))}
          </select>
          </label>
        {realtime.settings && realtime.setSettings && (
          <>
            <label>Voice mode
              <select aria-label="Voice mode" disabled={realtimeActive} value={realtime.settings.mode ?? 'pet'}
                onChange={event => realtime.setSettings?.({ ...realtime.settings!, mode: event.target.value as RealtimeSettings['mode'] })}>
                <option value="pet">Pet</option><option value="session">Session</option>
              </select>
            </label>
            <label>Worker starts per approved request
              <input aria-label="Worker starts per approved request" type="number" min={0} max={16} step={1}
                placeholder="Hermes default" disabled={realtimeActive} value={realtime.settings.maxWorkers ?? ''}
                onChange={event => {
                  if (!event.currentTarget.validity.valid) return
                  realtime.setSettings?.({ ...realtime.settings!, maxWorkers: event.target.value === '' ? undefined : Number(event.target.value) })
                }} />
            </label>
            <small>Includes descendant workers. Zero keeps work in the attached parent. Blank uses Hermes default. Existing concurrency limits still apply.</small>
            <label>Voice handoff review
              <select aria-label="Voice handoff review" disabled={realtimeActive} value={realtime.settings.approval ?? 'on'}
                onChange={event => realtime.setSettings?.({ ...realtime.settings!, approval: event.target.value as RealtimeSettings['approval'] })}>
                <option value="on">On: review every request</option>
                <option value="smart">Smart: reads automatic, handoffs reviewed</option>
                <option value="off">Off: auto-send to Hermes</option>
              </select>
            </label>
            <small>Support workflows and agent permissions still require their own approvals.</small>
            <label>Microphone environment
              <select aria-label="Microphone environment" disabled={realtimeActive} value={realtime.settings.noiseReduction ?? 'near_field'}
                onChange={event => realtime.setSettings?.({ ...realtime.settings!, noiseReduction: event.target.value as RealtimeSettings['noiseReduction'] })}>
                <option value="near_field">Headset / close microphone</option>
                <option value="far_field">Room / speakerphone</option>
                <option value="off">No noise reduction</option>
              </select>
            </label>
            <RealtimeInputSettings selected={realtime.settings.microphoneId || ''} disabled={realtimeActive}
              onChange={microphoneId => realtime.setSettings?.({ ...realtime.settings!, microphoneId })} />
            {realtime.testMicrophone && <button type="button" disabled={realtimeActive}
              onClick={() => void realtime.testMicrophone?.()}>Test microphone locally</button>}
            {!realtimeActive && realtime.snapshot.inputStatus && <small role="status">{realtime.snapshot.inputStatus}</small>}
            {realtimeActive && <small>Using: {realtime.snapshot.microphoneLabel || 'System default'}
              <meter aria-label="Live microphone level" min={0} max={1} value={realtime.snapshot.inputLevel || 0} />
              {realtime.snapshot.inputWarning}</small>}
            <label>
              <input type="checkbox" aria-label="Voice diagnostic logging" disabled={realtimeActive}
                checked={!!realtime.settings.diagnostics}
                onChange={event => realtime.setSettings?.({ ...realtime.settings!, diagnostics: event.target.checked })} />
              Voice diagnostics (events only, no conversation text)
            </label>
            <label>
              Realtime model
              <select aria-label="Realtime model" disabled={realtimeActive} value={realtime.settings.model}
                onChange={event => realtime.setSettings?.({ ...realtime.settings!, model: event.target.value as RealtimeSettings['model'] })}>
                {REALTIME_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
            <label>
              Reasoning effort
              <select aria-label="Reasoning effort" disabled={realtimeActive || !supportsRealtimeEffort(realtime.settings.model)} value={realtime.settings.effort}
                onChange={event => realtime.setSettings?.({ ...realtime.settings!, effort: event.target.value as RealtimeSettings['effort'] })}>
                {REALTIME_EFFORTS.map(effort => <option key={effort} value={effort}>{effort === 'default' ? 'Provider default' : effort}</option>)}
              </select>
            </label>
            <small>{realtimeActive
              ? 'Stop live voice to change the next call. The current model and effort stay fixed.'
              : 'Saved for this connection. Higher effort may take longer and cost more. Applies to the next call.'}</small>
          </>
        )}
        </details>
        {stats && realtimeActive && (
          <div className="pet-realtime-meter" title="Selected whole-message session context sent to live voice">
            <span>
              {stats.messages} messages · ~{stats.estimatedTokens.toLocaleString()} context tokens
            </span>
            <span>
              {stats.totalTokens.toLocaleString()} live tokens
              {stats.liveUpdateCount ? ` · ${stats.liveUpdateCount} updates` : ''}
            </span>
            {(stats.truncatedItems > 0 || stats.omittedCharacters > 0) && (
              <small>
                Bounded: {stats.truncatedItems} clipped item{stats.truncatedItems === 1 ? '' : 's'}
                {stats.omittedCharacters
                  ? ` · ${stats.omittedCharacters.toLocaleString()} characters omitted`
                  : ''}
              </small>
            )}
          </div>
        )}
        {stats?.billing && <RealtimeCostMeter usage={stats.billing} />}
        {realtime.snapshot.hermesDraftStatus !== 'idle' && (
          <section className="pet-realtime-hermes-draft" aria-label="Review Hermes request" ref={reviewRef}>
            {realtime.snapshot.workerTarget && <small>Steer worker: {realtime.snapshot.workerTarget}</small>}
            <header>
              <strong>Review Hermes request</strong>
              <small>
                {realtime.snapshot.hermesDraftStatus === 'sent'
                  ? realtime.snapshot.workerTarget ? 'Steering queued, delivery not yet confirmed' : 'Submitted to Hermes'
                  : 'Nothing is sent until you approve it'}
              </small>
            </header>
            <textarea
              aria-label="Hermes request draft"
              disabled={
                realtime.snapshot.hermesDraftStatus === 'submitting' ||
                realtime.snapshot.hermesDraftStatus === 'sent'
              }
              onChange={event => realtime.updateHermesDraft(event.target.value)}
              rows={3}
              value={realtime.snapshot.hermesDraft}
            />
            <div>
              {realtime.snapshot.hermesDraftStatus !== 'sent' && (
                <button
                  disabled={
                    !realtime.snapshot.hermesDraft.trim() ||
                    realtime.snapshot.hermesDraftStatus === 'submitting'
                  }
                  onClick={() => void realtime.approveHermesDraft()}
                  type="button"
                >
                  {realtime.snapshot.hermesDraftStatus === 'submitting'
                    ? 'Sending…'
                    : 'Send to Hermes'}
                </button>
              )}
              <button onClick={realtime.cancelHermesDraft} type="button">
                {realtime.snapshot.hermesDraftStatus === 'sent' ? 'Dismiss' : 'Cancel'}
              </button>
            </div>
          </section>
        )}
        {showContext && (
          <div className="pet-realtime-inspector">
            <header>
              <strong>What live voice can see</strong>
              <span>Redacted, bounded, session-scoped</span>
            </header>
            <div className="pet-realtime-inspector-list">
              {realtime.snapshot.contextPreview.slice(-5).map((item, index) => (
                <article key={`context-${index}-${item.role}`}>
                  <small>
                    {item.role === 'user' ? 'User' : 'Hermes'}
                    {item.source && item.source !== 'conversation'
                      ? ` · ${item.source.replace('_', ' ')}`
                      : ''}
                  </small>
                  <p>{item.content}</p>
                </article>
              ))}
              {realtime.snapshot.commentary.slice(-4).map(item => (
                <article key={`commentary-${item.id}`}>
                  <small>Pet observation</small>
                  <p>{item.text}</p>
                </article>
              ))}
              {realtime.snapshot.activity.slice(-6).map(item => (
                <details key={`activity-${item.activityId}`}>
                  <summary>
                    <span>{item.name}</span>
                    <small>{item.status}{item.truncated ? ' · bounded' : ''}</small>
                  </summary>
                  {item.arguments && <pre>{`Arguments:\n${item.arguments}`}</pre>}
                  {item.result && <pre>{`Result:\n${item.result}`}</pre>}
                </details>
              ))}
              {!realtime.snapshot.contextPreview.length &&
                !realtime.snapshot.commentary.length &&
                !realtime.snapshot.activity.length && (
                  <p className="pet-realtime-inspector-empty">
                    Start live voice to load the attached session snapshot.
                  </p>
                )}
            </div>
          </div>
        )}
        {realtime.snapshot.error && (
          <p className="pet-sidechat-error" role="alert">{realtime.snapshot.error}</p>
        )}
        {error && <p className="pet-sidechat-error">{error}</p>}
        {(busy || transcribing) && (
          <div className="pet-sidechat-status" role="status">
            <span />
            {busy ? `${name} is thinking…` : 'Transcribing…'}
          </div>
        )}
        {realtimeActive && realtime.snapshot.inputWarning && <p role="status" className="pet-realtime-input-warning">{realtime.snapshot.inputWarning}</p>}
        </div>
        <div className="pet-sidechat-composer">
          <textarea
            aria-label={`Message ${name}`}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder={`Talk to ${name}…`}
            rows={1}
            value={draft}
          />
          <button
            aria-label={microphoneLabel}
            className={`pet-sidechat-icon-button pet-sidechat-mic ${
              recording ? 'recording' : ''
            }`}
            disabled={busy || !voiceRecordingAvailable}
            onClick={onToggleRecording}
            title={microphoneLabel}
            type="button"
          >
            <MicrophoneIcon recording={recording} />
          </button>
          <button
            aria-label={`Send message to ${name}`}
            className="pet-sidechat-icon-button pet-sidechat-send"
            disabled={busy || !draft.trim()}
            onClick={() => void submit()}
            title="Send"
            type="button"
          >
            <SendIcon />
          </button>
        </div>
      </section>
    </div>
  )
}
