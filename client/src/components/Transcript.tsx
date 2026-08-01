import { useEffect, useState } from 'react'
import { writeClipboardText } from '../clipboard'
import { displayTextForMediaMarkers } from '../media-markers'
import type { PreviewDocument } from '../preview'
import {
  formatDisplayValue,
  type RequestTranscriptData,
  type TranscriptItem,
} from '../state/transcript'
import type { HermesTransport } from '../transport/hermes-transport'
import type { VoicePhase } from '../voice'
import { MarkdownContent } from './MarkdownContent'

export type ToolDetailMode = 'hidden' | 'collapsed' | 'expanded'

interface TranscriptProps {
  items: TranscriptItem[]
  activeSpeechId: string
  connectionId: string
  toolDetailMode: ToolDetailMode
  transport?: HermesTransport | null
  voicePhase: VoicePhase
  onOpenDocumentPreviewer?: (document: PreviewDocument) => void
  onOpenDocumentReader?: (document: PreviewDocument) => void
  onSpeak: (
    text: string,
    itemId: string,
    kind: TranscriptItem['kind'],
  ) => void
  onRespond: (
    request: RequestTranscriptData,
    value: string,
  ) => Promise<void>
}

function compactToolValue(value: unknown): string {
  const text = formatDisplayValue(value).replace(/\s+/g, ' ').trim()
  if (text.length <= 320) return text
  return `${text.slice(0, 317)}…`
}

