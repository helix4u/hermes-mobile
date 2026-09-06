import { VoiceReviewDialog } from './VoiceReviewDialog'
import { VoiceReviewText } from './VoiceReviewText'

export function HermesVoiceReview({ text, busy, target, error, onEdit, onApprove, onCancel }: {
  text: string; busy: boolean; target?: string; error?: string
  onEdit: (text: string) => void; onApprove: () => Promise<boolean>; onCancel: () => void
}) {
  return <VoiceReviewDialog label="Review Hermes request">
    <small>{target || 'Attached Hermes session'}. Nothing is sent until approved.</small>
    <VoiceReviewText aria-label="Hermes request draft" value={text} disabled={busy}
      onChange={event => onEdit(event.target.value)} rows={3} />
    {error && <p role="alert">{error}</p>}
    <footer><button disabled={busy || !text.trim()} type="button" onClick={() => void onApprove()}>{busy ? 'Sending...' : 'Send to Hermes'}</button>
      <button disabled={busy} type="button" onClick={onCancel}>Cancel</button></footer>
  </VoiceReviewDialog>
}
