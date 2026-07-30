import { describe, expect, test } from 'vitest'
import { markdownToSpeechText, safeMarkdownUrl } from './markdown'

describe('markdown safety and speech projection', () => {
  test('allows ordinary web and local links while rejecting active schemes', () => {
    expect(safeMarkdownUrl('https://example.com')).toBe('https://example.com')
    expect(safeMarkdownUrl('/docs/start')).toBe('/docs/start')
    expect(safeMarkdownUrl('mailto:test@example.com')).toBe(
      'mailto:test@example.com',
    )
    expect(safeMarkdownUrl('javascript:alert(1)')).toBe('')
    expect(safeMarkdownUrl('file:///private/data')).toBe('')
  })

  test('restricts embedded data URLs to common raster images', () => {
    expect(
      safeMarkdownUrl('data:image/png;base64,AAAA', true),
    ).toBe('data:image/png;base64,AAAA')
    expect(
      safeMarkdownUrl('data:image/svg+xml;base64,AAAA', true),
    ).toBe('')
  })

  test('removes formatting noise before text is sent to TTS', () => {
    expect(
      markdownToSpeechText(
        '# Result\n\n**Done.** See [the report](https://example.com).\n\n```ts\nconst ok = true\n```',
      ),
    ).toBe('Result\n\nDone. See the report.\n\nconst ok = true')
  })

  test('does not speak generated-media markers or private host paths', () => {
    expect(
      markdownToSpeechText(
        'Here is the finished image.\n\nMEDIA:C:\\Users\\person\\private\\result.png',
      ),
    ).toBe('Here is the finished image.')
  })
})
