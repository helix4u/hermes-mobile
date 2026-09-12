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
  private responses = new Map<string, { id: string; calls: Map<string, LiveFunctionCall> }>()
  private completed = new Set<string>()

  reset(): void {
    this.responses.clear()
    this.completed.clear()
  }

  accept(raw: unknown): LiveFunctionCall[] | null {
    const envelope = record(raw)
    if (envelope.type !== 'response.event' || typeof envelope.delegation_id !== 'string') return null
    const event = record(envelope.event)
    const response = record(event.response)
    const key = envelope.delegation_id
    if (event.type === 'response.created' && typeof response.id === 'string') {
      if (!this.completed.has(response.id) && this.responses.get(key)?.id !== response.id)
        this.responses.set(key, { id: response.id, calls: new Map() })
      return null
    }
    const pending = this.responses.get(key)
    if (!pending) return null
    if (event.type === 'response.output_item.done') {
      const item = record(event.item)
      if (item.type === 'function_call' && typeof item.call_id === 'string' &&
          typeof item.name === 'string' && typeof item.arguments === 'string') {
        pending.calls.set(item.call_id, { callId: item.call_id, name: item.name, arguments: item.arguments })
      }
    }
    if (event.type === 'response.failed' || event.type === 'response.incomplete') {
      this.responses.delete(key)
      this.completed.add(pending.id)
      return null
    }
    if (event.type !== 'response.completed' || response.id !== pending.id) return null
    this.responses.delete(key)
    this.completed.add(pending.id)
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
