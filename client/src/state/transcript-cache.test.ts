import { describe, expect, test } from 'vitest'
import type { TranscriptItem } from './transcript'
import {
  cacheTranscript,
  readCachedTranscript,
  transcriptCacheKey,
  type TranscriptCache,
} from './transcript-cache'

function toolRow(id: string, result: string): TranscriptItem {
  return {
    id,
    kind: 'tool',
    tool: {
      toolId: id,
      name: 'terminal',
      result,
      status: 'complete',
    },
  }
}

describe('transcript navigation cache', () => {
  test('keeps rich rows isolated by connection and stored session', () => {
    const cache: TranscriptCache = new Map()
    const workstation = [toolRow('tool-1', 'full workstation output')]
    const cloud = [toolRow('tool-1', 'full cloud output')]

    cacheTranscript(cache, 'workstation', 'session-1', workstation)
    cacheTranscript(cache, 'cloud', 'session-1', cloud)

    expect(readCachedTranscript(cache, 'workstation', 'session-1')).toBe(
      workstation,
    )
    expect(readCachedTranscript(cache, 'cloud', 'session-1')).toBe(cloud)
    expect(transcriptCacheKey('workstation', 'session-1')).not.toBe(
      transcriptCacheKey('cloud', 'session-1'),
    )
  })

  test('bounds old sessions without evicting the most recently inspected row', () => {
    const cache: TranscriptCache = new Map()
    cacheTranscript(cache, 'host', 'one', [toolRow('one', '1')], 2)
    cacheTranscript(cache, 'host', 'two', [toolRow('two', '2')], 2)
    expect(readCachedTranscript(cache, 'host', 'one')).toBeDefined()

    cacheTranscript(cache, 'host', 'three', [toolRow('three', '3')], 2)

    expect(readCachedTranscript(cache, 'host', 'one')).toBeDefined()
    expect(readCachedTranscript(cache, 'host', 'two')).toBeUndefined()
    expect(readCachedTranscript(cache, 'host', 'three')).toBeDefined()
  })
})
