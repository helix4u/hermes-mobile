import { useRef, useState } from 'react'
import { SUPPORT_VOICE_ACTIONS, type SupportVoiceReview as Review } from '../support-voice'
import { VoiceReviewDialog } from './VoiceReviewDialog'
import { VoiceReviewText } from './VoiceReviewText'

export function SupportVoiceReview({ review, onApprove, onCancel, onEdit, submitting = false, submissionAttempted = false }: {
  review: Review
  submitting?: boolean
  submissionAttempted?: boolean
  onApprove: (text: string) => Promise<void>
  onCancel: () => void
  onEdit: (text: string) => void
}) {
  const [text, setText] = useState(review.text)
  const [localBusy, setBusy] = useState(false)
  const busy = submitting || localBusy
  const [error, setError] = useState('')
  const buttonSubmitting = useRef(false)
  return <VoiceReviewDialog label="Review Support action"><section className="support-voice-review" aria-label="Review voice action">
    <strong>{SUPPORT_VOICE_ACTIONS[review.action]}</strong>
    <small>{review.title} · {review.targetId}</small>
    <small role="status">{busy
      ? 'Submitting this action. It cannot be edited or cancelled while the request is in flight.'
      : submissionAttempted
        ? 'Submission was not confirmed. Check current Support state before trying again.'
        : 'Nothing has run. Review and edit before approval. Never posts to Discord.'}</small>
    <VoiceReviewText aria-label="Reviewed support action text" value={text}
      disabled={busy} onChange={event => { setText(event.target.value); onEdit(event.target.value) }} rows={3} />
    {error && <p role="alert">{error}</p>}
    <div className="support-heading-actions">
      <button disabled={busy} type="button" onClick={() => {
        if (busy || buttonSubmitting.current) return
        buttonSubmitting.current = true
        setBusy(true)
        void onApprove(text).catch(reason => setError(String(reason instanceof Error ? reason.message : reason)))
          .finally(() => { buttonSubmitting.current = false; setBusy(false) })
      }}>{busy ? 'Submitting...' : 'Approve action'}</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </section></VoiceReviewDialog>
}
