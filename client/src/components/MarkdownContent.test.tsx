import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
  test('renders dollar and LaTeX delimiter math with accessible MathML', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>{String.raw`Inline \(a^2 + b^2\) and $x_1$.

\[ -\log_2 P(\text{symbol}\mid\text{history}) \]

$$
\frac{a}{b}
$$
`}</MarkdownContent>,
    )
    expect((html.match(/class="katex"/g) || []).length).toBe(4)
    expect((html.match(/class="katex-display"/g) || []).length).toBe(2)
    expect(html).toContain('<math')
    expect(html).toContain('<mfrac>')
    expect(html).not.toContain('katex-error')
  })

  test('preserves literal code and normal brackets, including unfinished streaming math', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>{'Use [a, b]. `\\(a^2\\)`\n\n~~~tex\n\\[x\\]\n~~~\n\nStill streaming \\[ \\frac{a}'}</MarkdownContent>,
    )
    expect(html).not.toContain('class="katex"')
    expect(html).toContain('[a, b]')
    expect(html).toContain('\\(a^2\\)')
    expect(html).toContain('\\[x\\]')
    expect(html).toContain('Still streaming')
  })

  test('contains invalid math without crashing and refuses trusted HTML/link commands', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>{String.raw`Before $\frac{a$ after.

$\href{javascript:alert(1)}{unsafe}$

$\includegraphics{https://synthetic.invalid/track.png}$`}</MarkdownContent>,
    )
    expect(html).toContain('katex-error')
    expect(html).toContain('Before')
    expect(html).toContain('after.')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
  })

  test('preserves blockquote containers around multiline equations', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>{'> \\[\n> x^2\n> \\]'}</MarkdownContent>,
    )
    expect(html).toContain('<blockquote>')
    expect(html).toContain('katex-display')
    expect(html).not.toContain('katex-error')
  })
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

  test('gates supported bare embeds and renders direct audio/video players', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          'https://youtu.be/dQw4w9WgXcQ\n\nhttps://cdn.example.com/voice.mp3\n\n![clip](https://cdn.example.com/demo.mp4)'
        }
      </MarkdownContent>,
    )

    expect(html).toContain('YouTube preview')
    expect(html).toContain('Load once')
    expect(html).not.toContain('<iframe')
    expect(html).toContain('<audio')
    expect(html).toContain('<video')
  })

  test('turns a completed Hermes MEDIA marker into a private inline attachment', () => {
    const path =
      'C:\\Users\\person\\AppData\\Local\\hermes\\cache\\images\\generated.png'
    const html = renderToStaticMarkup(
      <MarkdownContent resolveMediaMarkers>
        {`Here it is.\n\nMEDIA:${path}`}
      </MarkdownContent>,
    )

    expect(html).toContain('Here it is.')
    expect(html).toContain('Reconnect to load this generated file')
    expect(html).toContain('remote-media-status')
    expect(html).not.toContain('C:\\Users')
    expect(html).not.toContain('MEDIA:')
  })
})
