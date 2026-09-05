import { normalizeRealtimeSettings, type RealtimeSettings } from './pet-realtime-settings'

export function realtimeSettingsKey(connectionId: string): string {
  return `hermes-mobile.pet-realtime.settings.v1.${connectionId}`
}

export function loadRealtimeSettings(connectionId: string): RealtimeSettings {
  try {
    return normalizeRealtimeSettings(JSON.parse(localStorage.getItem(realtimeSettingsKey(connectionId)) ?? '{}'))
  } catch {
    return normalizeRealtimeSettings(null)
  }
}

export function saveRealtimeSettings(connectionId: string, value: RealtimeSettings): RealtimeSettings {
  const next = normalizeRealtimeSettings(value)
  try {
    localStorage.setItem(realtimeSettingsKey(connectionId), JSON.stringify(next))
  } catch {
    // Keep the selection usable if storage is temporarily unavailable.
  }
  return next
}
