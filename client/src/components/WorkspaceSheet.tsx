import { useCallback, useEffect, useState } from 'react'
import type { HermesTransport } from '../transport/hermes-transport'

interface DirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
}

interface FileListResponse {
  entries?: DirectoryEntry[]
  error?: string
}

interface WorkspaceSheetProps {
  applyLabel?: string
  connected: boolean
  currentPath: string
  description?: string
  eyebrow?: string
  open: boolean
  stacked?: boolean
  transport: HermesTransport | null
  title?: string
  onApply: (path: string) => Promise<void>
  onClose: () => void
}

function parentPath(path: string): string {
  const clean = path.replace(/[\\/]+$/, '')
  if (/^[A-Za-z]:$/.test(clean)) return `${clean}\\`
  const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  if (index < 0) return clean
  if (index === 0) return clean[0]
  if (index === 2 && /^[A-Za-z]:/.test(clean)) {
    return `${clean.slice(0, 2)}\\`
  }
  return clean.slice(0, index)
}

export function WorkspaceSheet({
  applyLabel = 'Use this folder',
  connected,
  currentPath,
  description = 'This directory is used by terminal and file tools in this session, and as the default for new conversations on this connection.',
  eyebrow = 'Session cwd',
  onApply,
  onClose,
  open,
  stacked = false,
  title = 'Choose workspace',
  transport,
}: WorkspaceSheetProps) {
  const [path, setPath] = useState(currentPath)
  const [pathInput, setPathInput] = useState(currentPath)
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const loadDirectory = useCallback(
    async (target: string) => {
      if (!connected || !transport) return
      setLoading(true)
      setError('')
      try {
        let resolved = target.trim()
        if (!resolved) {
          const fallback = await transport.requestJson<{ cwd?: string }>(
            '/api/fs/default-cwd',
          )
          resolved = String(fallback.cwd || '')
        }
        const result = await transport.requestJson<FileListResponse>(
          `/api/fs/list?path=${encodeURIComponent(resolved)}`,
        )
        if (result.error) throw new Error(result.error)
        setPath(resolved)
        setPathInput(resolved)
        setEntries(
          (result.entries ?? []).filter(entry => entry.isDirectory),
        )
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        )
      } finally {
        setLoading(false)
      }
    },
    [connected, transport],
  )

  useEffect(() => {
    if (!open) return
    setPath(currentPath)
    setPathInput(currentPath)
    void loadDirectory(currentPath)
  }, [currentPath, loadDirectory, open])

  if (!open) return null

  return (
    <div
      className={`sheet-backdrop ${stacked ? 'stacked-sheet-backdrop' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <section
        aria-label="Choose session workspace"
        aria-modal="true"
        className="workspace-sheet"
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <div className="workspace-sheet-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button aria-label="Close workspace picker" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="section-help">{description}</p>
        <form
          className="file-path-bar"
          onSubmit={event => {
            event.preventDefault()
            void loadDirectory(pathInput)
          }}
        >
          <button
            aria-label="Parent directory"
            disabled={!path || loading}
            type="button"
            onClick={() => void loadDirectory(parentPath(path))}
          >
            ↑
          </button>
          <input
            aria-label="Workspace path"
            value={pathInput}
            onChange={event => setPathInput(event.target.value)}
          />
          <button disabled={loading} type="submit">
            Go
          </button>
        </form>
        {error && <p className="inline-error">{error}</p>}
        <div className="workspace-directory-list">
          {loading && entries.length === 0 ? (
            <p className="file-empty">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="file-empty">No child folders here.</p>
          ) : (
            entries.map(entry => (
              <button
                className="file-row"
                key={entry.path}
                onClick={() => void loadDirectory(entry.path)}
              >
                <span aria-hidden="true">▰</span>
                <span>{entry.name}</span>
                <small>Folder</small>
              </button>
            ))
          )}
        </div>
        <div className="workspace-sheet-actions">
          <button className="quiet-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={applying || !path.trim()}
            onClick={() => {
              setApplying(true)
              setError('')
              void onApply(path)
                .then(onClose)
                .catch(applyError =>
                  setError(
                    applyError instanceof Error
                      ? applyError.message
                      : String(applyError),
                  ),
                )
                .finally(() => setApplying(false))
            }}
          >
            {applying ? 'Applying…' : applyLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
