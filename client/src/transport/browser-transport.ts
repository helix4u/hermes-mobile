import { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import type { MobileCapabilities } from '../protocol/types'
import {
  CORE_GATEWAY_METADATA_PATHS,
  coreGatewayCapabilities,
  shouldAttemptCoreGatewayFallback,
} from './gateway-compatibility'
import type { HermesRequestOptions } from './hermes-transport'
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

class HermesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
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
      const status = error instanceof HermesHttpError ? error.status : undefined
      if (
        !shouldAttemptCoreGatewayFallback(
          this.connection.connectionType,
          status,
        )
      ) {
        throw error
      }
      const failures: string[] = []
      for (const path of CORE_GATEWAY_METADATA_PATHS) {
        try {
          const metadata =
            await this.fetchJson<Record<string, unknown>>(path)
          this.gatewayKind = 'core'
          return coreGatewayCapabilities(metadata)
        } catch (metadataError) {
          failures.push(
            metadataError instanceof Error
              ? metadataError.message
              : String(metadataError),
          )
        }
      }
      throw new Error(
        `Hermes core gateway discovery failed: ${failures.join('; ')}`,
      )
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
    options?: HermesRequestOptions,
  ): Promise<T> {
    return this.fetchJson<T>(path, body, options)
  }

  async downloadFile(
    path: string,
    filename: string,
  ): Promise<boolean> {
    const result = await this.fetchJson<{ dataUrl?: string }>(
      `/api/fs/read-data-url?path=${encodeURIComponent(path)}`,
    )
    if (!result.dataUrl) throw new Error('Hermes did not return file data')
    const anchor = document.createElement('a')
    anchor.href = result.dataUrl
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return true
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
    options?: HermesRequestOptions,
  ): Promise<T> {
    const controller =
      options?.timeoutMs && typeof AbortController !== 'undefined'
        ? new AbortController()
        : null
    const timeoutId =
      controller && options?.timeoutMs
        ? globalThis.setTimeout(() => controller.abort(), options.timeoutMs)
        : null
    let response: Response
    try {
      response = await fetch(
        buildPluginHttpUrl(this.connection.baseUrl, path),
        {
          credentials: 'include',
          method: options?.method ?? (body ? 'POST' : 'GET'),
          headers: {
            ...this.authHeaders(),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          ...(controller ? { signal: controller.signal } : {}),
        },
      )
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId)
    }

    if (!response.ok) {
      let detail = ''
      try {
        const payload = (await response.json()) as { detail?: string }
        detail = payload.detail || ''
      } catch {
        // The status is enough when the response isn't JSON.
      }
      throw new HermesHttpError(
        detail || `${path} returned HTTP ${response.status}`,
        response.status,
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
