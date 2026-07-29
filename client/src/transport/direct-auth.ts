import type { BrowserConnection } from './browser-transport'
import { parseHermesUrl } from './url'

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
): Promise<BrowserConnection> {
  if (!nativeClient || target.connectionType === 'cloud') return target

  const normalizedTarget = {
    ...target,
    baseUrl: parseHermesUrl(target.baseUrl).baseUrl,
  }
  const status = await bridge.gatewayStatus({
    connectionId: normalizedTarget.id,
    baseUrl: normalizedTarget.baseUrl,
  })
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
  if (!signedIn.connected) {
    throw new Error('Hermes gateway sign-in did not complete')
  }
  return { ...oauthTarget, baseUrl: signedIn.baseUrl }
}
