import { useRef, useState } from 'react'
import { SUPPORT_VOICE_ACTIONS, type SupportVoiceReview as Review } from '../support-voice'

export function SupportVoiceReview({ review, onApprove, onCancel }: {
  review: Review
  onApprove: (text: string) => Promise<void>
  onCancel: () => void
}) {
  const [text, setText] = useState(review.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  return <section className="support-voice-review" aria-label="Review voice action">
    <strong>{SUPPORT_VOICE_ACTIONS[review.action]}</strong>
    <small>{review.title} · {review.targetId}</small>
    <small>Nothing has run. Review and edit before approval. Never posts to Discord.</small>
    <textarea aria-label="Reviewed support action text" value={text} maxLength={20000}
      disabled={busy} onChange={event => setText(event.target.value)} rows={3} />
    {error && <p role="alert">{error}</p>}
    <div className="support-heading-actions">
      <button disabled={busy} type="button" onClick={() => {
        if (submitting.current) return
        submitting.current = true
        setBusy(true)
        void onApprove(text).catch(reason => setError(String(reason instanceof Error ? reason.message : reason)))
          .finally(() => { submitting.current = false; setBusy(false) })
      }}>{busy ? 'Submitting...' : 'Approve action'}</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </section>
}
