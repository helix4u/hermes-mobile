import { CanonicalClientProtocol } from '../vendor/gateway/canonical-protocol'

export const NATIVE_GATEWAY_PROTOCOL = 'hermes-gateway-v1'

export function prepareCanonicalRequest(protocol: CanonicalClientProtocol, method: string, params: Record<string, unknown>) {
  const input = { ...params }
  if (method === 'gateway.ping') return { method: 'ping', params: {} }
  if (method === 'session.create') delete input.preview
  if (method === 'prompt.submit') {
    const mode = input.busy_mode
    delete input.busy_mode
    if (mode !== undefined && !['interrupt', 'steer', 'queue'].includes(String(mode))) throw Error('Unsupported active-turn input mode')
    const generation = protocol.runningGeneration(input.session_id, input.profile)
    if (generation !== undefined && ['interrupt', 'steer'].includes(String(mode)) && !input.queued && input.reject_if_busy !== true) {
      if (Array.isArray(input.attachments) && input.attachments.length) throw Error('Queue attachments or stop the active turn before sending them')
      const control = mode === 'steer' ? 'session.steer' : 'session.redirect'
      return { method: control, params: protocol.prepare(control, { session_id: input.session_id,
        text: input.text, profile: input.profile, execution_generation: generation }) }
    }
  }
  const prepared = protocol.prepare(method, input)
  return { method: protocol.wire(method, prepared), params: prepared }
}

export function projectCanonicalResult(protocol: CanonicalClientProtocol, method: string, wireMethod: string,
  params: Record<string, unknown>, value: unknown) {
  if (method === 'prompt.submit' && wireMethod !== 'prompt.submit') {
    return { ...(value as Record<string, unknown>), session_id: params.session_id }
  }
  return protocol.result(method, params, value)
}
