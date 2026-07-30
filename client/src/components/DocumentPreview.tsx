import { isMarkdownDocument, type PreviewDocument } from '../preview'
import { MarkdownContent } from './MarkdownContent'
import { ImagePreview } from './ImageViewer'

export type DocumentMode = 'edit' | 'preview'

interface DocumentPreviewProps {
  content: string
  document: PreviewDocument
  downloading?: boolean
  mode: DocumentMode
  savedContent: string
  saving?: boolean
  onClose?: () => void
  onContentChange: (content: string) => void
  onDownload: () => void
  onModeChange: (mode: DocumentMode) => void
  onOpenPreviewer?: () => void
  onOpenReader?: () => void
  onSave: () => void
}

function DocumentBody({
  content,
  document,
  mode,
  onContentChange,
}: Pick<
  DocumentPreviewProps,
  'content' | 'document' | 'mode' | 'onContentChange'
>) {
  if (document.kind === 'image' && document.dataUrl) {
    return <ImagePreview alt={document.name} src={document.dataUrl} />
  }

  if (document.kind === 'audio' && document.dataUrl) {
    return (
      <div className="native-media-preview audio-preview">
        <div className="media-art" aria-hidden="true">
          ♪
        </div>
        <audio controls preload="metadata" src={document.dataUrl}>
          This device cannot play this audio format.
        </audio>
      </div>
    )
  }

  if (document.kind === 'video' && document.dataUrl) {
    return (
      <div className="native-media-preview video-preview">
        <video controls playsInline preload="metadata" src={document.dataUrl}>
          This device cannot play this video format.
        </video>
      </div>
    )
  }

  if (document.kind === 'file' || document.binary) {
    return (
      <div className="empty-panel">
        <h2>No inline preview</h2>
        <p>This file can still be downloaded to your device.</p>
      </div>
    )
  }

  if (mode === 'edit') {
    return (
      <textarea
        aria-label="File content"
        className="document-editor"
        spellCheck={false}
        value={content}
        onChange={event => onContentChange(event.target.value)}
      />
    )
  }

  return isMarkdownDocument(document) ? (
    <div className="document-markdown-preview">
      <MarkdownContent>{content}</MarkdownContent>
    </div>
  ) : (
    <pre className="file-text-preview">{content}</pre>
  )
}

export function DocumentPreview({
  content,
  document,
  downloading = false,
  mode,
  onClose,
  onContentChange,
  onDownload,
  onModeChange,
  onOpenPreviewer,
  onOpenReader,
  onSave,
  savedContent,
  saving = false,
}: DocumentPreviewProps) {
  const editable =
    document.kind === 'text' && !document.binary && !document.truncated
  const dirty = content !== savedContent

  return (
    <section className="file-preview">
      <div className="file-preview-heading">
        <div>
          <strong>{document.name}</strong>
          <small>
            {document.language || document.mimeType || document.kind}
            {typeof document.byteSize === 'number'
              ? ` · ${document.byteSize.toLocaleString()} bytes`
              : ''}
            {document.truncated ? ' · preview truncated' : ''}
          </small>
        </div>
        <div className="file-preview-actions">
          <button
            className="quiet-button"
            disabled={downloading}
            type="button"
            onClick={onDownload}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
          {onOpenPreviewer && (
            <button
              className="quiet-button"
              type="button"
              onClick={onOpenPreviewer}
            >
              Open in Previewer
            </button>
          )}
          {onOpenReader && document.kind === 'text' && (
            <button
              className="quiet-button"
              type="button"
              onClick={onOpenReader}
            >
              Open in Reader
            </button>
          )}
          {onClose && (
            <button
              aria-label="Close file"
              className="icon-button"
              type="button"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {document.kind === 'text' && (
        <div className="file-mode-tabs" role="tablist">
          <button
            aria-selected={mode === 'preview'}
            className={mode === 'preview' ? 'active' : ''}
            role="tab"
            type="button"
            onClick={() => onModeChange('preview')}
          >
            Preview
          </button>
          <button
            aria-selected={mode === 'edit'}
            className={mode === 'edit' ? 'active' : ''}
            disabled={!editable}
            role="tab"
            type="button"
            onClick={() => onModeChange('edit')}
          >
            Edit{dirty ? ' · unsaved' : ''}
          </button>
        </div>
      )}

      <DocumentBody
        content={content}
        document={document}
        mode={mode}
        onContentChange={onContentChange}
      />

      {document.kind === 'text' && mode === 'edit' && (
        <div className="file-editor-actions">
          <button
            className="quiet-button"
            disabled={!dirty}
            type="button"
            onClick={() => onContentChange(savedContent)}
          >
            Revert
          </button>
          <button
            className="primary-button"
            disabled={!editable || saving || !dirty}
            type="button"
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </section>
  )
}
