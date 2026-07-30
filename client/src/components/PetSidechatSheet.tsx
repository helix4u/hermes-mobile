import { useEffect, useRef, useState } from 'react'
import { MarkdownContent } from './MarkdownContent'

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
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
  busy: boolean
  error: string
  messages: SidechatMessage[]
  name: string
  open: boolean
  onClose: () => void
  onLoad: () => void
  onReset: () => void
  onSend: (text: string) => Promise<boolean>
  onSendToHermes: (text: string) => void
  onTranscriptTarget: (target: ((text: string) => void) | null) => void
  onToggleRecording: () => void
  voicePhase: string
}

export function PetSidechatSheet({
  busy,
  error,
  messages,
  name,
  onClose,
  onLoad,
  onReset,
  onSend,
  onSendToHermes,
  onToggleRecording,
  onTranscriptTarget,
  open,
  voicePhase,
}: PetSidechatSheetProps) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
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
    if (!open) return
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, open])

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

  return (
    <div className="pet-sidechat-popout" role="presentation">
      <section
        aria-label={`${name} sidechat`}
        aria-modal="false"
        className="pet-sidechat-sheet"
        role="dialog"
      >
        <header className="pet-sidechat-heading">
          <div className="pet-sidechat-identity">
            <span aria-hidden="true" className="pet-sidechat-mark">✦</span>
            <div>
              <strong>{name}</strong>
              <span>Private session sidechat</span>
            </div>
          </div>
          <div className="pet-sidechat-header-actions">
            <button
              aria-label="Clear pet sidechat history"
              className="pet-sidechat-icon-button"
              disabled={busy || messages.length === 0}
              onClick={onReset}
              title="Clear history"
              type="button"
            >
              <ClearIcon />
            </button>
            <button
              aria-label="Close pet sidechat"
              className="pet-sidechat-icon-button"
              onClick={onClose}
              title="Close"
              type="button"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="pet-sidechat-messages" ref={scrollRef}>
          {messages.length === 0 && (
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
        </div>
        {error && <p className="pet-sidechat-error">{error}</p>}
        {(busy || transcribing) && (
          <div className="pet-sidechat-status" role="status">
            <span />
            {busy ? `${name} is thinking…` : 'Transcribing…'}
          </div>
        )}
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
            disabled={busy || !['idle', 'recording'].includes(voicePhase)}
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
