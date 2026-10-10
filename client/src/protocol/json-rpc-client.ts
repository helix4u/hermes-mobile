import type {
  GatewayConnectionState,
  GatewayEvent,
  GatewayEventFrame,
  JsonRpcResponse,
} from './types'
import { CanonicalClientProtocol } from '../vendor/gateway/canonical-protocol'
import { NATIVE_GATEWAY_PROTOCOL, prepareCanonicalRequest, projectCanonicalResult } from './canonical-gateway'

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

export class JsonRpcGatewayError extends Error {
  constructor(message: string, readonly code: number, readonly data?: unknown) {
    super(message)
    this.name = 'JsonRpcGatewayError'
  }
}

export function isSubmissionDeliveryUncertain(error: unknown): error is JsonRpcGatewayError {
  return error instanceof JsonRpcGatewayError && Boolean(error.data && typeof error.data === 'object' &&
    (error.data as Record<string, unknown>).reason === 'SUBMISSION_DELIVERY_UNCERTAIN')
}

export const SUBMISSION_UNCERTAIN_MESSAGE = "Delivery not confirmed. The request may already have been accepted. Reconnect and check this session's status before sending it again."

export class JsonRpcGatewayClient {
  private socket: WebSocketLike | null = null
  private connectingSocket: ConnectingSocket | null = null
  private activeSocket: SocketBinding | null = null
  private nextId = 1
  private sharedRuntime = false
  private canonical = false
  private expectedCanonical = false
  private protocol = new CanonicalClientProtocol('mobile')
  private readonly pending = new Map<string, PendingRequest>()
  private readonly eventListeners = new Set<GatewayEventListener>()
  private readonly stateListeners = new Set<GatewayStateListener>()

  constructor(
    private readonly socketFactory: WebSocketFactory = url =>
      new WebSocket(url),
    private readonly requestTimeoutMs = 30_000,
    private readonly mapParams?: (params: Record<string, unknown>) => Record<string, unknown>,
    private readonly mapResult?: (method: string, result: unknown) => unknown,
  ) {}

  get connected(): boolean {
    return this.socket?.readyState === OPEN
  }

  get isSharedRuntime(): boolean {
    return this.sharedRuntime
  }

  expectProtocol(protocol: string | undefined): void {
    this.expectedCanonical = protocol === NATIVE_GATEWAY_PROTOCOL
  }

