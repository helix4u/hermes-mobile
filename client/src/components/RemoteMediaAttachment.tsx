import { useCallback, useEffect, useState } from 'react'
import {
  previewMediaInfo,
  previewName,
  type PreviewDocument,
} from '../preview'
import {
  loadRemotePreview,
  peekRemotePreview,
  remotePreviewCacheKey,
} from '../remote-preview-cache'
import type { HermesTransport } from '../transport/hermes-transport'
import { ImagePreview } from './ImageViewer'

interface RemoteMediaAttachmentProps {
  connectionId?: string
  onOpenPreviewer?: (document: PreviewDocument) => void
  onOpenReader?: (document: PreviewDocument) => void
  path: string
  transport: HermesTransport | null
}

interface RemoteTextAttachmentProps {
  document: PreviewDocument
  downloading: boolean
  error: string
  onDownload: () => void
  onOpenPreviewer?: (document: PreviewDocument) => void
  onOpenReader?: (document: PreviewDocument) => void
  transportAvailable: boolean
}

function safeLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/\b413\b|too large|size limit|maximum/i.test(message)) {
    return 'This file is too large for inline preview. Use Download instead.'
  }
  return 'Could not load this file from the connected Hermes host.'
}

function directRemoteDocument(path: string): PreviewDocument | null {
  if (!/^https?:\/\//i.test(path)) return null
  const media = previewMediaInfo(path)
  if (!media) return null
  return {
    binary: true,
    dataUrl: path,
    kind: media.kind,
    mimeType: media.mimeType,
    name: previewName(path),
    path,
    text: '',
    truncated: false,
  }
}

export function RemoteTextAttachment({
  document,
  downloading,
  error,
  onDownload,
  onOpenPreviewer,
  onOpenReader,
  transportAvailable,
}: RemoteTextAttachmentProps) {
  return (
    <span className="markdown-media remote-media-attachment remote-text-attachment">
      <span className="remote-media-heading">
        <span className="remote-file-title">
          <small>{document.name}</small>
          <span>
            {document.mimeType || document.language || 'Text document'}
            {typeof document.byteSize === 'number'
              ? ` · ${document.byteSize.toLocaleString()} bytes`
              : ''}
          </span>
        </span>
        <button
          className="quiet-button"
          disabled={downloading || !transportAvailable}
          type="button"
          onClick={onDownload}
        >
          {downloading ? 'Downloading…' : 'Download'}
        </button>
      </span>
      <span className="remote-text-preview" tabIndex={0}>
        {document.text ? (
          <span className="remote-text-plain">{document.text}</span>
        ) : (
          'This text file is empty.'
        )}
      </span>
      {document.truncated && (
        <span className="remote-file-note">
          Inline preview truncated by the host.
        </span>
      )}
      <span className="remote-media-actions">
        {onOpenPreviewer && (
          <button
            className="quiet-button"
            type="button"
            onClick={() => onOpenPreviewer(document)}
          >
            Open preview
          </button>
        )}
        {onOpenReader && (
          <button
            className="quiet-button"
            type="button"
            onClick={() => onOpenReader(document)}
          >
            Open in Reader
          </button>
        )}
      </span>
      {error && <span className="remote-media-error">{error}</span>}
    </span>
  )
}

export function RemoteMediaAttachment({
  connectionId = '',
  onOpenPreviewer,
  onOpenReader,
  path,
  transport,
}: RemoteMediaAttachmentProps) {
  const scopeId = connectionId || transport?.connection.id || ''
  const cacheKey = remotePreviewCacheKey(scopeId, path)
  const direct = directRemoteDocument(path)
  const cached = direct || peekRemotePreview(scopeId, path)
  const effectiveTransport =
    transport && (!scopeId || transport.connection.id === scopeId)
      ? transport
      : null
  const [preview, setPreview] = useState<{
    document: PreviewDocument | null
    key: string
  }>(() => ({ document: cached, key: cacheKey }))
  const document = preview.key === cacheKey ? preview.document : cached
  const [error, setError] = useState(() =>
    direct || cached || effectiveTransport
      ? ''
      : 'Reconnect to load this generated file.',
  )
  const [loading, setLoading] = useState(
    () => !direct && !cached && Boolean(effectiveTransport),
  )
  const [downloading, setDownloading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const name = previewName(path)

  useEffect(() => {
    let cancelled = false
    const directDocument = directRemoteDocument(path)
    if (directDocument) {
      setPreview({ document: directDocument, key: cacheKey })
      setError('')
      setLoading(false)
      return () => {
        cancelled = true
      }
    }
    const cachedDocument = peekRemotePreview(scopeId, path)
    if (cachedDocument && attempt === 0) {
      setPreview({ document: cachedDocument, key: cacheKey })
      setError('')
      setLoading(false)
      return () => {
        cancelled = true
      }
    }
    if (!effectiveTransport) {
      setPreview(current =>
        current.key === cacheKey && current.document
          ? current
          : { document: cachedDocument, key: cacheKey },
      )
      setError(
        cachedDocument ? '' : 'Reconnect to load this generated file.',
      )
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    setPreview(current =>
      current.key === cacheKey && current.document
        ? current
        : { document: cachedDocument, key: cacheKey },
    )
    setError('')
    setLoading(!cachedDocument)
    void loadRemotePreview(
      effectiveTransport,
      scopeId,
      path,
      attempt > 0,
    )
      .then(result => {
        if (!cancelled) setPreview({ document: result, key: cacheKey })
      })
      .catch(loadError => {
        if (!cancelled) setError(safeLoadError(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt, cacheKey, effectiveTransport, path, scopeId])

  const download = useCallback(async () => {
    if (!effectiveTransport) return
    setDownloading(true)
    setError('')
    try {
      await effectiveTransport.downloadFile(
        path,
        name,
        document?.mimeType || previewMediaInfo(path)?.mimeType,
      )
    } catch {
      setError('Could not download this file from the connected Hermes host.')
    } finally {
      setDownloading(false)
    }
  }, [document?.mimeType, effectiveTransport, name, path])

  if (loading) {
    return (
      <span className="markdown-media remote-media-status">
        <small>Generated file</small>
        <span>Loading {name}…</span>
      </span>
    )
  }

  if (document?.kind === 'image' && document.dataUrl) {
    return (
      <span className="markdown-media remote-media-attachment">
        <span className="remote-media-heading">
          <small>{name}</small>
          <button
            className="quiet-button"
            disabled={downloading || !effectiveTransport}
            type="button"
            onClick={() => void download()}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </span>
        <ImagePreview alt={name} src={document.dataUrl} />
        {error && <span className="remote-media-error">{error}</span>}
      </span>
    )
  }

  if (document?.kind === 'audio' && document.dataUrl) {
    return (
      <span className="markdown-media remote-media-attachment">
        <span className="remote-media-heading">
          <small>{name}</small>
          <button
            className="quiet-button"
            disabled={downloading || !effectiveTransport}
            type="button"
            onClick={() => void download()}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </span>
        <audio controls preload="metadata" src={document.dataUrl}>
          This device cannot play this audio format.
        </audio>
      </span>
    )
  }

  if (document?.kind === 'video' && document.dataUrl) {
    return (
      <span className="markdown-media remote-media-attachment">
        <span className="remote-media-heading">
          <small>{name}</small>
          <button
            className="quiet-button"
            disabled={downloading || !effectiveTransport}
            type="button"
            onClick={() => void download()}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </span>
        <video controls playsInline preload="metadata" src={document.dataUrl}>
          This device cannot play this video format.
        </video>
      </span>
    )
  }

  if (document?.kind === 'text' && !document.binary) {
    return (
      <RemoteTextAttachment
        document={document}
        downloading={downloading}
        error={error}
        onDownload={() => void download()}
        onOpenPreviewer={onOpenPreviewer}
        onOpenReader={onOpenReader}
        transportAvailable={Boolean(effectiveTransport)}
      />
    )
  }

  return (
    <span className="markdown-media remote-media-status">
      <small>{name}</small>
      <span>{error || 'This file does not have an inline preview.'}</span>
      <span className="remote-media-actions">
        <button
          className="quiet-button"
          type="button"
          onClick={() => setAttempt(value => value + 1)}
        >
          Retry
        </button>
        <button
          className="quiet-button"
          disabled={downloading || !effectiveTransport}
          type="button"
          onClick={() => void download()}
        >
          {downloading ? 'Downloading…' : 'Download'}
        </button>
      </span>
    </span>
  )
}
