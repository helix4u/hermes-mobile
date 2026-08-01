import {
  Children,
  isValidElement,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { writeClipboardText } from '../clipboard'
import { detectEmbed, RichEmbed } from '../embeds'
import { safeMarkdownUrl } from '../markdown'
import {
  mediaPathFromHref,
  renderMediaMarkers,
} from '../media-markers'
import { previewMediaInfo, type PreviewDocument } from '../preview'
import type { HermesTransport } from '../transport/hermes-transport'
import { ImagePreview } from './ImageViewer'
import { RemoteMediaAttachment } from './RemoteMediaAttachment'

interface MarkdownContentProps {
  children: string
  className?: string
  connectionId?: string
  onOpenDocumentPreviewer?: (document: PreviewDocument) => void
  onOpenDocumentReader?: (document: PreviewDocument) => void
  resolveMediaMarkers?: boolean
  transport?: HermesTransport | null
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

function MediaPlayer({
  kind,
  name,
  src,
}: {
  kind: 'audio' | 'video'
  name: string
  src: string
}) {
  return (
    <span className={`markdown-media markdown-${kind}`}>
      <small>{name}</small>
      {kind === 'audio' ? (
        <audio controls preload="metadata" src={src}>
          This device cannot play this audio format.
        </audio>
      ) : (
        <video controls playsInline preload="metadata" src={src}>
          This device cannot play this video format.
        </video>
      )}
    </span>
  )
}

export function MarkdownContent({
  children,
  className = '',
  connectionId = '',
  onOpenDocumentPreviewer,
  onOpenDocumentReader,
  resolveMediaMarkers = false,
  transport = null,
}: MarkdownContentProps) {
  const renderedChildren = resolveMediaMarkers
    ? renderMediaMarkers(children)
    : children
  const renderContext = useRef({
    connectionId,
    onOpenDocumentPreviewer,
    onOpenDocumentReader,
    transport,
  })
  renderContext.current = {
    connectionId,
    onOpenDocumentPreviewer,
    onOpenDocumentReader,
    transport,
  }
  const components = useMemo<Components>(
    () => ({
      a({ href, children: linkChildren, ...props }) {
        const safeHref = safeMarkdownUrl(href)
        if (!safeHref) return <span>{linkChildren}</span>
        const remoteMediaPath = mediaPathFromHref(safeHref)
        if (remoteMediaPath) {
          const context = renderContext.current
          return (
            <RemoteMediaAttachment
              connectionId={context.connectionId}
              key={`${context.connectionId}:${remoteMediaPath}`}
              onOpenPreviewer={context.onOpenDocumentPreviewer}
              onOpenReader={context.onOpenDocumentReader}
              path={remoteMediaPath}
              transport={context.transport}
            />
          )
        }
        const label = nodeText(linkChildren).trim()
        const isBareLink = label === safeHref
        const media = previewMediaInfo(safeHref)
        if (
          isBareLink &&
          media &&
          (media.kind === 'audio' || media.kind === 'video')
        ) {
          return (
            <MediaPlayer
              kind={media.kind}
              name={safeHref.split('/').pop() || media.kind}
              src={safeHref}
            />
          )
        }
        const embed = isBareLink ? detectEmbed(safeHref) : null
        if (embed) return <RichEmbed descriptor={embed} />
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
      img({ src, alt }) {
        const safeSrc = safeMarkdownUrl(src, true)
        if (!safeSrc) return alt ? <span>[{alt}]</span> : null
        const media = previewMediaInfo(safeSrc)
        if (media && (media.kind === 'audio' || media.kind === 'video')) {
          return (
            <MediaPlayer
              kind={media.kind}
              name={alt || safeSrc.split('/').pop() || media.kind}
              src={safeSrc}
            />
          )
        }
        return <ImagePreview alt={alt || ''} showHint={false} src={safeSrc} />
      },
      pre({ children: codeChildren }) {
        return <CodeBlock>{codeChildren}</CodeBlock>
      },
      hr() {
        // CLI presentation separators are not transcript content. Rendering
        // them as rules made live activity look like empty placeholder rows.
        return null
      },
    }),
    [],
  )

  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {renderedChildren}
      </ReactMarkdown>
    </div>
  )
}
