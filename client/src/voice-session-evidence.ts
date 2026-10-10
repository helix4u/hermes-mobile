import type { RealtimeContextMessage } from './pet-realtime-events'
import type { HermesRequestReview } from './hermes-request-reviews'

export interface VoiceSubmission {
  requestId?: string
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
  requests?: HermesRequestReview[]
  selectedRequestId?: string
}) {
  return {
    latestAssistantMessage: [...context].reverse().find(item => item.role === 'assistant' &&
      (!item.source || item.source === 'conversation') && item.content.trim()) ?? null,
    voiceRequest: {
      pendingReview: state.requests ? state.requests.some(row => row.sessionId === state.sessionId && row.status !== 'sent') : Boolean(state.sessionId && state.pendingSessionId === state.sessionId && state.pendingDraft.trim()),
      ...(state.requests ? {
        requests: state.requests.filter(row => row.sessionId === state.sessionId),
        selectedRequestId: state.requests.some(row => row.sessionId === state.sessionId && row.requestId === state.selectedRequestId) ? state.selectedRequestId : null,
      } : {}),
      lastSubmission: state.lastSubmission?.sessionId === state.sessionId ? state.lastSubmission : null,
    },
  }
}
