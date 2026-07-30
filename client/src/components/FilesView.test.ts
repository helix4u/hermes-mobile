import { describe, expect, test, vi } from 'vitest'
import { revealFilePreview } from './FilesView'

describe('Files selected preview visibility', () => {
  test('moves the newly opened document to the visible start of the file scroller', () => {
    const scrollIntoView = vi.fn()
    revealFilePreview({ scrollIntoView })

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
  })
})
