import { describe, expect, test } from 'vitest'
import {
  isMarkdownDocument,
  previewMediaInfo,
  previewName,
  type PreviewDocument,
} from './preview'

describe('file preview helpers', () => {
  test('classifies native media by extension without confusing text files', () => {
    expect(previewMediaInfo('/work/render.MP4')).toEqual({
      kind: 'video',
      mimeType: 'video/mp4',
    })
    expect(previewMediaInfo('/work/phone-recording.3gp')).toEqual({
      kind: 'video',
      mimeType: 'video/3gpp',
    })
    expect(previewMediaInfo('/work/podcast.m4b')).toEqual({
      kind: 'audio',
      mimeType: 'audio/mp4',
    })
    expect(previewMediaInfo('/work/camera-export.m4v')).toEqual({
      kind: 'video',
      mimeType: 'video/x-m4v',
    })
    expect(previewMediaInfo('C:\\audio\\voice.wav')?.kind).toBe('audio')
    expect(previewMediaInfo('/work/image.webp')?.kind).toBe('image')
    expect(previewMediaInfo('/work/README.md')).toBeNull()
  })

  test('recognizes Markdown documents and portable file names', () => {
    const document = {
      binary: false,
      kind: 'text',
      mimeType: 'text/plain',
      name: 'README.md',
      path: 'C:\\repo\\README.md',
      text: '# Hello',
      truncated: false,
    } satisfies PreviewDocument

    expect(previewName(document.path)).toBe('README.md')
    expect(isMarkdownDocument(document)).toBe(true)
  })
})
