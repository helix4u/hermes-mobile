import type { GatewayConnectionState } from './protocol/types'

export interface HostConnectionPresentation {
  label: string
  tone: GatewayConnectionState | 'degraded'
}

export function hostConnectionPresentation(
  state: GatewayConnectionState,
  capabilityStatus: string | undefined,
  hostName: string,
  wantsConnection: boolean,
): HostConnectionPresentation {
  if (state === 'connected') {
    if (capabilityStatus === 'degraded') {
      return {
        label: `Degraded · ${hostName || 'Hermes'}`,
        tone: 'degraded',
      }
    }
    return { label: hostName || 'Connected', tone: 'connected' }
  }
  if (state === 'connecting') {
    return { label: 'Connecting…', tone: 'connecting' }
  }
  if (state === 'failed') {
    return { label: 'Connection failed', tone: 'failed' }
  }
  if (wantsConnection) {
    return { label: 'Reconnecting…', tone: 'connecting' }
  }
  return { label: 'Connect', tone: 'disconnected' }
}
