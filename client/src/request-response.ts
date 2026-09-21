import type { JsonRpcGatewayClient } from './protocol/json-rpc-client'
import type { RequestTranscriptData } from './state/transcript'

/** A visible card, not the current queue head, owns the answer. */
export async function sendRequestResponse(
  gateway: Pick<JsonRpcGatewayClient, 'request'>,
  request: RequestTranscriptData,
  value: string,
  activeSessionId: string,
): Promise<void> {
  if (request.answered || request.expired || !request.requestId) {
    throw new Error('This request is no longer available. Reconnect to refresh pending requests.')
  }
  if (request.sessionId && request.sessionId !== activeSessionId) {
    throw new Error('This request belongs to a different session.')
  }
  if (request.kind === 'approval') {
    if (!activeSessionId || !['approve', 'deny'].includes(value)) {
      throw new Error('Choose Approve or Deny on the attached request.')
    }
    await gateway.request('approval.respond', {
      session_id: request.sessionId || activeSessionId,
      request_id: request.requestId,
      choice: value === 'approve' ? 'once' : 'deny',
    })
    return
  }
  const field = { clarify: 'answer', sudo: 'password', secret: 'value' }[request.kind]
  await gateway.request(`${request.kind}.respond`, {
    request_id: request.requestId,
    [field]: value,
  })
}
