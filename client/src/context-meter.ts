export interface ContextSnapshot {
  context_used: number
  context_max: number
  context_estimated: boolean
  compression_threshold_tokens?: number | null
  model?: string
}

export function contextMeterValues(snapshot: ContextSnapshot | null) {
  if (!snapshot || !Number.isFinite(snapshot.context_max) || snapshot.context_max <= 0
    || !Number.isFinite(snapshot.context_used) || snapshot.context_used < 0) return null
  const used = Math.min(snapshot.context_used, snapshot.context_max)
  const threshold = snapshot.compression_threshold_tokens
  return {
    used, maximum: snapshot.context_max, remaining: snapshot.context_max - used,
    percent: Math.round(used / snapshot.context_max * 100), estimated: snapshot.context_estimated,
    threshold: typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0 ? threshold : null,
  }
}
