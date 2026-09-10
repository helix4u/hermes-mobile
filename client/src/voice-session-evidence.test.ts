import { describe, expect, it } from 'vitest'
import { sessionVoiceEvidence, type VoiceSubmission } from './voice-session-evidence'

const submission: VoiceSubmission = { sessionId: 'session-a', status: 'accepted', submittedRequest: 'Inspect the task.', reviewed: true }
const state = { sessionId: 'session-a', pendingSessionId: '', pendingDraft: '', lastSubmission: submission }

describe('current session voice evidence', () => {
  it('selects the whole answer rather than later tool or pet observations', () => {
    const answer = 'Whole synthetic result. '.repeat(2000)
    const result = sessionVoiceEvidence([
      { role: 'user', content: 'Inspect the task.' },
      { role: 'assistant', content: answer },
      { role: 'assistant', source: 'tool_activity', content: 'Old tool state' },
      { role: 'assistant', source: 'pet_commentary', content: 'An observation' },
    ], state)
    expect(result.latestAssistantMessage?.content).toBe(answer)
    expect(result.voiceRequest).toEqual({ pendingReview: false, lastSubmission: submission })
  })
  it('does not turn a previous acceptance into approval of a new draft', () => {
    expect(sessionVoiceEvidence([], { ...state, pendingSessionId: 'session-a', pendingDraft: 'A different task.' }).voiceRequest)
      .toEqual({ pendingReview: true, lastSubmission: submission })
  })
  it('does not borrow approval or submission from a different session', () => {
    expect(sessionVoiceEvidence([], { ...state, sessionId: 'session-b', pendingSessionId: 'session-a', pendingDraft: 'Old draft' }))
      .toEqual({ latestAssistantMessage: null, voiceRequest: { pendingReview: false, lastSubmission: null } })
  })
  it('does not manufacture an answer or task completion from acceptance', () => {
    const result = sessionVoiceEvidence([{ role: 'user', content: 'Question' }], state)
    expect(result.latestAssistantMessage).toBeNull()
    expect(result.voiceRequest.lastSubmission?.status).toBe('accepted')
    expect(result).not.toHaveProperty('completed')
  })
})
