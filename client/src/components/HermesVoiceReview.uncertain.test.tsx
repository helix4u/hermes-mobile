import type { ReactNode, ReactPortal } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HermesVoiceReview } from './HermesVoiceReview'
import { HermesRequestReviews } from '../hermes-request-reviews'

const portals = vi.hoisted(() => [] as ReactPortal[])

vi.mock('react-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (children: ReactNode, container: Element | DocumentFragment, key?: string | null) => {
      // Exercise the real portal constructor and retain its actual children.
      // React's server renderer cannot render a portal object directly.
      portals.push(actual.createPortal(children, container, key))
      return null
    },
  }
})

beforeEach(() => {
  portals.length = 0
  // A valid element target for React's actual portal constructor. No DOM
  // effects, application windows, browser or extra CI dependency is involved.
  vi.stubGlobal('document', { body: { nodeType: 1 } })
})

afterEach(() => {
  portals.length = 0
  vi.unstubAllGlobals()
})

function renderReview(uncertain: boolean) {
  const root = renderToStaticMarkup(<HermesVoiceReview text="Synthetic reviewed request" busy={false} uncertain={uncertain}
    error={uncertain ? 'Delivery not confirmed' : undefined}
    onEdit={vi.fn()} onApprove={vi.fn(async () => false)} onCancel={vi.fn()} />)
  expect(root).toBe('')
  expect(portals).toHaveLength(1)
  expect(portals[0]).toMatchObject({
    $$typeof: Symbol.for('react.portal'),
    containerInfo: document.body,
  })
  const html = renderToStaticMarkup(portals[0].children)
  expect(html).toContain('<dialog')
  expect(html).toContain('voice-review-dialog')
  expect(html).toContain('Review Hermes request')
  return html
}

it('renders an unconfirmed review through its existing portal without a reexecution button or false unsent claim', () => {
  const html = renderReview(true)
  expect(html).toContain('Delivery is unconfirmed')
  expect(html).toContain('Dismiss review')
  expect(html).not.toContain('Send to Hermes')
  expect(html).not.toContain('Nothing is sent until approved')
})

it('keeps the ordinary review Send and Cancel actions through the same portal fixture', () => {
  const html = renderReview(false)
  expect(html).toContain('Send to Hermes')
  expect(html).toContain('Nothing is sent until approved')
  expect(html).toContain('Cancel')
  expect(html).not.toContain('Dismiss review')
})

it('renders the multi-request dialog through the existing portal with a target/status summary for Later', () => {
  let next = 0
  const reviews = new HermesRequestReviews(() => `synthetic-review-${++next}`)
  const target = { connectionId: 'host', profile: 'writer', sessionId: 'session', generation: 1,
    targetTitle: 'Synthetic task', workerId: '', delegationLimitSupported: true }
  reviews.add('First question', target)
  reviews.add('Another message', target)
  const props = { requests: reviews.requests, selectedRequestId: reviews.selectedRequestId,
    onSelect: vi.fn(), onAdd: vi.fn(), onEditRequest: vi.fn(), onApproveRequest: vi.fn(async () => true), onCancelRequest: vi.fn() }
  const element = HermesVoiceReview(props)
  expect(element.props.summary).toBe('Hermes request 2 of 2. Synthetic task. Unsent.')
  expect(renderToStaticMarkup(element)).toBe('')
  expect(portals).toHaveLength(1)
  const html = renderToStaticMarkup(portals[0].children)
  expect(html).toContain('Review Hermes request')
  expect(html).toContain('Request being reviewed')
  expect(html).toContain('Active request 2 of 2. Unsent.')
  expect(html).toContain('Request ID synthetic-review-2')
  expect(html).toContain('Add another request')
})
