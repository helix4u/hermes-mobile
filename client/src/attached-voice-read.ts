/** Context-only calls must refresh their owning application, not replay the
 * identity snapshot through the ordinary Hermes-session RPC. */
export function isAttachedVoiceRead(name: string, sessionId?: string, attached = false): boolean {
  return !sessionId && attached && ['read_attached_context', 'get_context_snapshot', 'get_session_context'].includes(name)
}

export function attachedVoiceRecord(result: Record<string, unknown>) {
  return { id: 'attached-application-read', role: 'user' as const, content: JSON.stringify(result) }
}
