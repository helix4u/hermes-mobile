export interface RealtimeFunctionCall {
  arguments: string
  callId: string
  name: string
}

export interface RealtimeContextMessage {
  id?: string
  content: string
  role: 'assistant' | 'user'
  source?: 'conversation' | 'pet_commentary' | 'tool_activity'
  truncated?: boolean
  omittedCharacters?: number
}

export function realtimeContextUpdateText(
  context: RealtimeContextMessage[],
): string {
  const selected: string[] = []
  for (const message of context) {
    const content = message.content.trim()
    if (!content) continue
    const source = message.source && message.source !== 'conversation'
      ? ` [${message.source.replace('_', ' ')}]`
      : ''
    selected.push(`${message.role === 'user' ? 'User' : 'Hermes'}${source}:\n${content}`)
  }
  return selected.join('\n\n')
}

interface RealtimeEventRecord {
  [key: string]: unknown
  type?: unknown
}

function record(value: unknown): RealtimeEventRecord | null {
  return value && typeof value === 'object'
    ? (value as RealtimeEventRecord)
    : null
}

export function realtimeEventType(value: unknown): string {
  const event = record(value)
  return typeof event?.type === 'string' ? event.type : ''
}

export function realtimeUserTranscript(value: unknown): string {
  const event = record(value)
  return realtimeEventType(event) ===
    'conversation.item.input_audio_transcription.completed' &&
    typeof event?.transcript === 'string'
    ? event.transcript.trim()
    : ''
}

export function realtimeInputItemId(value: unknown): string {
  const event = record(value)
  return realtimeEventType(event) ===
    'conversation.item.input_audio_transcription.completed' &&
    typeof event?.item_id === 'string'
    ? event.item_id
    : ''
}

export function realtimeTranscriptIsNoise(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^[[(<]\s*/, '')
    .replace(/\s*[\])>]$/, '')
    .replace(/[.!?,;:…]+$/g, '')
    .trim()
  return /^(?:ahem|cough(?:ing|s)?|clears? (?:his |her |their )?throat|throat clear(?:ing)?|sneez(?:e|es|ing)|sniff(?:s|ing)?|rustl(?:e|es|ing)|background noise|inaudible|silence)$/.test(normalized)
}

export function realtimeAssistantTranscript(
  value: unknown,
): { done: boolean; text: string } | null {
  const event = record(value)
  const type = realtimeEventType(event)
  if (
    type === 'response.output_audio_transcript.delta' &&
    typeof event?.delta === 'string'
  ) {
    return { done: false, text: event.delta }
  }
  if (
    type === 'response.output_audio_transcript.done' &&
    typeof event?.transcript === 'string'
  ) {
    return { done: true, text: event.transcript.trim() }
  }
  return null
}

export function realtimeFunctionCalls(value: unknown): RealtimeFunctionCall[] {
  const event = record(value)
  if (realtimeEventType(event) !== 'response.done') return []
  const response = record(event?.response)
  if (!Array.isArray(response?.output)) return []
  return response.output.flatMap(item => {
    const call = record(item)
    if (
      call?.type !== 'function_call' ||
      typeof call.name !== 'string' ||
      typeof call.call_id !== 'string' ||
      typeof call.arguments !== 'string'
    ) {
      return []
    }
    return [
      {
        arguments: call.arguments,
        callId: call.call_id,
        name: call.name,
      },
    ]
  })
}

export function realtimeResponseId(value: unknown): string {
  const event = record(value)
  const response = record(event?.response)
  return typeof response?.id === 'string' ? response.id : ''
}

export function realtimeResponseCompleted(value: unknown): boolean {
  const event = record(value)
  return record(event?.response)?.status === 'completed'
}

export function realtimeResponseUsage(
  value: unknown,
): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  const event = record(value)
  if (realtimeEventType(event) !== 'response.done') return null
  const usage = record(record(event?.response)?.usage)
  if (!usage) return null
  const count = (candidate: unknown) =>
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.max(0, candidate)
      : 0
  const inputTokens = count(usage.input_tokens)
  const outputTokens = count(usage.output_tokens)
  const totalTokens = count(usage.total_tokens) || inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

export function realtimeError(value: unknown): string {
  const event = record(value)
  if (realtimeEventType(event) === 'conversation.item.input_audio_transcription.failed') {
    return 'Live voice could not transcribe your audio. Check the microphone and retry live voice.'
  }
  if (realtimeEventType(event) === 'response.done') {
    const response = record(event?.response)
    if (response?.status === 'failed') {
      const details = record(response.status_details)
      const code = record(details?.error)?.code
      const safeCode = typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) ? ` (${code})` : ''
      return `Live voice response failed${safeCode}. Retry live voice.`
    }
  }
  if (realtimeEventType(event) !== 'error') return ''
  const error = record(event?.error)
  if (error?.code === 'response_cancel_not_active') return ''
  return typeof error?.message === 'string'
    ? error.message
    : 'OpenAI Realtime voice failed'
}
