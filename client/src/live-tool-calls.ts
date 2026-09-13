/** Live captions are display data. Only completed backend function items run tools. */
export interface LiveFunctionCall {
  callId: string
  name: string
  arguments: string
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Each delegation can have several Responses continuations with distinct IDs. */
export class LiveToolCalls {
  private responses = new Map<string, { id: string; delegationId: string; calls: Map<string, LiveFunctionCall> }>()
  private currentResponse = new Map<string, string>()
  private completed = new Set<string>()
  private awaitingResults = new Set<string>()
  private continuationNeeded = false

  reset(): void {
    this.responses.clear()
    this.currentResponse.clear()
    this.completed.clear()
    this.awaitingResults.clear()
    this.continuationNeeded = false
  }

  /** Live continuation is session-wide, so all overlapping calls form one barrier. */
  returnResult(callId: string, output: unknown, send: (event: Record<string, unknown>) => boolean): void {
    if (!this.awaitingResults.has(callId)) return
    if (!send(liveToolResultEvent(callId, output)))
      throw new Error('Could not deliver the voice tool result. Restart live voice to reconnect.')
    this.awaitingResults.delete(callId)
    this.continuationNeeded = true
    this.continueIfReady(send)
  }

  continueIfReady(send: (event: Record<string, unknown>) => boolean): void {
    if (!this.continuationNeeded || this.responses.size || this.awaitingResults.size) return
    if (!send({ type: 'response.create' }))
      throw new Error('Could not continue after the voice tool results. Restart live voice to reconnect.')
    this.continuationNeeded = false
  }

  accept(raw: unknown): LiveFunctionCall[] | null {
    const envelope = record(raw)
    if (envelope.type !== 'response.event' || typeof envelope.delegation_id !== 'string') return null
    const event = record(envelope.event)
    const response = record(event.response)
    const key = envelope.delegation_id
    if (event.type === 'response.created' && typeof response.id === 'string') {
      if (!this.completed.has(response.id) && !this.responses.has(response.id)) {
        this.responses.set(response.id, { id: response.id, delegationId: key, calls: new Map() })
        this.currentResponse.set(key, response.id)
      }
      return null
    }
    const id = typeof response.id === 'string' ? response.id :
      typeof event.response_id === 'string' ? event.response_id : this.currentResponse.get(key)
    const pending = id ? this.responses.get(id) : undefined
    if (!pending || pending.delegationId !== key) return null
    if (event.type === 'response.output_item.done') {
      const item = record(event.item)
      if (item.type === 'function_call' && typeof item.call_id === 'string' &&
          typeof item.name === 'string' && typeof item.arguments === 'string') {
        pending.calls.set(item.call_id, { callId: item.call_id, name: item.name, arguments: item.arguments })
      }
    }
    if (event.type === 'response.failed' || event.type === 'response.incomplete') {
      this.responses.delete(pending.id)
      if (this.currentResponse.get(key) === pending.id) this.currentResponse.delete(key)
      this.completed.add(pending.id)
      return null
    }
    if (event.type !== 'response.completed' || response.id !== pending.id) return null
    this.responses.delete(pending.id)
    if (this.currentResponse.get(key) === pending.id) this.currentResponse.delete(key)
    this.completed.add(pending.id)
    for (const call of pending.calls.values()) this.awaitingResults.add(call.callId)
    return [...pending.calls.values()]
  }
}

export function liveToolResultEvent(callId: string, output: unknown): Record<string, unknown> {
  return { type: 'response.item.create', item: {
    type: 'function_call_output', call_id: callId, output: JSON.stringify(output)
  } }
}

export function liveBackendError(raw: unknown): string {
  const envelope = record(raw)
  if (envelope.type !== 'response.event') return ''
  const event = record(envelope.event)
  if (event.type !== 'response.failed' && event.type !== 'response.incomplete') return ''
  const response = record(event.response)
  return String(record(response.error).message || record(response.incomplete_details).reason ||
    'The voice backend could not complete the request. Try again.')
}
