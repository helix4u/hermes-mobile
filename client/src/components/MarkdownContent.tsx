import {
  Children,
  isValidElement,
  type ReactNode,
  useState,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { writeClipboardText } from '../clipboard'
import { safeMarkdownUrl } from '../markdown'

interface MarkdownContentProps {
  children: string
  className?: string
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children)
  }
  return ''
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const child = Children.only(children)
  const className = isValidElement<{ className?: string }>(child)
    ? child.props.className || ''
    : ''
  const language = className.match(/language-([\w#+.-]+)/)?.[1] || 'code'
  const text = nodeText(child).replace(/\n$/, '')

  async function copy() {
    try {
      await writeClipboardText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar">
        <span>{language}</span>
        <button type="button" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

export function MarkdownContent({
  children,
  className = '',
}: MarkdownContentProps) {
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children: linkChildren, ...props }) {
            const safeHref = safeMarkdownUrl(href)
            if (!safeHref) return <span>{linkChildren}</span>
            return (
              <a
                {...props}
                href={safeHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                {linkChildren}
              </a>
            )
          },
          img({ src, alt, ...props }) {
            const safeSrc = safeMarkdownUrl(src, true)
            if (!safeSrc) return alt ? <span>[{alt}]</span> : null
            return (
              <img
                {...props}
                alt={alt || ''}
                loading="lazy"
                referrerPolicy="no-referrer"
                src={safeSrc}
              />
            )
          },
          pre({ children: codeChildren }) {
            return <CodeBlock>{codeChildren}</CodeBlock>
          },
          hr() {
            // CLI presentation separators are not transcript content. Rendering
            // them as rules made live activity look like empty placeholder rows.
            return null
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
