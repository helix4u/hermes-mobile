import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { HermesVoiceRequests, type HermesVoiceRequestsProps } from './HermesVoiceReview'
import { HermesRequestReviews } from '../hermes-request-reviews'

function fixture() {
  let next = 0
  const reviews = new HermesRequestReviews(() => `review-${++next}`)
  const target = { connectionId: 'synthetic-host', profile: 'writer', sessionId: 'synthetic-session',
    generation: 1, targetTitle: 'Synthetic task', workerId: '', delegationLimitSupported: true }
  const a = reviews.add('Quick answer', target)
  const b = reviews.add('Long-running investigation', target)
  const props: HermesVoiceRequestsProps = { requests: reviews.requests, selectedRequestId: b.requestId,
    onSelect: vi.fn(), onAdd: vi.fn(), onEditRequest: vi.fn(), onApproveRequest: vi.fn(async () => true), onCancelRequest: vi.fn() }
  return { reviews, a, b, target, props }
}
function render(props: HermesVoiceRequestsProps) { return renderToStaticMarkup(createElement(HermesVoiceRequests, props)) }
function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const element = node as ReactElement<Record<string, any>>
  return [element, ...elements(element.props.children)]
}

it('renders independent selectable messages with exact active ID, target, profile and status', () => {
  const { props, b } = fixture()
  const html = render(props)
  expect(html).toContain('aria-label="Request being reviewed"')
  expect(html).toContain('<option value="review-1">')
  expect(html).toContain('<option value="review-2" selected="">')
  expect(html).toContain('Active request 2 of 2. Unsent.')
  expect(html).toContain(`Request ID ${b.requestId}`)
  expect(html).toContain('Session synthetic-session. Profile writer.')
  expect(html).toContain('full Hermes agent')
  expect(html).toContain('quick answer')
  expect(html).toContain('long-running work')
  expect(html).toContain('Add another request')
  expect(html).toContain('not a backend queue')
  expect(html).not.toContain('Queue for later')
})

it('the visible Send, Cancel, edit and selection handlers carry the exact rendered ID, not a queue head', async () => {
  const { props, b } = fixture()
  const tree = elements(HermesVoiceRequests(props))
  const send = tree.find(node => node.type === 'button' && node.props.children === 'Send to Hermes')!
  const cancel = tree.find(node => node.type === 'button' && node.props.children === 'Cancel')!
  const add = tree.find(node => node.type === 'button' && node.props.children === 'Add another request')!
  const text = tree.find(node => node.props['aria-label'] === 'Hermes request draft')!
  const select = tree.find(node => node.type === 'select')!
  text.props.onChange({ target: { value: 'Edited second' } })
  select.props.onChange({ target: { value: 'review-1' } })
  // Captured callbacks still address the card the user actually pressed.
  send.props.onClick()
  cancel.props.onClick()
  add.props.onClick()
  expect(props.onEditRequest).toHaveBeenCalledExactlyOnceWith(b.requestId, 'Edited second')
  expect(props.onApproveRequest).toHaveBeenCalledExactlyOnceWith(b.requestId)
  expect(props.onCancelRequest).toHaveBeenCalledExactlyOnceWith(b.requestId)
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('review-1')
  expect(props.onAdd).toHaveBeenCalledOnce()
})

it('renders an uncertain exact request without edit/reexecution or a false unsent claim', () => {
  const { reviews, b, target, props } = fixture()
  const operation = reviews.begin(b.requestId)!
  reviews.settle(b.requestId, operation.owner, target, 'uncertain', 'Synthetic receipt unavailable')
  const html = render({ ...props, requests: reviews.requests })
  expect(html).toContain('Active request 2 of 2. Delivery unconfirmed.')
  expect(html).toContain('Check session status before sending again')
  expect(html).toContain('Synthetic receipt unavailable')
  expect(html).toContain('Dismiss review')
  expect(html).not.toContain('Send to Hermes')
  expect(html).not.toContain('Nothing is sent until approved')
  expect(html).toContain('disabled=""')
})

it('an in-flight request disables its own cancel while allowing another request to be added or selected', () => {
  const { reviews, b, props } = fixture()
  reviews.begin(b.requestId)
  const tree = elements(HermesVoiceRequests({ ...props, requests: reviews.requests }))
  expect(tree.find(node => node.type === 'button' && node.props.children === 'Cancel')?.props.disabled).toBe(true)
  expect(tree.find(node => node.type === 'button' && node.props.children === 'Add another request')?.props.disabled).toBeUndefined()
  expect(tree.find(node => node.type === 'select')?.props.disabled).toBeUndefined()
  expect(render({ ...props, requests: reviews.requests })).toContain('Other unsent messages are not sent')
})

it('renders a sent receipt as acceptance, never completion or cancellation of backend work', () => {
  const { reviews, b, target, props } = fixture()
  const operation = reviews.begin(b.requestId)!
  reviews.settle(b.requestId, operation.owner, target, 'sent')
  const html = render({ ...props, requests: reviews.requests })
  expect(html).toContain('Accepted, not completed')
  expect(html).toContain('Dismissing does not cancel work')
  expect(html).not.toContain('Send to Hermes')
  expect(html).toContain('Read session activity for progress')
})

it('an empty new message cannot be approved but keeps its own editable review', () => {
  const { reviews, target, props } = fixture()
  const empty = reviews.add('', target)
  const tree = elements(HermesVoiceRequests({ ...props, requests: reviews.requests, selectedRequestId: empty.requestId }))
  expect(tree.find(node => node.type === 'button' && node.props.children === 'Send to Hermes')?.props.disabled).toBe(true)
  expect(tree.find(node => node.props['aria-label'] === 'Hermes request draft')?.props.disabled).toBe(false)
})