  async connect(url: string): Promise<void> {
    this.canonical = this.expectedCanonical
    this.sharedRuntime = this.expectedCanonical
    this.protocol = new CanonicalClientProtocol('mobile')
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
    this.sharedRuntime = false
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
    const canonical = this.canonical
    const protocol = this.protocol
    const brokerSubmission = method === 'prompt.submit' && this.sharedRuntime
    const mappedParams = { ...(this.mapParams ? this.mapParams(params) : params) }
    if (canonical && method === 'prompt.submit' && typeof mappedParams.submission_id === 'string' &&
      protocol.runningGeneration(mappedParams.session_id, mappedParams.profile) !== undefined && mappedParams.busy_mode !== 'queue') {
      const found = await this.request<{ receipt: unknown }>('prompt.lookup', {
        session_id: mappedParams.session_id, input_id: mappedParams.submission_id,
      }, options)
      if (this.socket !== socket) throw Error('Gateway connection changed before submission')
      if (found.receipt) mappedParams.busy_mode = 'queue'
    }
    const prepared = canonical ? prepareCanonicalRequest(protocol, method, mappedParams) : { method, params: mappedParams }
    const wireParams = prepared.params
    let frame = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: prepared.method,
      params: wireParams,
    })
    let submissionId = wireParams.submission_id
    if (brokerSubmission) {
      // Validate/snapshot mapping and serialization before allocating a key.
      // A pre-send scope/encoding failure is a definite local refusal.
      const encoded = JSON.parse(frame)
      if (!encoded.params || typeof encoded.params !== 'object' || Array.isArray(encoded.params)) {
        throw new Error('Prompt parameters must be an object')
      }
      if (prepared.method === 'prompt.submit' && encoded.params.submission_id === undefined) {
        encoded.params.submission_id = globalThis.crypto.randomUUID()
        frame = JSON.stringify(encoded)
      }
      submissionId = encoded.params.submission_id
      if (prepared.method === 'prompt.submit') wireParams.submission_id = submissionId
    }
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs
    const deadline = Date.now() + timeoutMs

    return new Promise<T>((resolve, reject) => {
      let sendAttempted = false
      const rejectDelivery = (error: Error) => {
        reject(brokerSubmission && sendAttempted && !(error instanceof JsonRpcGatewayError)
          ? new JsonRpcGatewayError(SUBMISSION_UNCERTAIN_MESSAGE, -32052, {
            reason: 'SUBMISSION_DELIVERY_UNCERTAIN', submission_id: submissionId,
          }) : error)
      }
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        rejectDelivery(new Error(`${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: value => {
          const complete = async () => {
            if (this.socket !== socket) throw Error('Gateway connection changed before the receipt was applied')
            if (canonical || this.canonical) {
              value = projectCanonicalResult(protocol, method, prepared.method, wireParams, value)
              value = await protocol.settle(method, wireParams, value, (nextMethod, nextParams) => {
                if (this.socket !== socket) throw Error('Gateway connection changed during session refresh')
                return this.request(nextMethod, nextParams)
              })
            }
            if (this.socket !== socket) throw Error('Gateway connection changed before the receipt was applied')
            resolve((this.mapResult ? this.mapResult(method, value) : value) as T)
          }
          void complete().catch(error => rejectDelivery(error instanceof Error ? error : new Error(String(error))))
        },
        reject: rejectDelivery,
        timeout,
      })

      try {
        sendAttempted = true
        socket.send(frame)
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(id)
        rejectDelivery(error instanceof Error ? error : new Error(String(error)))
      }
    }).catch(async error => {
      const reason = error instanceof JsonRpcGatewayError && error.data && typeof error.data === 'object'
        ? (error.data as Record<string, unknown>).reason : undefined
      if (!canonical || !['session.resume', 'session.activate'].includes(method) ||
        typeof wireParams.session_id !== 'string' || wireParams.title !== undefined ||
        !['not_found', 'storage_unavailable'].includes(String(reason))) throw error
      const retryOptions = () => {
        if (this.socket !== socket) throw Error('Gateway connection changed during session recovery')
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw Error(`${method} timed out during session recovery`)
        return { ...options, timeoutMs: remaining }
      }
      try {
        return await this.request<T>('session.resume', { ...wireParams, title: wireParams.session_id }, retryOptions())
      } catch (resolutionError) {
        if (!(resolutionError instanceof JsonRpcGatewayError) || !resolutionError.data ||
          (resolutionError.data as Record<string, unknown>).reason !== 'not_found') throw resolutionError
      }
      // A storage refusal is never permission to adopt a different transcript.
      if (reason === 'storage_unavailable') throw error
      const adopted = await this.request<unknown>('session.adopt',
        protocol.adoptionParams(wireParams.session_id, wireParams.profile), retryOptions())
      if (this.socket !== socket) throw Error('Gateway connection changed during session recovery')
      const projected = projectCanonicalResult(protocol, method, prepared.method, wireParams, adopted)
      return (this.mapResult ? this.mapResult(method, projected) : projected) as T
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
        if (frame.params.type === 'gateway.ready') {
          this.canonical = frame.params.payload?.native_gateway_protocol === NATIVE_GATEWAY_PROTOCOL
          this.sharedRuntime = this.canonical || frame.params.payload?.shared_runtime === true
        }
        if (this.canonical) this.protocol.event({ ...frame.params, profile: frame.params.profile ?? this.mapParams?.({}).profile as string | undefined })
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
          new JsonRpcGatewayError(
            `Hermes RPC ${response.error.code}: ${response.error.message}`,
            response.error.code,
            response.error.data,
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
      this.sharedRuntime = false
      this.canonical = false
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
