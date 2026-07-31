import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPreviewDocument, type PreviewDocument } from '../preview'
import type { HermesTransport } from '../transport/hermes-transport'
import { DocumentPreview, type DocumentMode } from './DocumentPreview'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

interface FileListResponse {
  entries?: FileEntry[]
  error?: string
}

interface FilesViewProps {
  connected: boolean
  connectionId: string
  initialPath: string
  transport: HermesTransport | null
  onOpenInPreviewer: (document: PreviewDocument) => void
  onOpenInReader: (document: PreviewDocument) => void
  onUseAsWorkspace: (path: string) => Promise<void>
}

function parentPath(path: string): string {
  const clean = path.replace(/[\\/]+$/, '')
  if (/^[A-Za-z]:$/.test(clean)) return `${clean}\\`
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  if (index < 0) return clean
  if (index === 0) return clean[0]
  if (index === 2 && /^[A-Za-z]:/.test(clean)) return `${clean.slice(0, 2)}\\`
  return clean.slice(0, index)
}

function fileStateKey(connectionId: string): string {
  return `hermes-mobile.files.${connectionId}.path`
}

export function revealFilePreview(
  preview: Pick<HTMLElement, 'scrollIntoView'> | null,
): void {
  preview?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

export function FilesView({
  connected,
  connectionId,
  initialPath,
  onOpenInPreviewer,
  onOpenInReader,
  onUseAsWorkspace,
  transport,
}: FilesViewProps) {
  const [path, setPath] = useState(() =>
    typeof window === 'undefined'
      ? initialPath
      : window.localStorage.getItem(fileStateKey(connectionId)) || initialPath,
  )
  const [pathInput, setPathInput] = useState(path)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<PreviewDocument | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [downloadingPath, setDownloadingPath] = useState('')
  const [applyingWorkspace, setApplyingWorkspace] = useState(false)
  const [previewMode, setPreviewMode] = useState<DocumentMode>('preview')
  const [error, setError] = useState('')
  const previewRef = useRef<HTMLDivElement | null>(null)

  const loadDirectory = useCallback(
    async (
      targetPath: string,
      options: { preservePreview?: boolean } = {},
    ) => {
      if (!transport || !connected) return
      setLoading(true)
      setError('')
      if (!options.preservePreview) setSelected(null)
      try {
        let resolved = targetPath.trim()
        if (!resolved) {
          const fallback = await transport.requestJson<{ cwd?: string }>(
            '/api/fs/default-cwd',
          )
          resolved = String(fallback.cwd || '')
        }
        const result = await transport.requestJson<FileListResponse>(
          `/api/fs/list?path=${encodeURIComponent(resolved)}`,
        )
        if (result.error)
          throw new Error(`Could not open ${resolved}: ${result.error}`)
        setPath(resolved)
        setPathInput(resolved)
        setEntries(result.entries ?? [])
        window.localStorage.setItem(fileStateKey(connectionId), resolved)
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        )
      } finally {
        setLoading(false)
      }
    },
    [connected, connectionId, transport],
  )

  useEffect(() => {
    const stored =
      window.localStorage.getItem(fileStateKey(connectionId)) || initialPath
    setPath(stored)
    setPathInput(stored)
    setEntries([])
    setSelected(null)
    setContent('')
    setSavedContent('')
    setError('')
  }, [connectionId, initialPath])

  useEffect(() => {
    if (connected) void loadDirectory(path, { preservePreview: true })
    // Reconnecting refreshes the directory without clearing an already-open
    // preview. Directory navigation still closes the old document explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connectionId, transport])

  useEffect(() => {
    if (!selected) return
    const frame = window.requestAnimationFrame(() => {
      revealFilePreview(previewRef.current)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selected])

  async function openFile(entry: FileEntry) {
    if (!transport) return
    setLoading(true)
    setError('')
    try {
      const result = await loadPreviewDocument(transport, entry.path)
      setSelected(result)
      setContent(result.text)
      setSavedContent(result.text)
      setPreviewMode('preview')
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : String(openError),
      )
    } finally {
      setLoading(false)
    }
  }

  async function saveFile() {
    if (!transport || !selected?.path || selected.kind !== 'text') return
    setSaving(true)
    setError('')
    try {
      await transport.requestJson('/api/fs/write-text', {
        path: selected.path,
        content,
      })
      setSavedContent(content)
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      )
    } finally {
      setSaving(false)
    }
  }

  async function downloadFile(
    filePath: string,
    filename: string,
    mimeType?: string,
  ) {
    if (!transport) return
    setDownloadingPath(filePath)
    setError('')
    try {
      await transport.downloadFile(filePath, filename, mimeType)
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : String(downloadError),
      )
    } finally {
      setDownloadingPath('')
    }
  }

  return (
    <div className="files-screen">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1>Files</h1>
        </div>
        <div className="file-heading-actions">
          <button
            className="quiet-button"
            disabled={!connected || !path || applyingWorkspace}
            onClick={() => {
              setApplyingWorkspace(true)
              setError('')
              void onUseAsWorkspace(path)
                .catch(workspaceError =>
                  setError(
                    workspaceError instanceof Error
                      ? workspaceError.message
                      : String(workspaceError),
                  ),
                )
                .finally(() => setApplyingWorkspace(false))
            }}
          >
            {applyingWorkspace ? 'Applying…' : 'Use as cwd'}
          </button>
          <button
            className="quiet-button"
            disabled={!connected || loading}
            onClick={() => void loadDirectory(path)}
          >
            Refresh
          </button>
        </div>
      </div>

      <form
        className="file-path-bar"
        onSubmit={event => {
          event.preventDefault()
          void loadDirectory(pathInput)
        }}
      >
        <button
          aria-label="Parent directory"
          disabled={!connected || !path}
          type="button"
          onClick={() => void loadDirectory(parentPath(path))}
        >
          ↑
        </button>
        <input
          aria-label="Directory path"
          value={pathInput}
          onChange={event => setPathInput(event.target.value)}
        />
        <button disabled={!connected} type="submit">
          Go
        </button>
      </form>

      {error && <p className="inline-error">{error}</p>}

      <div className="file-browser">
        <section className="file-list" aria-label="Directory contents">
          {loading && entries.length === 0 ? (
            <p className="file-empty">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="file-empty">This directory is empty.</p>
          ) : (
            entries.map(entry => (
              <div className="file-row-shell" key={entry.path}>
                <button
                  className="file-row"
                  onClick={() =>
                    entry.isDirectory
                      ? void loadDirectory(entry.path)
                      : void openFile(entry)
                  }
                >
                  <span aria-hidden="true">
                    {entry.isDirectory ? '▰' : '▤'}
                  </span>
                  <span>{entry.name}</span>
                  <small>{entry.isDirectory ? 'Folder' : 'File'}</small>
                </button>
                {!entry.isDirectory && (
                  <button
                    aria-label={`Download ${entry.name}`}
                    className="file-download-button"
                    disabled={downloadingPath === entry.path}
                    onClick={() => void downloadFile(entry.path, entry.name)}
                  >
                    {downloadingPath === entry.path ? '…' : '↓'}
                  </button>
                )}
              </div>
            ))
          )}
        </section>

        {selected && (
          <div ref={previewRef}>
            <DocumentPreview
              content={content}
              document={selected}
              downloading={downloadingPath === selected.path}
              mode={previewMode}
              savedContent={savedContent}
              saving={saving}
              onClose={() => setSelected(null)}
              onContentChange={setContent}
              onDownload={() =>
                void downloadFile(
                  selected.path,
                  selected.name,
                  selected.mimeType,
                )
              }
              onModeChange={setPreviewMode}
              onOpenPreviewer={() =>
                onOpenInPreviewer({ ...selected, text: content })
              }
              onOpenReader={() =>
                onOpenInReader({ ...selected, text: content })
              }
              onSave={() => void saveFile()}
            />
          </div>
        )}
      </div>
    </div>
  )
}
