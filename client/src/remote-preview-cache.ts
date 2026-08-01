import { loadPreviewDocument, type PreviewDocument } from './preview'
import type { HermesTransport } from './transport/hermes-transport'

const MAX_CACHE_BYTES = 32 * 1024 * 1024
const MAX_ENTRY_BYTES = 16 * 1024 * 1024
const MAX_ENTRIES = 24

interface PreviewCacheEntry {
  bytes: number
  document: PreviewDocument
}

const cache = new Map<string, PreviewCacheEntry>()
const pending = new Map<string, Promise<PreviewDocument>>()
let cachedBytes = 0

export function remotePreviewCacheKey(
  connectionId: string,
  path: string,
): string {
  return `${connectionId}\u0000${path}`
}

function estimateDocumentBytes(document: PreviewDocument): number {
  return (
    document.text.length * 2 +
    (document.dataUrl?.length ?? 0) +
    document.path.length * 2 +
    document.name.length * 2
  )
}

function removeOldestEntry(): boolean {
  const key = cache.keys().next().value as string | undefined
  if (!key) return false
  const entry = cache.get(key)
  cache.delete(key)
  cachedBytes -= entry?.bytes ?? 0
  return true
}

function remember(key: string, document: PreviewDocument): void {
  const bytes = estimateDocumentBytes(document)
  const previous = cache.get(key)
  if (previous) {
    cache.delete(key)
    cachedBytes -= previous.bytes
  }
  if (bytes > MAX_ENTRY_BYTES) return
  while (
    cache.size >= MAX_ENTRIES ||
    (cache.size > 0 && cachedBytes + bytes > MAX_CACHE_BYTES)
  ) {
    if (!removeOldestEntry()) break
  }
  cache.set(key, { bytes, document })
  cachedBytes += bytes
}

export function peekRemotePreview(
  connectionId: string,
  path: string,
): PreviewDocument | null {
  if (!connectionId) return null
  const key = remotePreviewCacheKey(connectionId, path)
  const entry = cache.get(key)
  if (!entry) return null
  cache.delete(key)
  cache.set(key, entry)
  return entry.document
}

export function loadRemotePreview(
  transport: HermesTransport,
  connectionId: string,
  path: string,
  refresh = false,
): Promise<PreviewDocument> {
  const key = remotePreviewCacheKey(connectionId, path)
  if (!refresh) {
    const cached = peekRemotePreview(connectionId, path)
    if (cached) return Promise.resolve(cached)
  }
  const existing = pending.get(key)
  if (existing) return existing

  const request = loadPreviewDocument(transport, path)
    .then(document => {
      remember(key, document)
      return document
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key)
    })
  pending.set(key, request)
  return request
}

export function clearRemotePreviewCacheForTests(): void {
  cache.clear()
  pending.clear()
  cachedBytes = 0
}
