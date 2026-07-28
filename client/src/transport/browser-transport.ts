import { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import type { MobileCapabilities } from '../protocol/types'
import {
  buildCoreWsUrl,
  buildPluginHttpUrl,
  buildPluginWsUrl,
  parseHermesUrl,
} from './url'

export interface BrowserConnection {
  id: string
  name: string
  baseUrl: string
  profile: string
  token: string
  authMode: 'token' | 'oauth'
  connectionType: 'direct' | 'tailnet' | 'cloud'
}

interface WsTicketResponse {
  ticket: string
  ttl_seconds: number
}

export class BrowserHermesTransport {
  readonly kind = 'browser' as const
  readonly gateway: JsonRpcGatewayClient
  private gatewayKind: 'plugin' | 'core' = 'plugin'

  constructor(
    readonly connection: BrowserConnection,
    gateway = new JsonRpcGatewayClient(),
  ) {
    this.connection = {
      ...connection,
      baseUrl: parseHermesUrl(connection.baseUrl).baseUrl,
    }
    this.gateway = gateway
  }

  async capabilities(): Promise<MobileCapabilities> {
    try {
      const capabilities = await this.fetchJson<MobileCapabilities>(
        '/api/plugins/hermes-mobile/v1/capabilities',
      )
      this.gatewayKind = 'plugin'
      return capabilities
    } catch (error) {
      if (this.connection.connectionType !== 'cloud') throw error
      await this.fetchJson<Record<string, unknown>>('/api/health')
      this.gatewayKind = 'core'
      return coreGatewayCapabilities()
    }
  }

  async connect(): Promise<void> {
    const auth = await this.resolveWsAuth()
    await this.gateway.connect(
      this.gatewayKind === 'plugin'
        ? buildPluginWsUrl(this.connection.baseUrl, auth)
        : buildCoreWsUrl(this.connection.baseUrl, auth),
    )
  }

  async requestJson<T>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return this.fetchJson<T>(path, body)
  }

  disconnect(): void {
    this.gateway.disconnect()
  }

  private async resolveWsAuth(): Promise<readonly [string, string]> {
    const coreTicket = await this.requestTicket(
      '/api/auth/ws-ticket',
      'ticket',
    )
    if (coreTicket) return coreTicket

    const mobileTicket = await this.requestTicket(
      '/api/plugins/hermes-mobile/v1/ws-ticket',
      'mobile_ticket',
    )
    if (mobileTicket) return mobileTicket

    throw new Error(
      'Authentication is required. Sign in to this Hermes server or enter its session token.',
    )
  }

  private async requestTicket(
    path: string,
    queryName: string,
  ): Promise<readonly [string, string] | null> {
    try {
      const response = await fetch(
        buildPluginHttpUrl(this.connection.baseUrl, path),
        {
        method: 'POST',
        credentials: 'include',
        headers: this.authHeaders(),
        },
      )
      if (response.ok) {
        const body = (await response.json()) as WsTicketResponse
        if (body.ticket) return [queryName, body.ticket]
      }
    } catch {
      // The other ticket issuer may still support this authentication mode.
    }
    return null
  }

  private async fetchJson<T>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(
      buildPluginHttpUrl(this.connection.baseUrl, path),
      {
        credentials: 'include',
        method: body ? 'POST' : 'GET',
        headers: {
          ...this.authHeaders(),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    )

    if (!response.ok) {
      let detail = ''
      try {
        const payload = (await response.json()) as { detail?: string }
        detail = payload.detail || ''
      } catch {
        // The status is enough when the response isn't JSON.
      }
      throw new Error(
        detail || `${path} returned HTTP ${response.status}`,
      )
    }

    return (await response.json()) as T
  }

  private authHeaders(): HeadersInit {
    if (!this.connection.token) return {}
    return {
      Authorization: `Bearer ${this.connection.token}`,
    }
  }
}

function coreGatewayCapabilities(): MobileCapabilities {
  return {
    contract_version: 1,
    plugin_version: 'core-gateway',
    hermes_version: 'cloud',
    status: 'degraded',
    details: [
      'Connected through the Hermes core gateway; mobile replay extensions are unavailable.',
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
