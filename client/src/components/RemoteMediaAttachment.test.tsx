import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { PreviewDocument } from '../preview'
import {
  clearRemotePreviewCacheForTests,
  loadRemotePreview,
  peekRemotePreview,
} from '../remote-preview-cache'
import type { HermesTransport } from '../transport/hermes-transport'
import {
  RemoteMediaAttachment,
  RemoteTextAttachment,
} from './RemoteMediaAttachment'

describe('RemoteMediaAttachment', () => {
  test('renders direct MP4 and audio attachments with native inline controls', () => {
    const video = renderToStaticMarkup(
      <RemoteMediaAttachment
        path="https://files.example/demo.mp4"
        transport={null}
      />,
    )
    const audio = renderToStaticMarkup(
      <RemoteMediaAttachment
        path="https://files.example/podcast.m4b"
        transport={null}
      />,
    )

    expect(video).toContain('<video')
    expect(video).toContain('playsInline=""')
    expect(video).toContain('src="https://files.example/demo.mp4"')
    expect(audio).toContain('<audio')
    expect(audio).toContain('src="https://files.example/podcast.m4b"')
  })

  test('loads with a private filename instead of exposing the host path', () => {
    const html = renderToStaticMarkup(
      <RemoteMediaAttachment
        path="C:\\Users\\person\\private\\notes.md"
        transport={null}
      />,
    )

    expect(html).toContain('notes.md')
    expect(html).toContain('Reconnect to load this generated file')
    expect(html).not.toContain('C:\\Users')
  })

  test('renders a cached attachment immediately after disconnect or remount', async () => {
    clearRemotePreviewCacheForTests()
    const transport = {
      connection: { id: 'workstation' },
      requestJson: async () => ({
        mimeType: 'text/markdown',
        text: '# Still here',
      }),
    } as unknown as HermesTransport
    await loadRemotePreview(
      transport,
      'workstation',
      'C:\\work\\notes.md',
    )
    expect(peekRemotePreview('workstation', 'C:\\work\\notes.md')?.text).toBe(
      '# Still here',
    )

    const html = renderToStaticMarkup(
      <RemoteMediaAttachment
        connectionId="workstation"
        path={'C:\\work\\notes.md'}
        transport={null}
      />,
    )

    expect(html).toContain('# Still here')
    expect(html).not.toContain('Loading')
    expect(html).not.toContain('Reconnect to load')
    clearRemotePreviewCacheForTests()
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
