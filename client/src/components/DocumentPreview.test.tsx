import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { PreviewDocument } from '../preview'
import { DocumentPreview } from './DocumentPreview'

const callbacks = {
  onContentChange: () => {},
  onDownload: () => {},
  onModeChange: () => {},
  onSave: () => {},
}

describe('Reader file preview surface', () => {
  test('renders Markdown as formatted preview with edit and reader actions', () => {
    const document = {
      binary: false,
      kind: 'text',
      mimeType: 'text/markdown',
      name: 'notes.md',
      path: '/work/notes.md',
      text: '# Notes',
      truncated: false,
    } satisfies PreviewDocument
    const html = renderToStaticMarkup(
      <DocumentPreview
        {...callbacks}
        content={document.text}
        document={document}
        mode="preview"
        savedContent={document.text}
        onOpenReader={() => {}}
      />,
    )

    expect(html).toContain('<h1>Notes</h1>')
    expect(html).toContain('Open in Reader')
    expect(html).toContain('>Edit<')
    expect(html).toContain('Download')
  })

  test('uses native media elements for audio, video, and images', () => {
    const base = {
      binary: true,
      name: 'media',
      path: '/work/media',
      text: '',
      truncated: false,
    }
    const audio = renderToStaticMarkup(
      <DocumentPreview
        {...callbacks}
        content=""
        document={{
          ...base,
          dataUrl: 'data:audio/wav;base64,AA==',
          kind: 'audio',
          mimeType: 'audio/wav',
        }}
        mode="preview"
        savedContent=""
      />,
    )
    const video = renderToStaticMarkup(
      <DocumentPreview
        {...callbacks}
        content=""
        document={{
          ...base,
          dataUrl: 'data:video/mp4;base64,AA==',
          kind: 'video',
          mimeType: 'video/mp4',
        }}
        mode="preview"
        savedContent=""
      />,
    )
    const image = renderToStaticMarkup(
      <DocumentPreview
        {...callbacks}
        content=""
        document={{
          ...base,
          dataUrl: 'data:image/png;base64,AA==',
          kind: 'image',
          mimeType: 'image/png',
        }}
        mode="preview"
        savedContent=""
      />,
    )

    expect(audio).toContain('<audio')
    expect(video).toContain('<video')
    expect(image).toContain('<img')
    expect(image).toContain('full screen')
  })
})
