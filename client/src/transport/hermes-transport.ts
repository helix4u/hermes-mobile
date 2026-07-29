import { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import type { MobileCapabilities } from '../protocol/types'
import {
  BrowserHermesTransport,
  type BrowserConnection,
} from './browser-transport'
import {
  HermesNative,
  isNativeHermesClient,
  NativeWebSocket,
} from './native-bridge'
import {
  buildPluginGatewayUrl,
  buildPluginHttpUrl,
  buildCoreWsUrl,
  parseHermesUrl,
} from './url'

export interface HermesTransport {
  readonly kind: 'browser' | 'native'
  readonly gateway: JsonRpcGatewayClient
  capabilities(): Promise<MobileCapabilities>
  requestJson<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: HermesRequestOptions,
  ): Promise<T>
  connect(): Promise<void>
  disconnect(): void
}

export interface HermesRequestOptions {
  timeoutMs?: number
}

export class NativeHermesTransport implements HermesTransport {
  readonly kind = 'native' as const
  readonly gateway: JsonRpcGatewayClient
  readonly connection: BrowserConnection
  private credentialPrepared = false
  private gatewayKind: 'plugin' | 'core' = 'plugin'

  constructor(connection: BrowserConnection) {
    this.connection = {
      ...connection,
      baseUrl: parseHermesUrl(connection.baseUrl).baseUrl,
    }
    this.gateway = new JsonRpcGatewayClient(
      url => new NativeWebSocket(connection.id, url),
    )
  }

  async capabilities(): Promise<MobileCapabilities> {
    await this.prepareCredential()
    const response = await HermesNative.httpRequest({
      connectionId: this.connection.id,
      url: buildPluginHttpUrl(
        this.connection.baseUrl,
        '/api/plugins/hermes-mobile/v1/capabilities',
      ),
    })
    if (response.status >= 200 && response.status < 300) {
      this.gatewayKind = 'plugin'
      return JSON.parse(response.body) as MobileCapabilities
    }
    if (this.connection.connectionType === 'cloud') {
      const health = await HermesNative.httpRequest({
        connectionId: this.connection.id,
        url: buildPluginHttpUrl(this.connection.baseUrl, '/api/health'),
      })
      if (health.status >= 200 && health.status < 300) {
        this.gatewayKind = 'core'
        return coreGatewayCapabilities()
      }
    }
    {
      throw new Error(
        `The mobile capability endpoint returned HTTP ${response.status}`,
      )
    }
  }

  async connect(): Promise<void> {
    await this.prepareCredential()
    await this.gateway.connect(
      this.gatewayKind === 'plugin'
        ? buildPluginGatewayUrl(this.connection.baseUrl)
        : buildCoreWsUrl(this.connection.baseUrl, ['ticket', 'native']),
    )
  }

  async requestJson<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: HermesRequestOptions,
  ): Promise<T> {
    await this.prepareCredential()
    const response = await HermesNative.httpRequest({
      connectionId: this.connection.id,
      url: buildPluginHttpUrl(this.connection.baseUrl, path),
      method: body ? 'POST' : 'GET',
      ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(body
        ? {
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
          }
        : {}),
    })
    if (response.status < 200 || response.status >= 300) {
      let detail = ''
      try {
        detail = String(
          (JSON.parse(response.body) as { detail?: string }).detail ?? '',
        )
      } catch {
        // Use the status fallback for non-JSON errors.
      }
      throw new Error(
        detail || `${path} returned HTTP ${response.status}`,
      )
    }
    return JSON.parse(response.body) as T
  }

  disconnect(): void {
    this.gateway.disconnect()
  }

  private async prepareCredential(): Promise<void> {
    if (this.credentialPrepared) return
    if (this.connection.authMode === 'oauth') {
      this.credentialPrepared = true
      return
    }
    if (this.connection.token) {
      await HermesNative.setCredential({
        connectionId: this.connection.id,
        token: this.connection.token,
      })
    } else {
      const stored = await HermesNative.hasCredential({
        connectionId: this.connection.id,
      })
      if (!stored.present) {
        throw new Error('Enter the Hermes credential for this connection')
      }
    }
    this.credentialPrepared = true
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

export function createHermesTransport(
  connection: BrowserConnection,
): HermesTransport {
  if (isNativeHermesClient()) {
    return new NativeHermesTransport(connection)
  }
  return new BrowserHermesTransport(connection)
}
