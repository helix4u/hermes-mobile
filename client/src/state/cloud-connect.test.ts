import { describe, expect, it, vi } from 'vitest'
import type {
  CloudAgent,
  CloudDiscoverResult,
} from '../transport/native-bridge'
import {
  isNousCloudAgentUrl,
  nousCloudAgentHostname,
  resolveNousCloudAgent,
  type NousCloudDiscoveryBridge,
} from './cloud'

const targetAgent: CloudAgent = {
  id: 'agent-mid-tier',
  name: 'Mr Mid Tier',
  status: 'running',
  dashboardUrl: 'https://example-agent-1234.agents.nousresearch.com/',
  dashboardGatewayState: 'available',
}

function bridge(
  overrides: Partial<NousCloudDiscoveryBridge> = {},
): NousCloudDiscoveryBridge {
  return {
    cloudStatus: vi.fn().mockResolvedValue({
      portalBaseUrl: 'https://portal.nousresearch.com',
      signedIn: true,
    }),
    cloudLogin: vi.fn(),
    cloudDiscover: vi.fn().mockResolvedValue({
      agents: [targetAgent],
      org: {
        id: 'org-personal',
        slug: 'personal',
        name: 'Personal',
        isPersonal: true,
        role: 'OWNER',
      },
    } satisfies CloudDiscoverResult),
    ...overrides,
  }
}

describe('automatic Nous Cloud URL onboarding', () => {
  it('recognizes only HTTPS subdomains of the Nous agent domain', () => {
    expect(
      nousCloudAgentHostname(
        'https://example-agent-1234.agents.nousresearch.com/',
      ),
    ).toBe('example-agent-1234.agents.nousresearch.com')
    expect(
      isNousCloudAgentUrl('example-agent-1234.agents.nousresearch.com'),
    ).toBe(true)
    expect(
      isNousCloudAgentUrl(
        'https://example-agent-1234.agents.nousresearch.com.evil.example',
      ),
    ).toBe(false)
    expect(
      isNousCloudAgentUrl(
        'http://example-agent-1234.agents.nousresearch.com',
      ),
    ).toBe(false)
    expect(
      isNousCloudAgentUrl(
        'https://user:password@example-agent-1234.agents.nousresearch.com',
      ),
    ).toBe(false)
  })

  it('matches the pasted host against the signed-in account inventory', async () => {
    const native = bridge()

    const result = await resolveNousCloudAgent(
      'https://example-agent-1234.agents.nousresearch.com/',
      native,
    )

    expect(result.agent).toEqual(targetAgent)
    expect(native.cloudLogin).not.toHaveBeenCalled()
    expect(native.cloudDiscover).toHaveBeenCalledWith({})
  })

  it('opens Nous sign-in automatically when the Portal session is absent', async () => {
    const cloudLogin = vi.fn().mockResolvedValue({
      portalBaseUrl: 'https://portal.nousresearch.com',
      signedIn: true,
    })
    const native = bridge({
      cloudStatus: vi.fn().mockResolvedValue({
        portalBaseUrl: 'https://portal.nousresearch.com',
        signedIn: false,
      }),
      cloudLogin,
    })

    await resolveNousCloudAgent(targetAgent.dashboardUrl ?? '', native)

    expect(cloudLogin).toHaveBeenCalledOnce()
  })

  it('checks each available organization until it finds the exact agent', async () => {
    const personal = {
      id: 'org-personal',
      slug: 'personal',
      name: 'Personal',
      isPersonal: true,
      role: 'OWNER',
    }
    const team = {
      id: 'org-team',
      slug: 'team',
      name: 'Team',
      isPersonal: false,
      role: 'MEMBER',
    }
    const cloudDiscover = vi
      .fn()
      .mockResolvedValueOnce({
        needsOrgSelection: true,
        orgs: [personal, team],
      } satisfies CloudDiscoverResult)
      .mockResolvedValueOnce({
        agents: [],
        org: personal,
      } satisfies CloudDiscoverResult)
      .mockResolvedValueOnce({
        agents: [targetAgent],
        org: team,
      } satisfies CloudDiscoverResult)
    const native = bridge({ cloudDiscover })

    const result = await resolveNousCloudAgent(
      targetAgent.dashboardUrl ?? '',
      native,
    )

    expect(result.agent).toEqual(targetAgent)
    expect(result.selectedOrganization).toEqual(team)
    expect(cloudDiscover.mock.calls).toEqual([
      [{}],
      [{ org: 'personal' }],
      [{ org: 'team' }],
    ])
  })

  it('does not trust a Nous-looking URL that is absent from account discovery', async () => {
    const native = bridge({
      cloudDiscover: vi.fn().mockResolvedValue({
        agents: [],
        org: {
          id: 'org-personal',
          slug: 'personal',
          name: 'Personal',
          isPersonal: true,
          role: 'OWNER',
        },
      } satisfies CloudDiscoverResult),
    })

    await expect(
      resolveNousCloudAgent(
        'https://not-mine.agents.nousresearch.com',
        native,
      ),
    ).rejects.toThrow('cannot see not-mine.agents.nousresearch.com')
  })
})
