import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'
import { unified } from 'unified'
import type { Nodes } from 'mdast'

const parser = unified().use(remarkParse).use(remarkMath)
const protectedTypes = new Set(['code', 'inlineCode', 'html', 'link', 'image', 'definition', 'math', 'inlineMath'])

/**
 * Accept the LaTeX delimiters commonly emitted by agents before CommonMark
 * consumes their backslashes. Markdown's parser identifies literal code and
 * links, so examples, destinations and existing dollar math remain untouched.
 * Ordinary prose takes the cheap path without a second parse.
 */
export function normalizeMathDelimiters(source: string): string {
  if (!/\\[[(]/.test(source)) return source
  const protectedRanges: [number, number][] = []
  function collect(node: Nodes) {
    if (protectedTypes.has(node.type)) {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (start !== undefined && end !== undefined) protectedRanges.push([start, end])
      return
    }
    if ('children' in node) node.children.forEach(collect)
  }
  collect(parser.parse(source))
  const escaped = (at: number) => {
    let slashes = 0
    while (at > 0 && source[--at] === '\\') slashes++
    return slashes % 2 === 1
  }
  return source.replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g, (whole, display, inline, offset: number) => {
    const end = offset + whole.length
    if (escaped(offset) || escaped(end - 2) ||
        protectedRanges.some(([start, stop]) => offset < stop && end > start)) return whole
    const body = (display ?? inline).trim()
    if (!body) return whole
    // Longer dollar fences also allow a literal dollar within a TeX expression.
    let fenceLength = 2
    for (const match of body.matchAll(/\$+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1)
    const fence = '$'.repeat(fenceLength)
    if (display === undefined) return fence + body + fence
    if (/^[ \t]*\r?\n/.test(display) && /\r?\n[^\n]*$/.test(display)) {
      return fence + display + fence
    }
    const lineStart = source.lastIndexOf('\n', offset - 1) + 1
    const prefix = source.slice(lineStart, offset)
    const atBlockStart = /^(?:[ \t]*>[ \t]*)*[ \t]*$/.test(prefix)
    const container = atBlockStart ? prefix : ''
    const nextLine = source.indexOf('\n', end)
    const trailingProse = source.slice(end, nextLine < 0 ? source.length : nextLine).trim()
    return (atBlockStart ? '' : '\n\n') + fence + '\n' + container + body +
      '\n' + container + fence + (trailingProse ? '\n\n' : '')
  })
}