function ToolCard({
  detailMode,
  item,
}: {
  detailMode: ToolDetailMode
  item: TranscriptItem
}) {
  const tool = item.tool
  const [open, setOpen] = useState(detailMode === 'expanded')
  useEffect(() => {
    setOpen(detailMode === 'expanded')
  }, [detailMode])
  if (!tool) return null

  const hasDetails =
    tool.args !== undefined ||
    tool.result !== undefined ||
    tool.inlineDiff ||
    tool.progress ||
    tool.findings?.length
  const canInspect = Boolean(hasDetails && detailMode !== 'hidden')
  const showDetails = detailMode !== 'hidden' && open
  const showMissingDetail =
    !hasDetails && detailMode === 'expanded'
  const emptyDetail =
    tool.status === 'running'
      ? 'Waiting for live tool details…'
      : tool.status === 'failed'
        ? 'This tool failed before Hermes supplied input or output details.'
        : 'This historical tool row did not retain its input or output. New live tool calls stay detailed while the connection is active.'
  const statusLabel =
    tool.status === 'running'
      ? 'Running'
      : tool.status === 'failed'
        ? 'Failed'
        : 'Completed'
  const summaryText =
    tool.summary ||
    tool.context ||
    tool.progress ||
    `${statusLabel} ${tool.name || 'Hermes tool'}`

  const summary = (
    <>
      <span className="tool-status-dot" aria-hidden="true" />
      <span className="tool-summary-copy">
        <strong>{tool.name || 'Hermes tool'}</strong>
        <small>{summaryText}</small>
      </span>
      <span className={`tool-status-label tool-status-${tool.status}`}>
        {statusLabel}
      </span>
      {typeof tool.durationSeconds === 'number' && (
        <span className="tool-duration">
          {tool.durationSeconds.toFixed(1)}s
        </span>
      )}
      {canInspect && (
        <span className="disclosure-glyph">{open ? '−' : '+'}</span>
      )}
    </>
  )

  return (
    <article
      className={[
        'tool-card',
        `tool-${tool.status}`,
        `tool-card-${detailMode}`,
        open ? 'tool-card-open' : 'tool-card-closed',
      ].join(' ')}
    >
      {canInspect ? (
        <button
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Inspect'} ${tool.name || 'Hermes tool'} details`}
          className="tool-summary"
          type="button"
          onClick={() => setOpen(current => !current)}
        >
          {summary}
        </button>
      ) : (
        <div className="tool-summary tool-summary-static">{summary}</div>
      )}

      {detailMode === 'collapsed' && !open && (
        <div className="tool-collapsed-preview">
          {tool.progress && (
            <p>
              <span>Progress</span>
              {compactToolValue(tool.progress)}
            </p>
          )}
          {tool.args !== undefined && (
            <p>
              <span>Input</span>
              {compactToolValue(tool.args)}
            </p>
          )}
          {tool.result !== undefined && (
            <p>
              <span>Output</span>
              {compactToolValue(tool.result)}
            </p>
          )}
          {!hasDetails && <p className="tool-collapsed-empty">{emptyDetail}</p>}
          {canInspect && (
            <small className="tool-collapsed-action">
              Tap the card header to inspect the full tool call
            </small>
          )}
        </div>
      )}

      {tool.risk && (
        <div className={`tool-risk risk-${tool.risk}`}>
          Output risk: {tool.risk}
          {tool.redacted ? ' (sensitive output redacted)' : ''}
        </div>
      )}

      {(showDetails || showMissingDetail) && (
        <div
          aria-label={`${tool.name || 'Hermes tool'} details`}
          className="tool-details"
          role="region"
          tabIndex={0}
        >
          {tool.progress && (
            <section>
              <h4>Progress</h4>
              <pre>{tool.progress}</pre>
            </section>
          )}
          {tool.args !== undefined && (
            <section>
              <h4>Input</h4>
              <pre>{formatDisplayValue(tool.args)}</pre>
            </section>
          )}
          {tool.result !== undefined && (
            <section>
              <h4>Output</h4>
              <pre>{formatDisplayValue(tool.result)}</pre>
            </section>
          )}
          {tool.inlineDiff && (
            <section>
              <h4>Changes</h4>
              <pre className="diff-output">{tool.inlineDiff}</pre>
            </section>
          )}
          {!!tool.findings?.length && (
            <section>
              <h4>Risk findings</h4>
              <ul>
                {tool.findings.map(finding => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
            </section>
          )}
          {showMissingDetail && (
            <p className="tool-details-empty">{emptyDetail}</p>
          )}
        </div>
      )}
    </article>
  )
}

function ReasoningBlock({ item }: { item: TranscriptItem }) {
  return (
    <details className="reasoning-block" open={item.streaming || undefined}>
      <summary>
        <span className="reasoning-spark" aria-hidden="true">
          ✦
        </span>
        Thinking
        {item.streaming && <span className="live-label">live</span>}
      </summary>
      <MarkdownContent className="reasoning-markdown">
        {item.text || ''}
      </MarkdownContent>
    </details>
  )
}

function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await writeClipboardText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      aria-label={copied ? 'Response copied' : 'Copy response'}
      className={`copy-message-button ${copied ? 'copied' : ''}`}
      type="button"
      onClick={() => void copy()}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function RequestCard({
  request,
  onRespond,
}: {
  request: RequestTranscriptData
  onRespond: TranscriptProps['onRespond']
}) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const masked = request.kind === 'sudo' || request.kind === 'secret'

  async function respond(nextValue = value) {
    if (!nextValue && request.kind !== 'approval') return
    setSending(true)
    try {
      await onRespond(request, nextValue)
      setValue('')
    } finally {
      setSending(false)
    }
  }

  return (
    <article className="request-card">
      <span className="request-label">Needs {request.kind}</span>
      <MarkdownContent className="request-markdown">
        {request.question}
      </MarkdownContent>
      {request.answered ? (
        <span className="request-resolved">Answered</span>
      ) : request.kind === 'approval' ? (
        <div className="request-actions">
          <button
            className="primary-button"
            disabled={sending}
            onClick={() => void respond('approve')}
          >
            Approve
          </button>
          <button
            className="danger-button"
            disabled={sending}
            onClick={() => void respond('deny')}
          >
            Deny
          </button>
        </div>
      ) : request.choices.length > 0 ? (
        <div className="request-actions request-choices">
          {request.choices.map(choice => (
            <button
              className="quiet-button"
              disabled={sending}
              key={choice}
              onClick={() => void respond(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="request-input"
          onSubmit={event => {
            event.preventDefault()
            void respond()
          }}
        >
          <input
            autoComplete="off"
            placeholder={masked ? 'Value is sent once and not retained' : 'Answer'}
            type={masked ? 'password' : 'text'}
            value={value}
            onChange={event => setValue(event.target.value)}
          />
          <button
            className="primary-button"
            disabled={sending || !value}
            type="submit"
          >
            Send
          </button>
        </form>
      )}
    </article>
  )
}

function dismissedPetStorageKey(connectionId: string): string {
  return `hermes-mobile.pet-commentary-hidden.v1.${connectionId || 'default'}`
}

function loadDismissedPetIds(connectionId: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const value = JSON.parse(
      localStorage.getItem(dismissedPetStorageKey(connectionId)) || '[]',
    )
    return new Set(
      Array.isArray(value)
        ? value.filter(item => typeof item === 'string').slice(-200)
        : [],
    )
  } catch {
    return new Set()
  }
}

export function Transcript({
  activeSpeechId,
  connectionId,
  items,
  onOpenDocumentPreviewer,
  onOpenDocumentReader,
  onRespond,
  onSpeak,
  toolDetailMode,
  transport = null,
  voicePhase,
}: TranscriptProps) {
  const [dismissedPetIds, setDismissedPetIds] = useState<Set<string>>(() =>
    loadDismissedPetIds(connectionId),
  )

  useEffect(() => {
    setDismissedPetIds(loadDismissedPetIds(connectionId))
  }, [connectionId])

  const dismissPet = (itemId: string) => {
    setDismissedPetIds(current => {
      const next = new Set(current)
      next.add(itemId)
      const bounded = [...next].slice(-200)
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(
            dismissedPetStorageKey(connectionId),
            JSON.stringify(bounded),
          )
        } catch {
          // Dismissal remains effective for this view when storage is unavailable.
        }
      }
      return new Set(bounded)
    })
  }

  if (items.length === 0) {
    return (
      <div className="thread-empty">
        <img
          alt="Nous"
          className="brand-glyph"
          src="./nous-sidecar-128.png"
        />
        <h3>Hermes, wherever you are.</h3>
        <p>The work stays on the selected host. This phone is the control surface.</p>
      </div>
    )
  }

  return (
    <>
      {items.map(item => {
        if (item.kind === 'pet' && dismissedPetIds.has(item.id)) return null
        if (item.kind === 'tool') {
          return (
            <ToolCard
              detailMode={toolDetailMode}
              item={item}
              key={item.id}
            />
          )
        }
        if (item.kind === 'reasoning') {
          return <ReasoningBlock item={item} key={item.id} />
        }
        if (item.kind === 'request' && item.request) {
          return (
            <RequestCard
              key={item.id}
              request={item.request}
              onRespond={onRespond}
            />
          )
        }
        const speaking =
          activeSpeechId === item.id &&
          (voicePhase === 'speaking' || voicePhase === 'synthesizing')
        return (
          <article className={`message message-${item.kind}`} key={item.id}>
            <div className="message-label-row">
              <span>
                {item.kind === 'event'
                  ? 'Hermes'
                  : item.kind === 'pet'
                    ? item.pet?.personalityName || 'Pet commentary'
                    : item.kind}
              </span>
              <div className="message-actions">
                {(item.kind === 'assistant' || item.kind === 'pet') &&
                  item.text &&
                  !item.streaming && (
                  <button
                    aria-label={speaking ? 'Stop reading response' : 'Read response aloud'}
                    className={`speak-button ${speaking ? 'active' : ''}`}
                    onClick={() => onSpeak(item.text || '', item.id, item.kind)}
                  >
                    {speaking
                      ? voicePhase === 'synthesizing'
                        ? 'Preparing…'
                        : 'Stop'
                      : 'Listen'}
                  </button>
                )}
                {item.text && !item.streaming && (
                  <MessageCopyButton
                    text={displayTextForMediaMarkers(item.text)}
                  />
                )}
                {item.kind === 'pet' && !item.streaming && (
                  <button
                    aria-label="Dismiss pet note"
                    className="pet-dismiss-button"
                    onClick={() => {
                      if (speaking) onSpeak(item.text || '', item.id, item.kind)
                      dismissPet(item.id)
                    }}
                    type="button"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
            {item.kind === 'event' ? (
              <p>{item.text}</p>
            ) : (
              <MarkdownContent
                onOpenDocumentPreviewer={onOpenDocumentPreviewer}
                onOpenDocumentReader={onOpenDocumentReader}
                resolveMediaMarkers={!item.streaming}
                transport={transport}
              >
                {item.text || ''}
              </MarkdownContent>
            )}
          </article>
        )
      })}
    </>
  )
}
