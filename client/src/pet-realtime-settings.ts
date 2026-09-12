/** Per-call Realtime controls. Keep aligned with the host's validated catalog. */
export const REALTIME_MODELS = ['gpt-realtime-2.1-mini', 'gpt-realtime-2.1', 'gpt-realtime-2', 'gpt-realtime-1.5'] as const
export const REALTIME_EFFORTS = ['default', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export const VOICE_ENGINES = ['realtime', 'live'] as const

export interface RealtimeSettings {
  engine?: (typeof VOICE_ENGINES)[number]
  maxWorkers?: number
  mode?: 'pet' | 'session'
  /** Legacy persisted field. Mobile voice always requires the visible review card. */
  approval?: 'on'
  noiseReduction?: 'near_field' | 'far_field' | 'off'

  model: (typeof REALTIME_MODELS)[number]
  effort: (typeof REALTIME_EFFORTS)[number]
  diagnostics?: boolean
  microphoneId?: string
}

export const DEFAULT_REALTIME_SETTINGS: RealtimeSettings = { engine: 'realtime', model: 'gpt-realtime-2.1-mini', effort: 'default' }

export function supportsRealtimeEffort(model: string): boolean {
  return model !== 'gpt-realtime-1.5' && REALTIME_MODELS.some(candidate => candidate === model)
}

export function normalizeRealtimeSettings(value: unknown): RealtimeSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const model = REALTIME_MODELS.find(candidate => candidate === record.model) ?? DEFAULT_REALTIME_SETTINGS.model
  const effort = supportsRealtimeEffort(model)
    ? REALTIME_EFFORTS.find(candidate => candidate === record.effort) ?? 'default'
    : 'default'
  const engine = VOICE_ENGINES.find(candidate => candidate === record.engine) ?? DEFAULT_REALTIME_SETTINGS.engine
  return { engine, model, effort,
    ...(typeof record.maxWorkers === 'number' && Number.isInteger(record.maxWorkers) && record.maxWorkers >= 0 && record.maxWorkers <= 16 ? { maxWorkers: record.maxWorkers } : {}),
    ...(['pet', 'session'].includes(String(record.mode)) ? { mode: record.mode as RealtimeSettings['mode'] } : {}),
    ...(record.approval === undefined ? {} : { approval: 'on' as const }),
    ...(['near_field', 'far_field', 'off'].includes(String(record.noiseReduction)) ? { noiseReduction: record.noiseReduction as RealtimeSettings['noiseReduction'] } : {}),
    ...(record.diagnostics === true ? { diagnostics: true } : {}),
    ...(typeof record.microphoneId === 'string' && record.microphoneId.length <= 256 && record.microphoneId
      ? { microphoneId: record.microphoneId } : {}) }
}

/** Default means omit the API override, not an invented effort level. */
export function realtimeSettingsParams(value: unknown): { voiceEngine: 'live' | 'realtime'; model: string; reasoningEffort?: string; noiseReduction?: string; interactionMode?: string } {
  const settings = normalizeRealtimeSettings(value)
  return { voiceEngine: settings.engine ?? 'realtime', model: settings.model, ...(settings.effort === 'default' ? {} : { reasoningEffort: settings.effort }),
    ...(settings.noiseReduction ? { noiseReduction: settings.noiseReduction } : {}),
    ...(settings.mode ? { interactionMode: settings.mode } : {}) }
}
