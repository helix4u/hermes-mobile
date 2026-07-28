import type { CloudAgent } from '../transport/native-bridge'

function usefulStatus(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  return normalized.toLowerCase() === 'unknown' ? '' : normalized
}

export function cloudAgentStatus(agent: CloudAgent): string {
  return (
    usefulStatus(agent.dashboardGatewayState) ||
    usefulStatus(agent.status) ||
    (agent.dashboardUrl ? 'Dashboard ready' : 'Not ready')
  )
}

export function cloudAgentConnectable(agent: CloudAgent): boolean {
  return Boolean(agent.dashboardUrl) &&
    cloudAgentStatus(agent).toLowerCase() !== 'provisioning'
}
