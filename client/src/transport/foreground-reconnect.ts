import type {
  SessionActivateResult,
  SessionCreateResult,
} from '../protocol/types'
import type { HermesTransport } from './hermes-transport'

export interface ForegroundReconcileOptions {
  transport: HermesTransport
  profile: string
  storedSessionId: string
  runtimeSessionId?: string
  probeTimeoutMs?: number
  confirmTimeoutMs?: number
}

export interface ForegroundReconcileResult {
  reconnected: boolean
  activated: SessionActivateResult | null
  resumed: SessionCreateResult | null
  messages: unknown[] | null
}

const RECONNECT_DELAYS_MS = [250, 1_000, 2_500, 5_000, 10_000] as const

export function reconnectDelayMs(attempt: number): number {
  const normalized = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0
  return RECONNECT_DELAYS_MS[
    Math.min(normalized, RECONNECT_DELAYS_MS.length - 1)
  ]
}

export function shouldSurfaceGatewayStateError(
  appActive: boolean,
  connecting: boolean,
): boolean {
  return appActive && connecting
}

function gatewayProfile(profile: string): string {
  return profile === 'default' ? '' : profile
}

export async function reconcileForegroundConnection({
  transport,
  profile,
  storedSessionId,
  runtimeSessionId = '',
  probeTimeoutMs = 2_500,
  confirmTimeoutMs = 5_000,
}: ForegroundReconcileOptions): Promise<ForegroundReconcileResult> {
  const probe = (timeoutMs: number) =>
    transport.gateway.request('gateway.ping', {}, { timeoutMs })

  try {
    await probe(probeTimeoutMs)
    return {
      reconnected: false,
      activated: null,
      resumed: null,
      messages: null,
    }
  } catch {
    // Android may keep a locally-open WebSocket after the remote leg has
    // disappeared. A failed application-level probe is therefore equivalent
    // to a possible disconnect, but one slow response is not enough evidence
    // to tear down an otherwise-open socket.
  }

  if (transport.gateway.connected) {
    try {
      await probe(confirmTimeoutMs)
      return {
        reconnected: false,
        activated: null,
        resumed: null,
        messages: null,
      }
    } catch {
      // Two failed probes confirm that the open-looking socket is stale.
    }
  }

  transport.disconnect()
  await transport.connect()

  if (!storedSessionId) {
    return {
      reconnected: true,
      activated: null,
      resumed: null,
      messages: null,
    }
  }

  if (runtimeSessionId) {
    try {
      const activated = await transport.gateway.request<SessionActivateResult>(
        'session.activate',
        { session_id: runtimeSessionId, cols: 100 },
      )
      let messages = activated.messages ?? []
      try {
        const history = await transport.gateway.request<{ messages?: unknown[] }>(
          'session.history',
          { session_id: activated.session_id },
        )
        messages = history.messages ?? messages
      } catch {
        // session.activate already carries a compatible display projection.
      }
      return {
        reconnected: true,
        activated,
        resumed: null,
        messages,
      }
    } catch {
      // The runtime may have completed or expired while Mobile was offline.
      // Fall through to its durable session instead of manufacturing a new one.
    }
  }

  const resumed = await transport.gateway.request<SessionCreateResult>(
    'session.resume',
    {
      session_id: storedSessionId,
      profile: gatewayProfile(profile),
      source: 'hermes-mobile',
      cols: 100,
    },
  )
  let messages = resumed.messages ?? []
  try {
    const history = await transport.gateway.request<{ messages?: unknown[] }>(
      'session.history',
      { session_id: resumed.session_id },
    )
    messages = history.messages ?? messages
  } catch {
    // session.resume already carries the compatible display projection.
  }

  return {
    reconnected: true,
    activated: null,
    resumed,
    messages,
  }
}
