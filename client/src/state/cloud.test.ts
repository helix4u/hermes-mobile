import { describe, expect, it } from 'vitest'
import { cloudAgentConnectable, cloudAgentStatus } from './cloud'

describe('cloud agent display state', () => {
  it('does not let an unknown gateway state hide a useful agent status', () => {
    const agent = {
      id: 'agent-1',
      name: 'Agent',
      status: 'running',
      dashboardUrl: 'https://agent.example.cloud',
      dashboardGatewayState: 'unknown',
    }

    expect(cloudAgentStatus(agent)).toBe('running')
    expect(cloudAgentConnectable(agent)).toBe(true)
  })

  it('uses dashboard availability when both status fields are unknown', () => {
    expect(
      cloudAgentStatus({
        id: 'agent-2',
        name: 'Agent',
        status: 'unknown',
        dashboardUrl: 'https://agent.example.cloud',
        dashboardGatewayState: '',
      }),
    ).toBe('Dashboard ready')
  })
})
