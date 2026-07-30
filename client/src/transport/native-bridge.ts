import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core'
import type { WebSocketLike } from '../protocol/json-rpc-client'

interface NativeHttpResponse {
  status: number
  body: string
  headers: Record<string, string>
}

interface NativeSocketMessage {
  connectionId: string
  socketId: string
  data: string
}

interface NativeSocketState {
  connectionId: string
  socketId: string
  state: 'open' | 'closing' | 'closed' | 'failed'
  error?: string
}

export interface CloudOrganization {
  id: string
  slug: string | null
  name: string
  isPersonal: boolean
  role: string
}

export interface CloudAgent {
  id: string
  name: string
  status: string
  dashboardUrl: string | null
  dashboardGatewayState: string
}

export interface CloudDiscoverResult {
  agents?: CloudAgent[]
  org?: CloudOrganization | null
  needsOrgSelection?: boolean
  orgs?: CloudOrganization[]
}

export interface SharedContent {
  id: string
  kind: 'image' | 'text'
  text: string
  name: string
  mimeType: string
}

interface HermesNativePlugin {
  setCredential(options: { connectionId: string; token: string }): Promise<void>
  hasCredential(options: {
    connectionId: string
  }): Promise<{ present: boolean }>
  listCredentialIds(): Promise<{ connectionIds: string[] }>
  removeCredential(options: { connectionId: string }): Promise<void>
  startRecording(): Promise<{ status: 'recording' }>
  stopRecording(): Promise<{
    dataUrl: string
    mimeType: string
    durationMs: number
  }>
  downloadFile(options: {
    connectionId: string
    url: string
    filename: string
    mimeType?: string
  }): Promise<{ saved: boolean; filename?: string }>
  saveDataFile(options: {
    dataUrl: string
    filename: string
    mimeType?: string
  }): Promise<{ saved: boolean; filename?: string }>
  getPendingShare(): Promise<{ share?: SharedContent }>
  readSharedImage(options: { shareId: string }): Promise<{
    dataUrl: string
  }>
  discardShare(options: { shareId: string }): Promise<void>
  httpRequest(options: {
    connectionId: string
    url: string
    method?: string
    body?: string
    headers?: Record<string, string>
    timeoutMs?: number
  }): Promise<NativeHttpResponse>
  connectSocket(options: {
    connectionId: string
    socketId: string
    url: string
  }): Promise<void>
  sendSocket(options: {
    connectionId: string
    socketId: string
    data: string
  }): Promise<void>
  disconnectSocket(options: {
    connectionId: string
    socketId: string
  }): Promise<void>
  gatewayStatus(options: { connectionId: string; baseUrl: string }): Promise<{
    baseUrl: string
    authRequired: boolean
    signedIn: boolean
    version: string
  }>
  gatewayLogin(options: { connectionId: string; baseUrl: string }): Promise<{
    baseUrl: string
    connected: boolean
  }>
  cloudStatus(): Promise<{
    portalBaseUrl: string
    signedIn: boolean
  }>
  cloudLogin(): Promise<{
    portalBaseUrl: string
    signedIn: boolean
  }>
  cloudLogout(): Promise<{
    portalBaseUrl: string
    signedIn: boolean
  }>
  cloudDiscover(options?: { org?: string }): Promise<CloudDiscoverResult>
  cloudAgentSignIn(options: {
    connectionId: string
    dashboardUrl: string
  }): Promise<{
    baseUrl: string
    connected: boolean
  }>
  addListener(
    eventName: 'socketMessage',
    listener: (event: NativeSocketMessage) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'socketState',
    listener: (event: NativeSocketState) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'shareReceived',
    listener: (event: SharedContent) => void,
  ): Promise<PluginListenerHandle>
}

export const HermesNative = registerPlugin<HermesNativePlugin>('HermesNative')

export function isNativeHermesClient(): boolean {
  return Capacitor.isNativePlatform()
}

let nativeSocketSequence = 0

export function nativeSocketEventMatches(
  connectionId: string,
  socketId: string,
  event: Pick<NativeSocketState, 'connectionId' | 'socketId'>,
): boolean {
  return event.connectionId === connectionId && event.socketId === socketId
}

export class NativeWebSocket extends EventTarget implements WebSocketLike {
  readyState: number = WebSocket.CONNECTING
  private listenerHandles: PluginListenerHandle[] = []
  private closePublished = false
  private closeRequested = false
  private readonly socketId: string

  constructor(
    private readonly connectionId: string,
    url: string,
  ) {
    super()
    this.socketId = `${this.connectionId}:${Date.now()}:${++nativeSocketSequence}`
    void this.open(url)
  }

  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('The native Hermes WebSocket is not connected')
    }
    void HermesNative.sendSocket({
      connectionId: this.connectionId,
      socketId: this.socketId,
      data,
    }).catch(() => this.dispatchEvent(new Event('error')))
  }

  close(): void {
    if (this.closeRequested || this.closePublished) return
    this.closeRequested = true
    this.readyState = WebSocket.CLOSING
    void HermesNative.disconnectSocket({
      connectionId: this.connectionId,
      socketId: this.socketId,
    }).finally(() => this.publishClose())
  }

  private async open(url: string): Promise<void> {
    try {
      const listenerHandles = await Promise.all([
        HermesNative.addListener('socketMessage', event => {
          if (
            !nativeSocketEventMatches(this.connectionId, this.socketId, event)
          ) {
            return
          }
          this.dispatchEvent(new MessageEvent('message', { data: event.data }))
        }),
        HermesNative.addListener('socketState', event => {
          if (
            !nativeSocketEventMatches(this.connectionId, this.socketId, event)
          ) {
            return
          }
          if (event.state === 'open') {
            this.readyState = WebSocket.OPEN
            this.dispatchEvent(new Event('open'))
          } else if (event.state === 'failed') {
            this.readyState = WebSocket.CLOSED
            this.dispatchEvent(new Event('error'))
            this.publishClose()
          } else if (event.state === 'closing') {
            this.readyState = WebSocket.CLOSING
          } else if (event.state === 'closed') {
            this.publishClose()
          }
        }),
      ])
      if (this.closeRequested) {
        for (const handle of listenerHandles) void handle.remove()
        return
      }
      this.listenerHandles = listenerHandles
      await HermesNative.connectSocket({
        connectionId: this.connectionId,
        socketId: this.socketId,
        url,
      })
    } catch {
      if (this.closeRequested) {
        this.publishClose()
        return
      }
      this.readyState = WebSocket.CLOSED
      this.dispatchEvent(new Event('error'))
      this.publishClose()
    }
  }

  private publishClose(): void {
    if (this.closePublished) return
    this.closePublished = true
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
    for (const handle of this.listenerHandles) void handle.remove()
    this.listenerHandles = []
  }
}
