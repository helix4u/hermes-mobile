/** Fixed diagnostic vocabulary. Provider errors can contain private payloads. */
export function voiceFailureReason(value: unknown): string {
  const error = value && typeof value === 'object' ? value as { code?: unknown; message?: unknown } : {}
  const code = error.code
  const message = typeof error.message === 'string' ? error.message : ''
  if (/instructions cannot be longer|context_length_exceeded|maximum context length|too many tokens/i.test(message)) return 'context_capacity'
  const codes: Record<string, string> = {
    response_cancel_not_active: 'cancel_already_complete',
    conversation_already_has_active_response: 'response_busy',
    input_audio_buffer_commit_empty: 'empty_input',
    rate_limit_exceeded: 'rate_limited',
    invalid_api_key: 'authentication',
    session_expired: 'session_expired',
    '4007': 'session_missing',
    '5031': 'context_backend_error',
  }
  if ((typeof code === 'string' || typeof code === 'number') && Object.hasOwn(codes, code)) return codes[String(code)]
  if (/not connected|socket.*(?:closed|not open)|gateway.*disconnected/i.test(message)) return 'disconnected'
  if (/timed?\s*out|timeout/i.test(message)) return 'timeout'
  if (/cancelled by user interruption/i.test(message)) return 'interrupted'
  return 'unknown'
}

export function voiceProviderFailurePhase(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const event = value as { type?: unknown; error?: unknown; response?: { status?: unknown; status_details?: { error?: unknown } } }
  if (event.type === 'error') return `provider.error.${voiceFailureReason(event.error)}`
  if (event.type === 'response.done' && event.response?.status === 'failed') {
    return `provider.response_failed.${voiceFailureReason(event.response.status_details?.error)}`
  }
  return null
}
