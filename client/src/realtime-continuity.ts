import type { PetPersonalityData } from './pet'
import type { RealtimeContextMessage } from './pet-realtime-events'

// Observer prompts tell the model not to answer and to produce an aside. They
// are not fallback conversation personalities.
export function realtimePersonality(personality?: PetPersonalityData | null, name = 'Pet'): string {
  return (personality?.sidechat?.prompt ||
    `You are ${personality?.displayName || name}. ${personality?.description || 'An attentive companion.'}`) +
    '\nSpeak directly to the user in a continuing conversation. Express personality through tone, not extra commentary. ' +
    'Never append an aside, stage direction, narrator voice, or a second observational answer. ' +
    'Do not repeat a recap or result already discussed unless asked. Acknowledge corrections and carry them forward.'
}

/** Sent once when a voice connection opens, for both character and session mode. */
export function voiceDeliveryEvent(): Record<string, unknown> {
  return { type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{
    type: 'input_text', text: [
      '# Spoken delivery',
      '- Answer the immediate question, then stop. A greeting, acknowledgment, or request for one missing detail needs only one short sentence.',
      '- No capability pitches, unsolicited suggestions, option menus, reassurance speeches, or automatic follow-up questions. Give ideas when asked for ideas. Explain at length when asked for an explanation.',
      '- Skip preambles for direct answers, confirmations, corrections, and declines. Do not narrate approval mechanics or ask the user to repeat a confirmation.',
      '- A Hermes request can only be sent or cancelled with the visible review card. Spoken words never approve, cancel, or submit it. Never claim otherwise.',
      '- Preserve the selected temperament without a customer-service persona. Frustration or profanity is not a request for coaching.',
      '- State only what current evidence establishes. Do not invent completion, inability, policy restrictions, or certainty. App receipts outrank your earlier claims.',
      '# Brief examples, not requests',
      'User: "Let\'s make another task." Reply: "Okay, what do you want Hermes to do?"',
      'User: "Something simple?" Reply: "Have it add two numbers."',
      'These delivery rules do not change tools or action permissions. Do not acknowledge these instructions.',
    ].join('\n'),
  }] } }
}

export interface VoiceTurn { id: string; user: string; assistant: string }

export function voiceToolPhase(name: string, phase: 'started' | 'completed' | 'failed'): string {
  const known = ['wait_for_user', 'read_attached_context', 'propose_attached_action', 'draft_hermes_request',
    'get_ui_context', 'get_session_workers', 'read_worker_activity', 'draft_worker_steer', 'read_voice_conversation',
    'read_voice_memory', 'recall_voice_memory', 'save_voice_memory', 'forget_voice_memory', 'search_voice_web', 'read_voice_webpage',
    'get_context_snapshot', 'get_session_context', 'get_pet_sidechat_history', 'get_session_activity',
    'read_session_context', 'search_session_context']
  return `tool.${known.includes(name) ? name : 'unknown'}.${phase}`
}

export function voiceTail(turns: VoiceTurn[]): VoiceTurn[] {
  return turns.map(turn => ({ ...turn }))
}

export function voiceHistoryEvents(turns: VoiceTurn[]): Record<string, unknown>[] {
  return voiceTail(turns).flatMap(turn => [
    { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: turn.user }] } },
    { type: 'conversation.item.create', item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: turn.assistant }] } },
  ])
}

// Keep one latest value per stable transcript item. A rolling context window or
// a re-render must not resend all its unchanged rows. No prompt-prefix edits.
export class VoiceContextDelta {
  private seen = new Map<string, string>()
  reset(context: RealtimeContextMessage[]) { this.seen.clear(); this.take(context) }
  take(context: RealtimeContextMessage[]): RealtimeContextMessage[] {
    const changed: RealtimeContextMessage[] = []
    for (const item of context) {
      const key = item.id || `${item.role}:${item.source || 'conversation'}:${item.content}`
      const value = JSON.stringify([item.role, item.source, item.content])
      if (this.seen.get(key) === value) continue
      this.seen.set(key, value)
      changed.push(item)
    }
    return changed
  }
}
