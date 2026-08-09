import { describe, expect, it } from 'vitest'
import {
  historyToTranscript,
  mergeResumedTranscript,
  redactDisplayValue,
  reduceGatewayEvent,
} from './transcript'

describe('transcript projection', () => {
  it('hydrates durable pet commentary as a distinct transcript row', () => {
    const result = historyToTranscript([
      {
        id: 'pet-commentary:alien-1',
        role: 'system',
        content: 'The tiny alien has opinions.',
        display_kind: 'pet_commentary',
        display_metadata: {
          event_id: 'alien-1',
          personality_id: 'alien-child',
          personality_name: 'Alien Child',
          source: 'generated',
        },
      },
    ])

    expect(result).toEqual([
      {
        id: 'pet-commentary:alien-1',
        kind: 'pet',
        text: 'The tiny alien has opinions.',
        pet: {
          lens: undefined,
          personalityId: 'alien-child',
          personalityName: 'Alien Child',
          source: 'generated',
        },
      },
    ])
  })

  it('upserts a repeated live pet commentary event instead of duplicating it', () => {
    const event = {
      type: 'pet.commentary.recorded',
      payload: {
        commentary_id: 'alien-2',
        text: 'I am helping.',
        display_metadata: {
          personality_id: 'alien-child',
          personality_name: 'Alien Child',
        },
      },
    }
    const first = reduceGatewayEvent([], event)
    const repeated = reduceGatewayEvent(first, event)

    expect(repeated).toHaveLength(1)
    expect(repeated[0]).toMatchObject({
      id: 'pet-commentary:alien-2',
      kind: 'pet',
      text: 'I am helping.',
    })
  })

  it('deduplicates replayed durable pet commentary after compaction', () => {
    const result = historyToTranscript([
      {
        role: 'system',
        content: 'Older projected copy.',
        display_kind: 'pet_commentary',
        display_metadata: {
          event_id: 'alien-compacted-1',
          personality_name: 'Alien Child',
        },
      },
      {
        role: 'system',
        content: 'Latest projected copy.',
        display_kind: 'pet_commentary',
        display_metadata: {
          event_id: 'alien-compacted-1',
          personality_name: 'Alien Child',
          source: 'generated',
        },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'pet-commentary:alien-compacted-1',
      text: 'Latest projected copy.',
      pet: {
        personalityName: 'Alien Child',
        source: 'generated',
      },
    })
  })

  it('hydrates reasoning, messages, and stored tool rows', () => {
    const result = historyToTranscript([
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'done', reasoning: 'worked it out' },
      { role: 'tool', name: 'terminal', context: 'ran pwd' },
    ])

    expect(result.map(item => item.kind)).toEqual([
      'user',
      'reasoning',
      'assistant',
      'tool',
    ])
    expect(result[1].text).toBe('worked it out')
  })

  it('accepts durable tool field names from stored Hermes messages', () => {
    const result = historyToTranscript([
      {
        role: 'tool',
        tool_call_id: 'call-1',
        tool_name: 'web_search',
        context: 'today news',
      },
    ])

    expect(result[0].tool).toMatchObject({
      toolId: 'call-1',
      name: 'web_search',
      context: 'today news',
    })
  })

  it('merges a tool lifecycle and keeps normal args/results', () => {
    const started = reduceGatewayEvent([], {
      type: 'tool.start',
      payload: {
        tool_id: 't1',
        name: 'terminal',
        args: { command: 'pwd' },
      },
    })
    const completed = reduceGatewayEvent(started, {
      type: 'tool.complete',
      payload: {
        tool_id: 't1',
        name: 'terminal',
        args: { command: 'pwd' },
        result: { output: '/workspace' },
      },
    })

    expect(completed).toHaveLength(1)
    expect(completed[0].tool?.status).toBe('complete')
    expect(completed[0].tool?.args).toEqual({ command: 'pwd' })
    expect(completed[0].tool?.result).toEqual({ output: '/workspace' })
  })

  it('accepts the gateway verbose args_text and result_text fields', () => {
    const started = reduceGatewayEvent([], {
      type: 'tool.start',
      payload: {
        tool_id: 't2',
        name: 'web_search',
        context: 'Utah weather',
        args_text: '{\n  "query": "Utah weather"\n}',
      },
    })
    const completed = reduceGatewayEvent(started, {
      type: 'tool.complete',
      payload: {
        tool_id: 't2',
        name: 'web_search',
        result_text: 'Sunny, 84°F',
      },
    })

    expect(completed[0].tool).toMatchObject({
      args: '{\n  "query": "Utah weather"\n}',
      context: 'Utah weather',
      result: 'Sunny, 84°F',
      status: 'complete',
    })
  })

  it('preserves live tool payloads when foreground resume hydrates summaries', () => {
    const current = reduceGatewayEvent([], {
      type: 'tool.complete',
      payload: {
        tool_id: 'live-1',
        name: 'web_search',
        context: 'today news',
        args_text: '{"query":"today news"}',
        result_text: 'Three current stories',
      },
    })
    const merged = mergeResumedTranscript(current, [
      {
        role: 'tool',
        name: 'web_search',
        context: 'today news',
      },
    ])

    expect(merged[0].tool).toMatchObject({
      name: 'web_search',
      args: '{"query":"today news"}',
      result: 'Three current stories',
      status: 'complete',
    })
  })

  it('matches hydrated tools by stable id when the durable context differs', () => {
    const current = reduceGatewayEvent([], {
      type: 'tool.complete',
      payload: {
        tool_id: 'stable-tool-1',
        name: 'terminal',
        context: 'live command context',
        args: { command: 'pwd' },
        result: { output: '/workspace' },
      },
    })
    const merged = mergeResumedTranscript(current, [
      {
        role: 'tool',
        tool_call_id: 'stable-tool-1',
        tool_name: 'terminal',
        context: 'short durable summary',
      },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].tool).toMatchObject({
      toolId: 'stable-tool-1',
      args: { command: 'pwd' },
      result: { output: '/workspace' },
    })
  })

  it('keeps unmatched completed live tools when hydration lacks a match', () => {
    const current = reduceGatewayEvent([], {
      type: 'tool.complete',
      payload: {
        tool_id: 'live-only',
        name: 'terminal',
        args: { command: 'pwd' },
        result: { output: '/workspace' },
      },
    })
    const merged = mergeResumedTranscript(current, [
      {
        role: 'assistant',
        text: 'Done.',
      },
    ])

    expect(merged.some(item => item.tool?.toolId === 'live-only')).toBe(true)
    expect(
      merged.find(item => item.tool?.toolId === 'live-only')?.tool?.result,
    ).toEqual({ output: '/workspace' })
  })

  it('folds an id-less generating event into the stable tool lifecycle', () => {
    const generating = reduceGatewayEvent([], {
      type: 'tool.generating',
      payload: { name: 'terminal' },
    })
    const started = reduceGatewayEvent(generating, {
      type: 'tool.start',
      payload: {
        tool_id: 'stable-tool-2',
        name: 'terminal',
        args_text: '{"command":"pwd"}',
      },
    })
    const completed = reduceGatewayEvent(started, {
      type: 'tool.complete',
      payload: {
        tool_id: 'stable-tool-2',
        name: 'terminal',
        result_text: '/workspace',
      },
    })

    expect(completed).toHaveLength(1)
    expect(completed[0].tool).toMatchObject({
      toolId: 'stable-tool-2',
      provisional: false,
      args: '{"command":"pwd"}',
      result: '/workspace',
      status: 'complete',
    })
  })

  it('separates complete reasoning markdown chunks', () => {
    const first = reduceGatewayEvent([], {
      type: 'reasoning.delta',
      payload: { text: '**Planning data loading**' },
    })
    const second = reduceGatewayEvent(first, {
      type: 'reasoning.delta',
      payload: { text: '**Fetching weather**' },
    })

    expect(second[0].text).toBe(
      '**Planning data loading**\n\n**Fetching weather**',
    )
  })

  it('replaces a streamed reasoning preview with the completed available block', () => {
    const partial = reduceGatewayEvent([], {
      type: 'reasoning.delta',
      payload: { text: 'Planning...' },
    })
    const available = reduceGatewayEvent(partial, {
      type: 'reasoning.available',
      payload: { text: 'Planning complete.' },
    })

    expect(available[0].text).toBe('Planning complete.')
    expect(available[0].streaming).toBe(false)
  })

  it('starts a fresh reasoning block after an intervening tool call', () => {
    let transcript = reduceGatewayEvent(
      [{ id: 'user-1', kind: 'user' as const, text: 'Inspect it.' }],
      {
        type: 'reasoning.delta',
        payload: { text: 'I should inspect the file.' },
      },
    )
    transcript = reduceGatewayEvent(transcript, {
      type: 'tool.start',
      payload: { tool_id: 'read-1', name: 'read_file' },
    })
    transcript = reduceGatewayEvent(transcript, {
      type: 'tool.complete',
      payload: { tool_id: 'read-1', name: 'read_file', result_text: 'contents' },
    })
    transcript = reduceGatewayEvent(transcript, {
      type: 'reasoning.delta',
      payload: { text: 'Now I can evaluate the contents.' },
    })
    transcript = reduceGatewayEvent(transcript, {
      type: 'reasoning.available',
      payload: { text: 'Now I can evaluate the contents completely.' },
    })
    transcript = reduceGatewayEvent(transcript, {
      type: 'message.complete',
      payload: { text: 'The file is correct.' },
    })

    expect(transcript.map(item => item.kind)).toEqual([
      'user',
      'reasoning',
      'tool',
      'reasoning',
      'assistant',
    ])
    expect(transcript.filter(item => item.kind === 'reasoning').map(item => item.text)).toEqual([
      'I should inspect the file.',
      'Now I can evaluate the contents completely.',
    ])
  })

  it('does not replace pre-tool reasoning with a later available block', () => {
    let transcript = reduceGatewayEvent(
      [{ id: 'user-1', kind: 'user' as const, text: 'Inspect it.' }],
      {
        type: 'reasoning.available',
        payload: { text: 'First model step.' },
      },
    )
    transcript = reduceGatewayEvent(transcript, {
      type: 'tool.complete',
      payload: { tool_id: 'read-1', name: 'read_file', result_text: 'contents' },
    })
    transcript = reduceGatewayEvent(transcript, {
      type: 'reasoning.available',
      payload: { text: 'Second model step.' },
    })

    expect(transcript.map(item => item.kind)).toEqual([
      'user',
      'reasoning',
      'tool',
      'reasoning',
    ])
    expect(transcript.filter(item => item.kind === 'reasoning').map(item => item.text)).toEqual([
      'First model step.',
      'Second model step.',
    ])
  })

  it('places late completed reasoning before the final answer', () => {
    const user = [
      { id: 'user-1', kind: 'user' as const, text: 'Check this.' },
    ]
    const complete = reduceGatewayEvent(user, {
      type: 'message.complete',
      payload: { text: 'Final answer.' },
    })
    const lateReasoning = reduceGatewayEvent(complete, {
      type: 'reasoning.available',
      payload: { text: 'Completed reasoning.' },
    })

    expect(lateReasoning.map(item => item.kind)).toEqual([
      'user',
      'reasoning',
      'assistant',
    ])
    expect(lateReasoning[1].text).toBe('Completed reasoning.')
    expect(lateReasoning[1].streaming).toBeFalsy()
  })

  it('places a late tool completion before the final answer', () => {
    const complete = reduceGatewayEvent(
      [{ id: 'user-1', kind: 'user' as const, text: 'Run it.' }],
      {
        type: 'message.complete',
        payload: { text: 'Finished.' },
      },
    )
    const lateTool = reduceGatewayEvent(complete, {
      type: 'tool.complete',
      payload: {
        tool_id: 'late-tool',
        name: 'terminal',
        result_text: 'done',
      },
    })

    expect(lateTool.map(item => item.kind)).toEqual([
      'user',
      'tool',
      'assistant',
    ])
  })

  it('repairs an existing streamed reasoning row below the final answer', () => {
    const misplaced = [
      { id: 'user-1', kind: 'user' as const, text: 'Check this.' },
      { id: 'assistant-1', kind: 'assistant' as const, text: 'Final answer.' },
      {
        id: 'reasoning-streaming',
        kind: 'reasoning' as const,
        text: 'Still working...',
        streaming: true,
      },
    ]

    const completed = reduceGatewayEvent(misplaced, {
      type: 'reasoning.available',
      payload: { text: 'Completed reasoning.' },
    })

    expect(completed.map(item => item.kind)).toEqual([
      'user',
      'reasoning',
      'assistant',
    ])
    expect(completed[1]).toMatchObject({
      text: 'Completed reasoning.',
      streaming: false,
    })
  })

  it('repairs an existing tool row below the final answer as it updates', () => {
    const misplaced = [
      { id: 'user-1', kind: 'user' as const, text: 'Run it.' },
      { id: 'assistant-1', kind: 'assistant' as const, text: 'Finished.' },
      {
        id: 'tool-late-tool',
        kind: 'tool' as const,
        tool: {
          toolId: 'late-tool',
          name: 'terminal',
          status: 'running' as const,
        },
      },
    ]

    const completed = reduceGatewayEvent(misplaced, {
      type: 'tool.complete',
      payload: {
        tool_id: 'late-tool',
        name: 'terminal',
        result_text: 'done',
      },
    })

    expect(completed.map(item => item.kind)).toEqual([
      'user',
      'tool',
      'assistant',
    ])
    expect(completed[1].tool).toMatchObject({
      status: 'complete',
      result: 'done',
    })
  })

  it('seals already-streamed interim text without duplicating it', () => {
    const streamed = reduceGatewayEvent([], {
      type: 'message.delta',
      payload: { text: 'Let me check that.' },
    })
    const interim = reduceGatewayEvent(streamed, {
      type: 'message.interim',
      payload: {
        text: 'Let me check that.',
        already_streamed: true,
      },
    })

    expect(interim).toHaveLength(1)
    expect(interim[0]).toMatchObject({
      kind: 'assistant',
      text: 'Let me check that.',
      streaming: false,
      interim: true,
    })
  })

  it('settles an identical final onto its interim assistant row', () => {
    const interim = reduceGatewayEvent([], {
      type: 'message.interim',
      payload: { text: 'Same reply.' },
    })
    const complete = reduceGatewayEvent(interim, {
      type: 'message.complete',
      payload: { text: 'Same reply.' },
    })

    expect(complete).toHaveLength(1)
    expect(complete[0]).toMatchObject({
      kind: 'assistant',
      text: 'Same reply.',
      interim: false,
    })
  })

  it('settles a prefix-extended final onto its interim assistant row', () => {
    const interim = reduceGatewayEvent([], {
      type: 'message.interim',
      payload: { text: 'Partial answer' },
    })
    const complete = reduceGatewayEvent(interim, {
      type: 'message.complete',
      payload: { text: 'Partial answer with the rest included.' },
    })

    expect(complete).toHaveLength(1)
    expect(complete[0].text).toBe(
      'Partial answer with the rest included.',
    )
  })

  it('keeps genuinely distinct interim commentary and final text', () => {
    const interim = reduceGatewayEvent([], {
      type: 'message.interim',
      payload: { text: 'Let me check the files.' },
    })
    const complete = reduceGatewayEvent(interim, {
      type: 'message.complete',
      payload: { text: 'The answer is 42.' },
    })

    expect(complete.map(item => item.text)).toEqual([
      'Let me check the files.',
      'The answer is 42.',
    ])
    expect(complete[0].interim).toBe(true)
  })

  it('settles a rewritten preview when the gateway marks it previewed', () => {
    const interim = reduceGatewayEvent([], {
      type: 'message.interim',
      payload: { text: 'Attempted answer before verification.' },
    })
    const complete = reduceGatewayEvent(interim, {
      type: 'message.complete',
      payload: {
        text: 'Rewritten verified answer.',
        response_previewed: true,
      },
    })

    expect(complete).toHaveLength(1)
    expect(complete[0].text).toBe('Rewritten verified answer.')
    expect(complete[0].interim).toBe(false)
  })

  it('does not append a repeated completion event', () => {
    const first = reduceGatewayEvent([], {
      type: 'message.complete',
      payload: { text: 'One completed answer.' },
    })
    const repeated = reduceGatewayEvent(first, {
      type: 'message.complete',
      payload: { text: 'One completed answer.' },
    })

    expect(repeated).toHaveLength(1)
    expect(repeated[0].text).toBe('One completed answer.')
  })

  it('does not collapse the same answer after a new user message', () => {
    const first = reduceGatewayEvent([], {
      type: 'message.complete',
      payload: { text: 'Repeated words.' },
    })
    const nextTurn = [
      ...first,
      { id: 'user-next', kind: 'user' as const, text: 'Say it again.' },
    ]
    const second = reduceGatewayEvent(nextTurn, {
      type: 'message.complete',
      payload: { text: 'Repeated words.' },
    })

    expect(second.filter(item => item.kind === 'assistant')).toHaveLength(2)
  })

  it('ignores transient thinking spinner presentation events', () => {
    const current = [
      { id: 'answer', kind: 'assistant' as const, text: 'Still here' },
    ]
    const next = reduceGatewayEvent(current, {
      type: 'thinking.delta',
      payload: { text: '---\n(˘▾˘) synthesizing...' },
    })

    expect(next).toBe(current)
  })

  it('keeps an id-less completed tool after the final answer arrives', () => {
    const generating = reduceGatewayEvent([], {
      type: 'tool.generating',
      payload: { name: 'terminal' },
    })
    const completed = reduceGatewayEvent(generating, {
      type: 'tool.complete',
      payload: {
        name: 'terminal',
        args: { command: 'pwd' },
        result: { output: '/workspace' },
      },
    })
    const finished = reduceGatewayEvent(completed, {
      type: 'message.complete',
      payload: { text: 'Done.' },
    })

    const tool = finished.find(item => item.kind === 'tool')
    expect(tool?.tool).toMatchObject({
      name: 'terminal',
      status: 'complete',
      provisional: false,
      args: { command: 'pwd' },
      result: { output: '/workspace' },
    })
  })

  it('renders tool generation and common argument/output aliases', () => {
    const generating = reduceGatewayEvent([], {
      type: 'tool.generating',
      payload: {
        tool_call_id: 'generated-1',
        tool: 'terminal',
        arguments: { command: 'whoami' },
        text: 'Preparing command',
      },
    })
    const complete = reduceGatewayEvent(generating, {
      type: 'tool.complete',
      payload: {
        tool_call_id: 'generated-1',
        tool: 'terminal',
        output: 'operator',
      },
    })

    expect(complete[0].tool).toMatchObject({
      args: { command: 'whoami' },
      progress: 'Preparing command',
      result: 'operator',
      status: 'complete',
    })
  })

  it('redacts secret-like fields recursively', () => {
    expect(
      redactDisplayValue({
        command: 'echo ok',
        nested: { api_key: 'abc', access_token: 'def' },
      }),
    ).toEqual({
      command: 'echo ok',
      nested: { api_key: '[redacted]', access_token: '[redacted]' },
    })
  })
})
