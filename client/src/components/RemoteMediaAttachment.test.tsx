import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { PreviewDocument } from '../preview'
import {
  RemoteMediaAttachment,
  RemoteTextAttachment,
} from './RemoteMediaAttachment'

describe('RemoteMediaAttachment', () => {
  test('loads with a private filename instead of exposing the host path', () => {
    const html = renderToStaticMarkup(
      <RemoteMediaAttachment
        path="C:\\Users\\person\\private\\notes.md"
        transport={null}
      />,
    )

    expect(html).toContain('Generated file')
    expect(html).toContain('Loading notes.md')
    expect(html).not.toContain('C:\\Users')
  })

  test('text preview actions accept the same document used by Reader', () => {
    const document = {
      binary: false,
      byteSize: 42,
      kind: 'text',
      mimeType: 'text/markdown',
      name: 'notes.md',
      path: '/work/notes.md',
      text: '# Notes',
      truncated: false,
    } satisfies PreviewDocument

    const html = renderToStaticMarkup(
      <RemoteTextAttachment
        document={document}
        downloading={false}
        error=""
        onDownload={() => {}}
        onOpenPreviewer={() => {}}
        onOpenReader={() => {}}
        transportAvailable
      />,
    )

    expect(html).toContain('# Notes')
    expect(html).toContain('42 bytes')
    expect(html).toContain('Download')
    expect(html).toContain('Open preview')
    expect(html).toContain('Open in Reader')
    expect(html).not.toContain('/work/notes.md')
  })
})
