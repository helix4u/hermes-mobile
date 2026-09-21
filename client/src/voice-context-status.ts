export type VoiceContextLoadState = 'loading' | 'preview' | 'full'
export type VoiceMemoryState = 'checking' | 'available' | 'empty' | 'unavailable'

export interface VoiceContextStatus {
  loadState: VoiceContextLoadState
  loadedMessages: number
  memoryRecords: number
  memoryState: VoiceMemoryState
  observedAt?: string
  totalMessages?: number
}

export interface VoiceContextCoverage {
  hasNewer?: boolean
  hasOlder?: boolean
  returnedMessages?: number
  totalMessages?: number
}

export interface VoiceContextSessionEvidence {
  observedAt?: string
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined
}

export function voiceContextStatusFromEvidence({
  contextMessages,
  coverage,
  previous,
  session,
}: {
  contextMessages: number
  coverage?: VoiceContextCoverage | null
  previous?: VoiceContextStatus | null
  session?: VoiceContextSessionEvidence | null
}): VoiceContextStatus {
  const returned = count(coverage?.returnedMessages) ?? count(contextMessages) ?? 0
  const total = count(coverage?.totalMessages)
  const complete = total !== undefined && returned >= total &&
    coverage?.hasOlder !== true && coverage?.hasNewer !== true
  return {
    loadState: complete ? 'full' : 'preview',
    loadedMessages: returned,
    memoryRecords: previous?.memoryRecords ?? 0,
    memoryState: previous?.memoryState ?? 'checking',
    ...(session?.observedAt ? { observedAt: session.observedAt } : previous?.observedAt ? { observedAt: previous.observedAt } : {}),
    ...(total === undefined ? {} : { totalMessages: total }),
  }
}

export function voiceContextLoadingStatus(contextMessages = 0): VoiceContextStatus {
  return {
    loadState: 'loading',
    loadedMessages: Math.max(0, Math.trunc(contextMessages)),
    memoryRecords: 0,
    memoryState: 'checking',
  }
}

export function voiceMemoryStatusFromResult(result: unknown): Pick<VoiceContextStatus, 'memoryState' | 'memoryRecords'> {
  const records = result && typeof result === 'object' && Array.isArray((result as { records?: unknown[] }).records)
    ? (result as { records: unknown[] }).records
    : []
  return {
    memoryState: records.length ? 'available' : 'empty',
    memoryRecords: records.length,
  }
}

export function withVoiceMemoryStatus(
  status: VoiceContextStatus | undefined,
  memoryState: VoiceMemoryState,
  memoryRecords = 0,
): VoiceContextStatus {
  return {
    ...(status ?? voiceContextLoadingStatus()),
    memoryRecords: Math.max(0, Math.trunc(memoryRecords)),
    memoryState,
  }
}
