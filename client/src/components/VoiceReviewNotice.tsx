interface VoiceReviewNoticeProps {
  pending: boolean
  supportPending: boolean
  onReview: () => void
  onSupportReview: () => void
}

export function VoiceReviewNotice({ pending, supportPending, onReview, onSupportReview }: VoiceReviewNoticeProps) {
  if (!pending && !supportPending) return null
  return <aside className="voice-review-notice" role="status" aria-label="Voice approval waiting">
    <span>Voice request needs review.</span>
    {pending && <button type="button" onClick={onReview}>Review Hermes request</button>}
    {supportPending && <button type="button" onClick={onSupportReview}>Review Support action</button>}
  </aside>
}
