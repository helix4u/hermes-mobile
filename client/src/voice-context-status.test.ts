import { describe, expect, it } from 'vitest'
import { voiceContextStatusFromEvidence, voiceMemoryStatusFromResult } from './voice-context-status'

describe('voice session context status', () => {
  it('marks a bounded attached-session snapshot as a preview', () => {
    expect(voiceContextStatusFromEvidence({
      contextMessages: 12,
      coverage: {
        hasNewer: false,
        hasOlder: true,
        returnedMessages: 12,
        totalMessages: 48,
      },
      session: { observedAt: '2026-09-15T23:29:45-06:00' },
    })).toEqual({
      loadState: 'preview',
      loadedMessages: 12,
      memoryRecords: 0,
      memoryState: 'checking',
      observedAt: '2026-09-15T23:29:45-06:00',
      totalMessages: 48,
    })
  })

  it('reports whether the separate voice notebook has saved records', () => {
    expect(voiceMemoryStatusFromResult({ records: [{ key: 'topic' }, { key: 'voice' }] }))
      .toEqual({ memoryState: 'available', memoryRecords: 2 })
    expect(voiceMemoryStatusFromResult({ records: [] }))
      .toEqual({ memoryState: 'empty', memoryRecords: 0 })
  })
})
