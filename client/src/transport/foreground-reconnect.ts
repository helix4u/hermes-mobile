import type {
  SessionCreateResult,
  SessionListResult,
} from '../protocol/types'
import type { HermesTransport } from './hermes-transport'

export interface ForegroundReconcileOptions {
  transport: HermesTransport
  profile: string
  storedSessionId: string
  probeTimeoutMs?: number
  confirmTimeoutMs?: number
}

export interface ForegroundReconcileResult {
  reconnected: boolean
  resumed: SessionCreateResult | null
  messages: unknown[] | null
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
  probeTimeoutMs = 2_500,
  confirmTimeoutMs = 5_000,
}: ForegroundReconcileOptions): Promise<ForegroundReconcileResult> {
  const probe = (timeoutMs: number) =>
    transport.gateway.request<SessionListResult>(
      'session.list',
      {
        profile: gatewayProfile(profile),
        limit: 1,
      },
      { timeoutMs },
    )

  try {
    await probe(probeTimeoutMs)
    return {
      reconnected: false,
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
      resumed: null,
      messages: null,
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
    resumed,
    messages,
  }
}
