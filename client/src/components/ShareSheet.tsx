import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionSummary } from '../protocol/types'
import {
  canSendSharedContent,
  type ShareDestination,
} from '../state/share'
import type { BrowserConnection } from '../transport/browser-transport'
import type { SharedContent } from '../transport/native-bridge'

interface ShareSheetProps {
  activeConnection: BrowserConnection
  activeSessionId: string
  busy: boolean
  connected: boolean
  connections: BrowserConnection[]
  defaultWorkspace: string
  sessions: SessionSummary[]
  share: SharedContent | null
  shareWorkspace: string
  onChooseWorkspace: () => void
  onClose: () => void
  onConnection: (connection: BrowserConnection) => Promise<boolean>
  onSend: (destination: ShareDestination) => Promise<void>
}

function connectionChoices(
  current: BrowserConnection,
  saved: BrowserConnection[],
): BrowserConnection[] {
  const choices = new Map(saved.map(connection => [connection.id, connection]))
  if (current.baseUrl) choices.set(current.id, current)
  return [...choices.values()]
}

export function ShareSheet({
  activeConnection,
  activeSessionId,
  busy,
  connected,
  connections,
  defaultWorkspace,
  onChooseWorkspace,
  onClose,
  onConnection,
  onSend,
  sessions,
  share,
  shareWorkspace,
}: ShareSheetProps) {
  const choices = useMemo(
    () => connectionChoices(activeConnection, connections),
    [activeConnection, connections],
  )
  const [targetId, setTargetId] = useState(activeConnection.id)
  const [sessionId, setSessionId] = useState(activeSessionId || 'new')
  const [text, setText] = useState('')
  const [switching, setSwitching] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const sendingRef = useRef(false)

  useEffect(() => {
    if (!share) return
    setTargetId(activeConnection.id)
    setSessionId(activeSessionId || 'new')
    setText(share.text || '')
    setSwitching(false)
    setSending(false)
    sendingRef.current = false
    setError('')
  }, [share?.id])

  if (!share) return null

  const destination: ShareDestination = {
    connectionId: targetId,
    sessionId,
    cwd: shareWorkspace || defaultWorkspace,
    text,
  }
  const targetReady =
    connected && activeConnection.id === targetId && !switching
  const canSend = canSendSharedContent(
    share,
    destination,
    activeConnection.id,
    targetReady,
  )

  async function selectConnection(connectionId: string) {
    setTargetId(connectionId)
    setSessionId('new')
    const target = choices.find(connection => connection.id === connectionId)
    if (!target) return
    setSwitching(true)
    setError('')
    try {
      const ok = await onConnection(target)
      if (!ok) setError(`Could not connect to ${target.name || 'Hermes'}.`)
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : String(connectionError),
      )
    } finally {
      setSwitching(false)
    }
  }

  async function send() {
    if (sendingRef.current || !canSend) return
    sendingRef.current = true
    setSending(true)
    setError('')
    try {
      await onSend(destination)
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : String(sendError),
      )
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <div className="sheet-backdrop share-backdrop">
      <section
        aria-label="Send to Hermes"
        aria-modal="true"
        className="share-sheet"
        role="dialog"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">Android share</p>
            <h2>Send to Hermes</h2>
          </div>
          <button
            aria-label="Cancel shared content"
            className="icon-button"
            disabled={sending}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="share-content-summary">
          <span aria-hidden="true">{share.kind === 'image' ? '▣' : '↗'}</span>
          <div>
            <strong>
              {share.kind === 'image'
                ? share.name || 'Shared image'
                : 'Shared text or link'}
            </strong>
            <small>{share.mimeType}</small>
          </div>
        </div>

        <label className="share-field">
          <span>Remote target</span>
          <select
            disabled={busy || switching || sending}
            value={targetId}
            onChange={event => void selectConnection(event.target.value)}
          >
            {choices.map(connection => (
              <option key={connection.id} value={connection.id}>
                {connection.name || 'Hermes host'} · {connection.connectionType}
              </option>
            ))}
          </select>
        </label>

        {!targetReady ? (
          <div className="share-target-waiting">
            <p>
              {switching
                ? 'Connecting to the selected Hermes target…'
                : 'Connect the selected target before choosing a session.'}
            </p>
            {!switching && targetId === activeConnection.id && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void selectConnection(targetId)}
              >
                Connect target
              </button>
            )}
          </div>
        ) : (
          <>
            <label className="share-field">
              <span>Conversation</span>
              <select
                disabled={sending}
                value={sessionId}
                onChange={event => setSessionId(event.target.value)}
              >
                <option value="new">New conversation</option>
                {sessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.title || session.preview || 'Untitled session'}
                  </option>
                ))}
              </select>
            </label>

            {sessionId === 'new' && (
              <div className="share-workspace">
                <span>New session workspace</span>
                <code>{destination.cwd || 'Choose a directory'}</code>
                <button
                  className="quiet-button"
                  disabled={sending}
                  onClick={onChooseWorkspace}
                >
                  Choose directory
                </button>
              </div>
            )}
          </>
        )}

        <label className="share-field share-message">
          <span>Message</span>
          <textarea
            disabled={sending}
            placeholder={
              share.kind === 'image'
                ? 'Add a message about this image (optional)'
                : 'Shared text or link'
            }
            rows={5}
            value={text}
            onChange={event => setText(event.target.value)}
          />
        </label>

        {error && <p className="inline-error">{error}</p>}

        <div className="share-actions">
          <button
            className="quiet-button"
            disabled={sending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!canSend || sending}
            onClick={() => void send()}
          >
            {sending ? 'Sending…' : 'Send to Hermes'}
          </button>
        </div>
      </section>
    </div>
  )
}
