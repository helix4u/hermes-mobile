import type { TranscriptItem } from './transcript'

export type TranscriptCache = Map<string, TranscriptItem[]>

export function transcriptCacheKey(
  connectionId: string,
  storedSessionId: string,
): string {
  return `${connectionId}\u0000${storedSessionId}`
}

export function readCachedTranscript(
  cache: TranscriptCache,
  connectionId: string,
  storedSessionId: string,
): TranscriptItem[] | undefined {
  const key = transcriptCacheKey(connectionId, storedSessionId)
  const value = cache.get(key)
  if (!value) return undefined
  cache.delete(key)
  cache.set(key, value)
  return value
}

export function cacheTranscript(
  cache: TranscriptCache,
  connectionId: string,
  storedSessionId: string,
  transcript: TranscriptItem[],
  limit = 12,
): void {
  if (!connectionId || !storedSessionId || transcript.length === 0) return
  const key = transcriptCacheKey(connectionId, storedSessionId)
  cache.delete(key)
  cache.set(key, transcript)
  while (cache.size > Math.max(1, limit)) {
    const oldest = cache.keys().next().value
    if (typeof oldest !== 'string') break
    cache.delete(oldest)
  }
}
