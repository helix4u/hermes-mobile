import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { VoiceReviewNotice } from './VoiceReviewNotice'

it('keeps both review routes visible without mounting any pet chat', () => {
  const html = renderToStaticMarkup(createElement(VoiceReviewNotice, { pending: true, supportPending: true, onReview: vi.fn(), onSupportReview: vi.fn() }))
  expect(html).toContain('Review Hermes request')
  expect(html).toContain('Review Support action')
  expect(html).not.toContain('Nothing has run') // A timed-out submission has an uncertain outcome.
  expect(html).not.toContain('textarea')
})
it('takes no space with no pending approval', () => {
  expect(renderToStaticMarkup(createElement(VoiceReviewNotice, { pending: false, supportPending: false, onReview: vi.fn(), onSupportReview: vi.fn() }))).toBe('')
})
