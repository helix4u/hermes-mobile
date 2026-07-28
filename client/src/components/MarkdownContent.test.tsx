import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
  test('renders GFM structure and fenced code', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          '# Heading\n\n- [x] shipped\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst ok = true\n```'
        }
      </MarkdownContent>,
    )

    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<table>')
    expect(html).toContain('markdown-code-toolbar')
    expect(html).toContain('const ok = true')
  })

  test('drops raw HTML and does not create active-scheme links', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          '<script>alert(1)</script>\n\n[unsafe](javascript:alert(1)) [safe](https://example.com)'
        }
      </MarkdownContent>,
    )

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  test('drops CLI presentation rules instead of rendering empty lines', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>{'First block\n\n---\n\nSecond block'}</MarkdownContent>,
    )

    expect(html).toContain('First block')
    expect(html).toContain('Second block')
    expect(html).not.toContain('<hr')
  })
})
