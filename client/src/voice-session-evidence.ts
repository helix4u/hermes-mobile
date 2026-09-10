import type { RealtimeContextMessage } from './pet-realtime-events'

export interface VoiceSubmission {
  sessionId: string
  status: 'accepted' | 'steering_queued'
  submittedRequest: string
  reviewed: boolean
}

// App-owned review state is current evidence, not an inference from old tool
// receipts or model prose. An accepted request does not prove task completion.
export function sessionVoiceEvidence(context: RealtimeContextMessage[], state: {
  sessionId: string
  pendingSessionId: string
  pendingDraft: string
  lastSubmission: VoiceSubmission | null
}) {
  return {
    latestAssistantMessage: [...context].reverse().find(item => item.role === 'assistant' &&
      (!item.source || item.source === 'conversation') && item.content.trim()) ?? null,
    voiceRequest: {
      pendingReview: Boolean(state.sessionId && state.pendingSessionId === state.sessionId && state.pendingDraft.trim()),
      lastSubmission: state.lastSubmission?.sessionId === state.sessionId ? state.lastSubmission : null,
    },
  }
}
