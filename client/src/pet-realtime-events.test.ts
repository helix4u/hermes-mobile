import { describe, expect, it } from 'vitest'
import {
  realtimeAssistantTranscript,
  realtimeContextUpdateText,
  realtimeError,
  realtimeFunctionCalls,
  realtimeInputItemId,
  realtimeResponseUsage,
  realtimeTranscriptIsNoise,
  realtimeUserTranscript,
} from './pet-realtime-events'

describe('pet realtime events', () => {
  it('extracts complete transcripts and lossless context updates', () => {
    expect(
      realtimeUserTranscript({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: '  hello pet  ',
      }),
    ).toBe('hello pet')
    expect(
      realtimeAssistantTranscript({
        type: 'response.output_audio_transcript.delta',
        delta: 'hey',
      }),
    ).toEqual({ done: false, text: 'hey' })
    const text = realtimeContextUpdateText([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
    ])
    expect(text).toContain('User:\nfirst')
    expect(text).toContain('Hermes:\nsecond')
    const longContent = 'a'.repeat(20_000)
    const complete = realtimeContextUpdateText([
      { role: 'assistant', content: longContent },
    ])
    expect(complete).toContain(longContent)
    expect(complete).not.toContain('truncated')
    const page = realtimeContextUpdateText(Array.from({ length: 12 }, (_, id) => ({ role: 'user' as const, content: `Row ${id}` })))
    for (let id = 0; id < 12; id += 1) expect(page).toContain(`Row ${id}`)
    expect(page).not.toContain('omitted')
  })

  it('extracts function calls and usage without trusting malformed frames', () => {
    const frame = {
      type: 'response.done',
      response: {
        status: 'completed',
        usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
        output: [
          {
            type: 'function_call',
            name: 'draft_hermes_request',
            call_id: 'call-1',
            arguments: '{"message":"run tests"}',
          },
        ],
      },
    }
    expect(realtimeFunctionCalls(frame)).toEqual([
      {
        arguments: '{"message":"run tests"}',
        callId: 'call-1',
        name: 'draft_hermes_request',
      },
    ])
    expect(realtimeResponseUsage(frame)).toEqual({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    })
    expect(realtimeFunctionCalls({ type: 'response.done', response: {} })).toEqual([])
  })

  it('identifies explicit non-speech transcripts without swallowing real speech', () => {
    expect(realtimeTranscriptIsNoise('[coughing]')).toBe(true)
    expect(realtimeTranscriptIsNoise('Ahem.')).toBe(true)
    expect(realtimeTranscriptIsNoise('I coughed again')).toBe(false)
    expect(realtimeInputItemId({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'audio-1',
    })).toBe('audio-1')
  })

  it('surfaces provider errors without throwing on unknown data', () => {
    expect(
      realtimeError({ type: 'error', error: { message: 'quota exhausted' } }),
    ).toBe('quota exhausted')
    expect(realtimeError({ unexpected: true })).toBe('')
  })
})
