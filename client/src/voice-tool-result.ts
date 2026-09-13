/** One output closes each call. Oversized evidence is paged by VoiceResultPages. */
export function voiceToolResultEvents(callId: string, output: unknown): Record<string, unknown>[] {
  const text = JSON.stringify(output)
  const result = (body: string): Record<string, unknown> => ({
    type: 'conversation.item.create',
    item: { type: 'function_call_output', call_id: callId, output: body },
  })
  return [result(text)]
}
