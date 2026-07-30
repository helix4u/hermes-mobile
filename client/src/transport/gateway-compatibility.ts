import type { MobileCapabilities } from '../protocol/types'

export type HermesConnectionType = 'direct' | 'tailnet' | 'cloud'

export const CORE_GATEWAY_METADATA_PATHS = [
  '/api/health',
  '/api/status',
] as const

export function shouldAttemptCoreGatewayFallback(
  connectionType: HermesConnectionType,
  pluginStatus?: number,
): boolean {
  return connectionType === 'cloud' || pluginStatus === 404
}

export function coreGatewayCapabilities(
  health: Record<string, unknown> = {},
): MobileCapabilities {
  const version = String(health.version ?? '').trim() || 'unknown'
  return {
    contract_version: 1,
    plugin_version: 'core-gateway',
    hermes_version: version,
    status: 'degraded',
    details: [
      'Connected through the Hermes core gateway; install or enable the Hermes Mobile plugin for replay extensions.',
    ],
    features: {
      profiles: true,
      stored_sessions: true,
      live_sessions: true,
      projects: true,
      revisioned_events: false,
      recoverable_approval: false,
      recoverable_clarification: false,
      recoverable_sudo: false,
      recoverable_secret: false,
      attachments: false,
      device_pairing: false,
      push_notifications: false,
    },
  }
}
