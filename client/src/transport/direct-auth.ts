import type { BrowserConnection } from './browser-transport'
import { parseHermesUrl } from './url'
import { reconnectDelayMs } from './foreground-reconnect'

interface DirectAuthOptions {
  signal?: AbortSignal
  onRetry?: () => void
}

function waitForHost(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, delay)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export interface DirectGatewayAuthBridge {
  gatewayStatus(options: {
    connectionId: string
    baseUrl: string
  }): Promise<{
    baseUrl: string
    authRequired: boolean
    signedIn: boolean
    version: string
  }>
  gatewayLogin(options: {
    connectionId: string
    baseUrl: string
  }): Promise<{
    baseUrl: string
    connected: boolean
  }>
}

export async function prepareDirectAuthentication(
  target: BrowserConnection,
  nativeClient: boolean,
  bridge: DirectGatewayAuthBridge,
  options: DirectAuthOptions = {},
): Promise<BrowserConnection> {
  if (!nativeClient || target.connectionType === 'cloud') return target

  const normalizedTarget = {
    ...target,
    baseUrl: parseHermesUrl(target.baseUrl).baseUrl,
  }
  const { signal, onRetry } = options
  const readStatus = async () => {
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted()
      try {
        const result = await bridge.gatewayStatus({
          connectionId: normalizedTarget.id,
          baseUrl: normalizedTarget.baseUrl,
        })
        signal?.throwIfAborted()
        return result
      } catch (error) {
        signal?.throwIfAborted()
        // The native bridge reports this exact pre-auth health failure. Retry
        // only unavailable backends, never sign-in, TLS, permission, or rate
        // limit failures. A Desktop-bound host can still be starting here,
        // before a transport exists for the normal reconnect supervisor.
        const message = error instanceof Error ? error.message : String(error)
        if (attempt >= 7 || !/^Hermes gateway health returned HTTP (502|503|504)$/.test(message)) {
          throw error
        }
        onRetry?.()
        await waitForHost(reconnectDelayMs(attempt), signal)
      }
    }
  }
  const status = await readStatus()
  if (!status.authRequired) {
    return {
      ...normalizedTarget,
      baseUrl: status.baseUrl,
      authMode: 'token',
    }
  }

  const oauthTarget: BrowserConnection = {
    ...normalizedTarget,
    baseUrl: status.baseUrl,
    token: '',
    authMode: 'oauth',
  }
  if (status.signedIn) return oauthTarget

  const signedIn = await bridge.gatewayLogin({
    connectionId: oauthTarget.id,
    baseUrl: oauthTarget.baseUrl,
  })
  signal?.throwIfAborted()
  if (!signedIn.connected) {
    throw new Error('Hermes gateway sign-in did not complete')
  }
  return { ...oauthTarget, baseUrl: signedIn.baseUrl }
}
