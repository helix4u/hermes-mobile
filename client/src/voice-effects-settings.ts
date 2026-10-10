export interface VoiceEffectsSettings {
  enabled: boolean
  pitch: number
  bass: number
  treble: number
  radio: boolean
  spatial: boolean
  /** Left/right placement from -1 to 1, mapped to a front-facing 120 degree arc. */
  spatialPosition: number
  /** Simulated distance in metres, bounded to 1 through 5. */
  spatialDistance: number
}

export const DEFAULT_VOICE_EFFECTS: VoiceEffectsSettings = {
  enabled: false, pitch: 0, bass: 0, treble: 0, radio: false,
  spatial: false, spatialPosition: 0, spatialDistance: 1,
}

function bounded(value: unknown, limit: number, minimum = -limit, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(minimum, Math.min(limit, value)) * 10) / 10 : fallback
}

export function normalizeVoiceEffects(value: unknown): VoiceEffectsSettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { enabled: input.enabled === true, pitch: bounded(input.pitch, 12),
    bass: bounded(input.bass, 12), treble: bounded(input.treble, 12), radio: input.radio === true,
    spatial: input.spatial === true, spatialPosition: bounded(input.spatialPosition, 1),
    spatialDistance: bounded(input.spatialDistance, 5, 1, 1) }
}

export const VOICE_EFFECT_PRESETS: Record<string, VoiceEffectsSettings> = {
  Natural: { ...DEFAULT_VOICE_EFFECTS },
  Deep: { ...DEFAULT_VOICE_EFFECTS, enabled: true, pitch: -4, bass: 3, treble: -2 },
  Tiny: { ...DEFAULT_VOICE_EFFECTS, enabled: true, pitch: 5, bass: -3, treble: 2 },
  Radio: { ...DEFAULT_VOICE_EFFECTS, enabled: true, radio: true },
  Warm: { ...DEFAULT_VOICE_EFFECTS, enabled: true, pitch: -1, bass: 3, treble: -3 },
}

/** Only local output controls may change while the provider call is active. */
export function liveEffectsSettings<T extends { effects?: VoiceEffectsSettings }>(current: T, requested: T): T {
  return { ...current, effects: normalizeVoiceEffects(requested.effects) }
}
