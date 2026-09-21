import { describe, expect, test } from 'vitest'
import { normalizeMathDelimiters } from './markdown-math'

describe('LaTeX delimiter normalization', () => {
  test('leaves code, links, escaped delimiters and existing math byte-identical', () => {
    for (const source of [
      '`\\[x\\]`', '~~~tex\n\\[x\\]\n~~~', '    \\[x\\]',
      '[docs](https://synthetic.invalid/\\(x\\))',
      String.raw`\\[literal\\]`, String.raw`$\text{\[literal\]}$`,
      String.raw`$$\text{\(literal\)}$$`,
    ]) expect(normalizeMathDelimiters(source)).toBe(source)
  })

  test('does not consume an unfinished expression or plain brackets', () => {
    for (const source of ['[a, b]', String.raw`before \[x`, String.raw`\(x\]`]) {
      expect(normalizeMathDelimiters(source)).toBe(source)
    }
  })

  test('recognizes a closing delimiter after a streaming update', () => {
    const prefix = String.raw`\[\frac{a}{b}`
    expect(normalizeMathDelimiters(prefix)).toBe(prefix)
    expect(normalizeMathDelimiters(prefix + String.raw`\]`)).toBe('$$\n\\frac{a}{b}\n$$')
  })
})
