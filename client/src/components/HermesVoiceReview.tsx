import type { HermesRequestReview } from '../hermes-request-reviews'
import { VoiceReviewDialog } from './VoiceReviewDialog'
import { VoiceReviewText } from './VoiceReviewText'

export interface HermesVoiceRequestsProps {
  requests: HermesRequestReview[]
  selectedRequestId: string
  onSelect: (requestId: string) => void
  onAdd: () => void
  onEditRequest: (requestId: string, text: string) => void
  onApproveRequest: (requestId: string) => Promise<boolean>
  onCancelRequest: (requestId: string) => void
}
interface SingleReviewProps {
  text: string; busy: boolean; uncertain?: boolean; target?: string; error?: string
  onEdit: (text: string) => void; onApprove: () => Promise<boolean>; onCancel: () => void
}

const statusLabels = { pending: 'Unsent', error: 'Not sent', submitting: 'Sending', uncertain: 'Delivery unconfirmed', sent: 'Accepted, not completed' }

/** Shared content for the top-layer dialog and the contained voice page. */
export function HermesVoiceRequests(props: HermesVoiceRequestsProps) {
  const active = props.requests.find(row => row.requestId === props.selectedRequestId)
  const sending = props.requests.some(row => row.status === 'submitting')
  const editable = active && ['pending', 'error'].includes(active.status)
  return <>
    <p>A full Hermes agent can give a quick answer or do long-running work. Unsent messages stay here until you approve each one.</p>
    <label>Request being reviewed
      <select aria-label="Request being reviewed" value={props.selectedRequestId} onChange={event => props.onSelect(event.target.value)}
        style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
        {props.requests.map((row, index) => <option key={row.requestId} value={row.requestId}>
          {index + 1}. {row.message.trim().slice(0, 48) || 'New message'} ({statusLabels[row.status]})
        </option>)}
      </select>
    </label>
    <button type="button" onClick={props.onAdd}>Add another request</button>
    {active && <section aria-label="Active Hermes request" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p role="status">Active request {props.requests.indexOf(active) + 1} of {props.requests.length}. {statusLabels[active.status]}.</p>
      <small>{active.targetTitle || 'Attached Hermes session'}. Session {active.sessionId}. Profile {active.profile}.
        {active.workerId && <> Worker {active.workerId}.</>} Request ID {active.requestId}. Revision {active.revision}.</small>
      <p>{active.status === 'uncertain' ? 'Delivery is unconfirmed. Check session status before sending again. Dismissing only hides this review.'
        : active.status === 'sent' ? 'Hermes accepted this request. Read session activity for progress. Dismissing does not cancel work.'
        : active.status === 'submitting' ? 'Sending this exact request. Other unsent messages are not sent.'
        : 'Nothing is sent until approved. Send refuses a busy target without interrupting its running turn. These are unsent messages, not a backend queue.'}</p>
      <VoiceReviewText aria-label="Hermes request draft" value={active.message} disabled={!editable}
        onChange={event => props.onEditRequest(active.requestId, event.target.value)} rows={3} />
      {active.error && <p role="alert">{active.error}</p>}
      <footer>{!['uncertain', 'sent'].includes(active.status) && <button type="button"
        disabled={sending || !active.message.trim()} onClick={() => void props.onApproveRequest(active.requestId)}>
        {active.status === 'submitting' ? 'Sending...' : 'Send to Hermes'}</button>}
        <button type="button" disabled={active.status === 'submitting'} onClick={() => props.onCancelRequest(active.requestId)}>
          {['uncertain', 'sent'].includes(active.status) ? 'Dismiss review' : 'Cancel'}</button></footer>
    </section>}
  </>
}

export function HermesVoiceReview(props: SingleReviewProps | HermesVoiceRequestsProps) {
  const active = 'requests' in props ? props.requests.find(row => row.requestId === props.selectedRequestId) : undefined
  const summary = active && 'requests' in props
    ? `Hermes request ${props.requests.indexOf(active) + 1} of ${props.requests.length}. ${active.targetTitle || active.sessionId}. ${statusLabels[active.status]}.`
    : undefined
  return <VoiceReviewDialog label="Review Hermes request" summary={summary}>
    {'requests' in props ? <HermesVoiceRequests {...props} /> : <>
      <small>{props.target || 'Attached Hermes session'}. {props.uncertain ? 'Delivery is unconfirmed. Check session status before sending again.' : 'Nothing is sent until approved.'}</small>
      <VoiceReviewText aria-label="Hermes request draft" value={props.text} disabled={props.busy || props.uncertain}
        onChange={event => props.onEdit(event.target.value)} rows={3} />
      {props.error && <p role="alert">{props.error}</p>}
      <footer>{!props.uncertain && <button disabled={props.busy || !props.text.trim()} type="button" onClick={() => void props.onApprove()}>{props.busy ? 'Sending...' : 'Send to Hermes'}</button>}
        <button disabled={props.busy} type="button" onClick={() => props.onCancel()}>{props.uncertain ? 'Dismiss review' : 'Cancel'}</button></footer>
    </>}
  </VoiceReviewDialog>
}
