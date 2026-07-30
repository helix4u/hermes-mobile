import type {
  CloudAgent,
  CloudDiscoverResult,
  CloudOrganization,
} from '../transport/native-bridge'

const NOUS_CLOUD_AGENT_PARENT = 'agents.nousresearch.com'

export interface NousCloudDiscoveryBridge {
  cloudStatus(): Promise<{
    portalBaseUrl: string
    signedIn: boolean
  }>
  cloudLogin(): Promise<{
    portalBaseUrl: string
    signedIn: boolean
  }>
  cloudDiscover(options?: { org?: string }): Promise<CloudDiscoverResult>
}

export interface ResolvedNousCloudAgent {
  agent: CloudAgent
  agents: CloudAgent[]
  organizations: CloudOrganization[]
  selectedOrganization: CloudOrganization | null
}

function parsedUrl(value: string): URL | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    )
  } catch {
    return null
  }
}

export function nousCloudAgentHostname(value: string): string | null {
  const url = parsedUrl(value)
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password
  ) {
    return null
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  return hostname.endsWith(`.${NOUS_CLOUD_AGENT_PARENT}`)
    ? hostname
    : null
}

export function isNousCloudAgentUrl(value: string): boolean {
  return nousCloudAgentHostname(value) !== null
}

function matchingAgent(
  agents: CloudAgent[],
  targetHostname: string,
): CloudAgent | null {
  return (
    agents.find(agent => {
      if (!agent.dashboardUrl) return false
      return nousCloudAgentHostname(agent.dashboardUrl) === targetHostname
    }) ?? null
  )
}

function mergeAgents(current: CloudAgent[], incoming: CloudAgent[]): CloudAgent[] {
  const merged = new Map(current.map(agent => [agent.id, agent]))
  for (const agent of incoming) merged.set(agent.id, agent)
  return [...merged.values()]
}

export async function resolveNousCloudAgent(
  value: string,
  bridge: NousCloudDiscoveryBridge,
): Promise<ResolvedNousCloudAgent> {
  const targetHostname = nousCloudAgentHostname(value)
  if (!targetHostname) {
    throw new Error('Enter a valid Nous Cloud agent URL')
  }

  let status = await bridge.cloudStatus()
  if (!status.signedIn) status = await bridge.cloudLogin()
  if (!status.signedIn) {
    throw new Error('Hermes Cloud sign-in did not complete')
  }

  const initial = await bridge.cloudDiscover({})
  let agents = initial.agents ?? []
  const organizations = initial.needsOrgSelection
    ? initial.orgs ?? []
    : initial.org
      ? [initial.org]
      : []
  let agent = matchingAgent(agents, targetHostname)
  if (agent) {
    return {
      agent,
      agents,
      organizations,
      selectedOrganization: initial.org ?? null,
    }
  }

  if (initial.needsOrgSelection) {
    for (const organization of organizations) {
      const result = await bridge.cloudDiscover({
        org: organization.slug || organization.id,
      })
      agents = mergeAgents(agents, result.agents ?? [])
      agent = matchingAgent(result.agents ?? [], targetHostname)
      if (agent) {
        return {
          agent,
          agents,
          organizations,
          selectedOrganization: result.org ?? organization,
        }
      }
    }
  }

  throw new Error(
    `The signed-in Nous account cannot see ${targetHostname}. Sign in with the account that owns that Cloud agent.`,
  )
}

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
