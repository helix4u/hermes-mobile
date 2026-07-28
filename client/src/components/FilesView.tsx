import { useCallback, useEffect, useState } from 'react'
import type { HermesTransport } from '../transport/hermes-transport'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

interface FileListResponse {
  entries?: FileEntry[]
  error?: string
}

interface FileTextResponse {
  binary?: boolean
  byteSize?: number
  language?: string
  mimeType?: string
  path?: string
  text?: string
  truncated?: boolean
}

interface FilesViewProps {
  connected: boolean
  connectionId: string
  initialPath: string
  transport: HermesTransport | null
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

export function FilesView({
  connected,
  connectionId,
  initialPath,
  transport,
}: FilesViewProps) {
  const [path, setPath] = useState(() =>
    typeof window === 'undefined'
      ? initialPath
      : window.localStorage.getItem(fileStateKey(connectionId)) || initialPath,
  )
  const [pathInput, setPathInput] = useState(path)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<FileTextResponse | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadDirectory = useCallback(
    async (targetPath: string) => {
      if (!transport || !connected) return
      setLoading(true)
      setError('')
      setSelected(null)
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
        if (result.error) throw new Error(`Could not open ${resolved}: ${result.error}`)
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
    if (connected) void loadDirectory(stored)
  }, [connected, connectionId, initialPath, loadDirectory])

  async function openFile(entry: FileEntry) {
    if (!transport) return
    setLoading(true)
    setError('')
    try {
      const result = await transport.requestJson<FileTextResponse>(
        `/api/fs/read-text?path=${encodeURIComponent(entry.path)}`,
      )
      setSelected(result)
      setContent(result.text ?? '')
      setSavedContent(result.text ?? '')
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError))
    } finally {
      setLoading(false)
    }
  }

  async function saveFile() {
    if (!transport || !selected?.path || selected.binary) return
    setSaving(true)
    setError('')
    try {
      await transport.requestJson('/api/fs/write-text', {
        path: selected.path,
        content,
      })
      setSavedContent(content)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="files-screen">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1>Files</h1>
        </div>
        <button
          className="quiet-button"
          disabled={!connected || loading}
          onClick={() => void loadDirectory(path)}
        >
          Refresh
        </button>
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
              <button
                className="file-row"
                key={entry.path}
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
            ))
          )}
        </section>

        {selected && (
          <section className="file-preview">
            <div className="file-preview-heading">
              <div>
                <strong>{selected.path?.split(/[\\/]/).pop()}</strong>
                <small>
                  {selected.language || selected.mimeType || 'text'}
                  {typeof selected.byteSize === 'number'
                    ? ` · ${selected.byteSize.toLocaleString()} bytes`
                    : ''}
                  {selected.truncated ? ' · preview truncated' : ''}
                </small>
              </div>
              <button
                className="primary-button"
                disabled={
                  saving ||
                  selected.binary ||
                  selected.truncated ||
                  content === savedContent
                }
                onClick={() => void saveFile()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {selected.binary ? (
              <div className="empty-panel">
                <h2>Binary preview</h2>
                <p>This file is not editable as text on mobile.</p>
              </div>
            ) : (
              <textarea
                aria-label="File content"
                spellCheck={false}
                value={content}
                onChange={event => setContent(event.target.value)}
              />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
