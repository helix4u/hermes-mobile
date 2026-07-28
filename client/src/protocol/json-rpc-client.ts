import type {
  GatewayConnectionState,
  GatewayEvent,
  GatewayEventFrame,
  JsonRpcResponse,
} from './types'

export interface WebSocketLike {
  readonly readyState: number
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  close(code?: number, reason?: string): void
  send(data: string): void
}

export type WebSocketFactory = (url: string) => WebSocketLike
export type GatewayEventListener = (event: GatewayEvent) => void
export type GatewayStateListener = (
  state: GatewayConnectionState,
  error?: Error,
) => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

interface SocketBinding {
  socket: WebSocketLike
  remove: () => void
}

interface ConnectingSocket extends SocketBinding {
  reject: (reason: Error) => void
}

export interface JsonRpcRequestOptions {
  timeoutMs?: number
}

const OPEN = 1

export class JsonRpcGatewayClient {
  private socket: WebSocketLike | null = null
  private connectingSocket: ConnectingSocket | null = null
  private activeSocket: SocketBinding | null = null
  private nextId = 1
  private readonly pending = new Map<string, PendingRequest>()
  private readonly eventListeners = new Set<GatewayEventListener>()
  private readonly stateListeners = new Set<GatewayStateListener>()

  constructor(
    private readonly socketFactory: WebSocketFactory = url =>
      new WebSocket(url),
    private readonly requestTimeoutMs = 30_000,
  ) {}

  get connected(): boolean {
    return this.socket?.readyState === OPEN
  }

  async connect(url: string): Promise<void> {
    this.teardownSocket(
      new Error('Gateway connection replaced'),
      false,
    )
    this.publishState('connecting')

    const socket = this.socketFactory(url)
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.removeEventListener('open', onOpen)
        socket.removeEventListener('error', onError)
        socket.removeEventListener('close', onEarlyClose)
        if (this.connectingSocket?.socket === socket) {
          this.connectingSocket = null
        }
      }

      const isCurrent = () => this.socket === socket

      const rejectCurrent = (error: Error) => {
        cleanup()
        if (!isCurrent()) return
        this.socket = null
        this.publishState('failed', error)
        reject(error)
      }

      const onOpen: EventListener = () => {
        if (!isCurrent()) {
          cleanup()
          return
        }
        cleanup()
        this.bindActiveSocket(socket)
        this.publishState('connected')
        resolve()
      }

      const onError: EventListener = () => {
        rejectCurrent(
          new Error('Could not open the Hermes Mobile gateway'),
        )
      }

      const onEarlyClose: EventListener = () => {
        rejectCurrent(
          new Error('Hermes Mobile gateway closed while connecting'),
        )
      }

      this.connectingSocket = {
        socket,
        reject,
        remove: cleanup,
      }
      socket.addEventListener('open', onOpen)
      socket.addEventListener('error', onError)
      socket.addEventListener('close', onEarlyClose)
    })
  }

  disconnect(): void {
    this.teardownSocket(new Error('Gateway disconnected'), true)
  }

  private teardownSocket(error: Error, publishDisconnected: boolean): void {
    const socket = this.socket
    this.socket = null

    const connecting = this.connectingSocket
    if (connecting?.socket === socket) {
      connecting.remove()
      this.connectingSocket = null
      connecting.reject(error)
    }

    const active = this.activeSocket
    if (active?.socket === socket) {
      active.remove()
      this.activeSocket = null
    }

    if (socket) {
      socket.close(1000, 'client disconnect')
    }

    this.rejectPending(error)
    if (publishDisconnected) {
      this.publishState('disconnected')
    }
  }

  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: JsonRpcRequestOptions = {},
  ): Promise<T> {
    const socket = this.socket
    if (!socket || socket.readyState !== OPEN) {
      throw new Error('Hermes Mobile gateway is not connected')
    }

    const id = String(this.nextId++)
    const frame = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timeout,
      })

      try {
        socket.send(frame)
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  onEvent(listener: GatewayEventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onState(listener: GatewayStateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private handleMessage(event: Event): void {
    const data = (event as MessageEvent).data
    const raw = typeof data === 'string' ? data : String(data)

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let frame: JsonRpcResponse<unknown> | GatewayEventFrame
      try {
        frame = JSON.parse(trimmed) as JsonRpcResponse<unknown> | GatewayEventFrame
      } catch {
        continue
      }

      if ('method' in frame && frame.method === 'event') {
        for (const listener of this.eventListeners) {
          listener(frame.params)
        }
        continue
      }

      const response = frame as JsonRpcResponse<unknown>
      const id = response.id == null ? '' : String(response.id)
      const pending = this.pending.get(id)
      if (!pending) continue

      clearTimeout(pending.timeout)
      this.pending.delete(id)

      if (response.error) {
        pending.reject(
          new Error(
            `Hermes RPC ${response.error.code}: ${response.error.message}`,
          ),
        )
      } else {
        pending.resolve(response.result)
      }
    }
  }

  private bindActiveSocket(socket: WebSocketLike): void {
    const onMessage: EventListener = event => {
      if (this.socket !== socket) return
      this.handleMessage(event)
    }
    const onClose: EventListener = () => {
      if (this.socket !== socket) return
      binding.remove()
      this.activeSocket = null
      this.socket = null
      this.rejectPending(new Error('Gateway connection closed'))
      this.publishState('disconnected')
    }
    const onSocketError: EventListener = () => {
      if (this.socket !== socket) return
      this.publishState('failed', new Error('Gateway WebSocket error'))
    }
    const binding: SocketBinding = {
      socket,
      remove: () => {
        socket.removeEventListener('message', onMessage)
        socket.removeEventListener('close', onClose)
        socket.removeEventListener('error', onSocketError)
      },
    }
    this.activeSocket = binding
    socket.addEventListener('message', onMessage)
    socket.addEventListener('close', onClose)
    socket.addEventListener('error', onSocketError)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private publishState(
    state: GatewayConnectionState,
    error?: Error,
  ): void {
    for (const listener of this.stateListeners) {
      listener(state, error)
    }
  }
}
