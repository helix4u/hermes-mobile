import type { GatewayEvent } from '../protocol/types'

export type RequestKind = 'approval' | 'clarify' | 'sudo' | 'secret'

export interface ToolTranscriptData {
  toolId: string
  name: string
  status: 'running' | 'complete' | 'failed'
  provisional?: boolean
  context?: string
  args?: unknown
  result?: unknown
  summary?: string
  progress?: string
  durationSeconds?: number
  inlineDiff?: string
  risk?: string
  findings?: string[]
  redacted?: boolean
}

export interface RequestTranscriptData {
  kind: RequestKind
  requestId: string
  question: string
  choices: string[]
  multiSelect: boolean
  answered: boolean
}

export interface TranscriptItem {
  id: string
  kind: 'user' | 'assistant' | 'reasoning' | 'tool' | 'event' | 'request'
  text?: string
  streaming?: boolean
  interim?: boolean
  tool?: ToolTranscriptData
  request?: RequestTranscriptData
}

const SECRET_KEY =
  /(^|[_-])(api[_-]?key|authorization|cookie|credential|password|passwd|secret|token|private[_-]?key|access[_-]?key)($|[_-])|apikey|accesstoken|refreshtoken|clientsecret|privatekey/i
let fallbackId = 0

function makeId(prefix: string): string {
  fallbackId += 1
  return `${prefix}-${Date.now()}-${fallbackId}`
}

function lastIndexWhere<T>(
  values: T[],
  predicate: (value: T, index: number) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index], index)) return index
  }
  return -1
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item
        const row = asRecord(item)
        return String(row.text ?? row.content ?? '')
      })
      .filter(Boolean)
      .join('\n')
  }
  const row = asRecord(value)
  if (typeof row.text === 'string') return row.text
  if (typeof row.content === 'string') return row.content
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function redactDisplayValue(
  value: unknown,
  key = '',
  depth = 0,
): unknown {
  if (SECRET_KEY.test(key)) return '[redacted]'
  if (depth > 12) return '[nested value omitted]'
  if (Array.isArray(value)) {
    return value.map(item => redactDisplayValue(item, '', depth + 1))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redactDisplayValue(child, childKey, depth + 1),
      ]),
    )
  }
  return value
}

export function formatDisplayValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(redactDisplayValue(value), null, 2)
  } catch {
    return String(value)
  }
}

function reasoningText(message: Record<string, unknown>): string {
  for (const key of [
    'reasoning',
    'reasoning_content',
    'reasoning_details',
    'codex_reasoning_items',
  ]) {
    const text = asText(message[key])
    if (text.trim()) return text
  }
  return ''
}

export function historyToTranscript(messages: unknown[]): TranscriptItem[] {
  const transcript: TranscriptItem[] = []

  for (const raw of messages) {
    const message = asRecord(raw)
    const role = String(message.role ?? '')
    const text = asText(message.text ?? message.content)

    if (role === 'assistant') {
      const reasoning = reasoningText(message)
      if (reasoning) {
        transcript.push({
          id: makeId('history-reasoning'),
          kind: 'reasoning',
          text: reasoning,
        })
      }
      if (text.trim()) {
        transcript.push({
          id: makeId('history-assistant'),
          kind: 'assistant',
          text,
        })
      }
      continue
    }

    if (role === 'tool') {
      const toolId = String(
        message.tool_id ?? message.tool_call_id ?? makeId('stored-tool'),
      )
      const rawArgs =
        message.args ??
        message.args_text ??
        message.arguments ??
        message.input
      const rawResult =
        message.result ??
        message.result_text ??
        message.output
      transcript.push({
        id: `history-tool-${toolId}`,
        kind: 'tool',
        tool: {
          toolId,
          name: String(message.name ?? message.tool_name ?? 'tool'),
          context: asText(message.context),
          status: 'complete',
          args:
            rawArgs === undefined
              ? undefined
              : redactDisplayValue(rawArgs),
          result:
            rawResult === undefined
              ? undefined
              : redactDisplayValue(rawResult),
          summary: asText(message.summary) || undefined,
          progress: asText(message.progress ?? message.preview) || undefined,
          durationSeconds:
            typeof message.duration_s === 'number'
              ? message.duration_s
              : undefined,
          inlineDiff: asText(message.inline_diff) || undefined,
        },
      })
      continue
    }

    if ((role === 'user' || role === 'system') && text.trim()) {
      transcript.push({
        id: makeId(`history-${role}`),
        kind: role === 'user' ? 'user' : 'event',
        text,
      })
    }
  }

  return transcript
}

function transcriptMatchKey(item: TranscriptItem): string {
  if (item.kind === 'request' && item.request) {
    return `request:${item.request.kind}:${item.request.requestId}`
  }
  return `${item.kind}:${(item.text ?? '').trim()}`
}

function toolName(tool: ToolTranscriptData): string {
  return tool.name.trim().toLowerCase()
}

function hasStableToolId(tool: ToolTranscriptData): boolean {
  return Boolean(
    tool.toolId &&
      !tool.provisional &&
      !tool.toolId.startsWith('stored-tool-') &&
      !tool.toolId.startsWith('generating-'),
  )
}

function findCurrentMatch(
  hydrated: TranscriptItem,
  current: TranscriptItem[],
  used: Set<number>,
): number {
  if (hydrated.kind !== 'tool' || !hydrated.tool) {
    const key = transcriptMatchKey(hydrated)
    return current.findIndex(
      (candidate, index) =>
        !used.has(index) && transcriptMatchKey(candidate) === key,
    )
  }

  const tools = current
    .map((candidate, index) => ({ candidate, index }))
    .filter(
      row =>
        !used.has(row.index) &&
        row.candidate.kind === 'tool' &&
        Boolean(row.candidate.tool),
    )

  if (hasStableToolId(hydrated.tool)) {
    const exactId = tools.find(
      row =>
        hasStableToolId(row.candidate.tool!) &&
        row.candidate.tool!.toolId === hydrated.tool!.toolId,
    )
    if (exactId) return exactId.index
  }

  const hydratedName = toolName(hydrated.tool)
  const hydratedContext = (hydrated.tool.context ?? '').trim().toLowerCase()
  const exactContext = tools.find(row => {
    const tool = row.candidate.tool!
    return (
      toolName(tool) === hydratedName &&
      (tool.context ?? '').trim().toLowerCase() === hydratedContext
    )
  })
  if (exactContext) return exactContext.index

  return (
    tools.find(row => toolName(row.candidate.tool!) === hydratedName)?.index ??
    -1
  )
}

function hasRichToolPayload(item: TranscriptItem): boolean {
  const tool = item.tool
  return Boolean(
    tool &&
      (tool.args !== undefined ||
        tool.result !== undefined ||
        tool.progress ||
        tool.inlineDiff ||
        tool.findings?.length),
  )
}

function mergeHydratedItem(
  hydrated: TranscriptItem,
  current: TranscriptItem,
): TranscriptItem {
  if (hydrated.kind !== 'tool' || !hydrated.tool || !current.tool) {
    return {
      ...hydrated,
      id: current.id,
    }
  }
  return {
    ...hydrated,
    id: current.id,
    tool: {
      ...hydrated.tool,
      ...current.tool,
      status: hydrated.tool.status,
    },
  }
}

export function mergeResumedTranscript(
  current: TranscriptItem[],
  messages: unknown[],
): TranscriptItem[] {
  const hydrated = historyToTranscript(messages)
  if (current.length === 0) return hydrated

  const used = new Set<number>()
  const merged = hydrated.map(item => {
    const currentIndex = findCurrentMatch(item, current, used)
    if (currentIndex < 0) return item
    used.add(currentIndex)
    return mergeHydratedItem(item, current[currentIndex])
  })

  for (const [index, item] of current.entries()) {
    if (used.has(index)) continue
    if (
      item.streaming ||
      item.tool?.status === 'running' ||
      hasRichToolPayload(item) ||
      (item.request && !item.request.answered)
    ) {
      merged.push(item)
    }
  }
  return merged
}

function appendStreaming(
  transcript: TranscriptItem[],
  kind: 'assistant' | 'reasoning',
  text: string,
  replace = false,
): TranscriptItem[] {
  const streamId = `${kind}-streaming`
  const index = transcript.findIndex(item => item.id === streamId)
  if (index < 0) {
    const item = { id: streamId, kind, text, streaming: true }
    return kind === 'reasoning'
      ? insertBeforeTurnFinal(transcript, item)
      : [...transcript, item]
  }
  const current = transcript[index]
  const currentText = current.text ?? ''
  const separator =
    kind === 'reasoning' &&
    currentText.trimEnd().endsWith('**') &&
    text.trimStart().startsWith('**')
      ? '\n\n'
      : ''
  return transcript.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...current,
          text: replace ? text : `${currentText}${separator}${text}`,
        }
      : item,
  )
}

function textContinues(left: string, right: string): boolean {
  const leftText = left.trim()
  const rightText = right.trim()
  return Boolean(
    leftText &&
      rightText &&
      (leftText === rightText ||
        leftText.startsWith(rightText) ||
        rightText.startsWith(leftText)),
  )
}

function insertBeforeTurnFinal(
  transcript: TranscriptItem[],
  item: TranscriptItem,
): TranscriptItem[] {
  const lastUserIndex = lastIndexWhere(
    transcript,
    row => row.kind === 'user',
  )
  const finalAssistantIndex = lastIndexWhere(
    transcript,
    (row, index) =>
      index > lastUserIndex &&
      row.kind === 'assistant' &&
      !row.streaming &&
      !row.interim,
  )
  if (finalAssistantIndex < 0) return [...transcript, item]
  return [
    ...transcript.slice(0, finalAssistantIndex),
    item,
    ...transcript.slice(finalAssistantIndex),
  ]
}

function finishReasoning(
  transcript: TranscriptItem[],
  payload: Record<string, unknown>,
): TranscriptItem[] {
  const text = asText(payload.text)
  if (!text.trim()) return transcript

  const streamingIndex = transcript.findIndex(
    item => item.id === 'reasoning-streaming',
  )
  if (streamingIndex >= 0) {
    return transcript.map((item, index) =>
      index === streamingIndex
        ? {
            ...item,
            id: makeId('reasoning'),
            text,
            streaming: false,
          }
        : item,
    )
  }

  const lastUserIndex = lastIndexWhere(
    transcript,
    item => item.kind === 'user',
  )
  const reasoningIndex = lastIndexWhere(
    transcript,
    (item, index) =>
      index > lastUserIndex && item.kind === 'reasoning',
  )
  if (reasoningIndex >= 0) {
    return transcript.map((item, index) =>
      index === reasoningIndex
        ? { ...item, text, streaming: false }
        : item,
    )
  }

  return insertBeforeTurnFinal(transcript, {
    id: makeId('reasoning'),
    kind: 'reasoning',
    text,
  })
}

function finalizeInterimAssistant(
  transcript: TranscriptItem[],
  payload: Record<string, unknown>,
): TranscriptItem[] {
  const text = asText(payload.text)
  if (!text.trim()) return transcript

  const streamingIndex = transcript.findIndex(
    item => item.id === 'assistant-streaming',
  )
  if (streamingIndex >= 0) {
    return transcript.map((item, index) =>
      index === streamingIndex
        ? {
            ...item,
            id: makeId('interim'),
            text,
            streaming: false,
            interim: true,
          }
        : item,
    )
  }

  const lastAssistantIndex = lastIndexWhere(
    transcript,
    item => item.kind === 'assistant',
  )
  const lastAssistant =
    lastAssistantIndex >= 0 ? transcript[lastAssistantIndex] : undefined
  if (
    lastAssistant &&
    (lastAssistant.interim ||
      Boolean(payload.already_streamed)) &&
    textContinues(lastAssistant.text ?? '', text)
  ) {
    return transcript.map((item, index) =>
      index === lastAssistantIndex
        ? {
            ...item,
            text,
            streaming: false,
            interim: true,
          }
        : item,
    )
  }

  return [
    ...transcript,
    {
      id: makeId('interim'),
      kind: 'assistant',
      text,
      interim: true,
    },
  ]
}

function finishAssistant(
  transcript: TranscriptItem[],
  payload: Record<string, unknown>,
): TranscriptItem[] {
  let next = transcript.filter(
    item =>
      item.id !== 'thinking-status' &&
      !(item.kind === 'tool' && item.tool?.provisional),
  )
  const reasoning = reasoningText(payload)
  if (reasoning) {
    next = next.filter(item => item.id !== 'reasoning-streaming')
    const lastUserIndex = lastIndexWhere(
      next,
      item => item.kind === 'user',
    )
    const alreadyHasReasoning = next.some(
      (item, index) =>
        index > lastUserIndex &&
        item.kind === 'reasoning' &&
        item.text?.trim() === reasoning.trim(),
    )
    if (!alreadyHasReasoning) {
      next.push({
        id: makeId('reasoning'),
        kind: 'reasoning',
        text: reasoning,
      })
    }
  } else {
    next = next.map(item =>
      item.id === 'reasoning-streaming'
        ? { ...item, id: makeId('reasoning'), streaming: false }
        : item,
    )
  }

  const text = asText(payload.text ?? payload.content)
  if (text.trim()) {
    const streamingIndex = next.findIndex(
      item => item.id === 'assistant-streaming',
    )
    if (streamingIndex >= 0) {
      next = next.map((item, index) =>
        index === streamingIndex
          ? {
              ...item,
              id: makeId('assistant'),
              text,
              streaming: false,
              interim: false,
            }
          : item,
      )
    } else {
      const assistantIndex = lastIndexWhere(
        next,
        item => item.kind === 'assistant',
      )
      const assistant =
        assistantIndex >= 0 ? next[assistantIndex] : undefined
      const finalContinuesInterim = Boolean(
        assistant?.interim &&
          textContinues(assistant.text ?? '', text),
      )
      const responsePreviewed = Boolean(payload.response_previewed)
      const hasUserAfterAssistant =
        assistantIndex >= 0 &&
        next
          .slice(assistantIndex + 1)
          .some(item => item.kind === 'user')
      const repeatedCompletion = Boolean(
        assistant &&
          !assistant.interim &&
          !hasUserAfterAssistant &&
          assistant.text?.trim() === text.trim(),
      )

      if (
        assistant &&
        (finalContinuesInterim ||
          (assistant.interim && responsePreviewed) ||
          repeatedCompletion)
      ) {
        next = next.map((item, index) =>
          index === assistantIndex
            ? {
                ...item,
                text,
                streaming: false,
                interim: false,
              }
            : item,
        )
      } else {
        next.push({
          id: makeId('assistant'),
          kind: 'assistant',
          text,
        })
      }
    }
  } else {
    next = next.filter(item => item.id !== 'assistant-streaming')
  }
  if (payload.warning) {
    next.push({
      id: makeId('warning'),
      kind: 'event',
      text: `Warning: ${asText(payload.warning)}`,
    })
  }
  return next
}

function upsertTool(
  transcript: TranscriptItem[],
  payload: Record<string, unknown>,
  complete: boolean,
): TranscriptItem[] {
  const payloadToolId = String(
    payload.tool_id ?? payload.tool_call_id ?? payload.id ?? '',
  ).trim()
  const nextName = String(payload.name ?? payload.tool ?? 'tool')
  let index = payloadToolId
    ? transcript.findIndex(
        item =>
          item.kind === 'tool' && item.tool?.toolId === payloadToolId,
      )
    : -1
  if (index < 0) {
    index = lastIndexWhere(
      transcript,
      item =>
        item.kind === 'tool' &&
        Boolean(item.tool?.provisional) &&
        item.tool?.status === 'running' &&
        toolName(item.tool) === nextName.trim().toLowerCase(),
    )
  }
  const current = index >= 0 ? transcript[index].tool : undefined
  const toolId =
    payloadToolId ||
    current?.toolId ||
    `generating-${makeId('tool')}`
  const rawArgs =
    payload.args ??
    payload.args_text ??
    payload.arguments ??
    payload.input
  const rawResult =
    payload.result ??
    payload.result_text ??
    payload.output
  const resultRecord = asRecord(rawResult)
  const failed =
    complete &&
    (payload.error != null ||
      resultRecord.success === false ||
      resultRecord.error != null)
  const nextTool: ToolTranscriptData = {
    toolId,
    name: String(payload.name ?? payload.tool ?? current?.name ?? 'tool'),
    status: complete ? (failed ? 'failed' : 'complete') : 'running',
    // A completion is authoritative even when an older gateway omitted its
    // tool id. Keeping it provisional lets message.complete discard a real
    // finished tool row as if it were an orphaned generation notice.
    provisional: complete
      ? false
      : payloadToolId
        ? false
        : (current?.provisional ?? true),
    context: asText(payload.context) || current?.context,
    args:
      rawArgs !== undefined
        ? redactDisplayValue(rawArgs)
        : current?.args,
    result:
      rawResult !== undefined
        ? redactDisplayValue(rawResult)
        : current?.result,
    summary: asText(payload.summary) || current?.summary,
    progress:
      asText(
        payload.preview ??
          payload.progress ??
          payload.message ??
          payload.text,
      ) ||
      current?.progress,
    durationSeconds:
      typeof payload.duration_s === 'number'
        ? payload.duration_s
        : current?.durationSeconds,
    inlineDiff: asText(payload.inline_diff) || current?.inlineDiff,
    risk: asText(payload.risk) || current?.risk,
    findings: Array.isArray(payload.findings)
      ? payload.findings.map(String)
      : current?.findings,
    redacted:
      typeof payload.redacted === 'boolean'
        ? payload.redacted
        : current?.redacted,
  }
  const item: TranscriptItem = {
    id: index >= 0 ? transcript[index].id : `tool-${toolId}`,
    kind: 'tool',
    tool: nextTool,
  }
  if (index < 0) return insertBeforeTurnFinal(transcript, item)
  return transcript.map((row, rowIndex) => (rowIndex === index ? item : row))
}

function requestFromEvent(
  type: string,
  payload: Record<string, unknown>,
): TranscriptItem | null {
  const kind = type.split('.')[0] as RequestKind
  if (!['approval', 'clarify', 'sudo', 'secret'].includes(kind)) return null
  const rawChoices = Array.isArray(payload.choices)
    ? payload.choices
    : Array.isArray(payload.options)
      ? payload.options
      : []
  return {
    id: `request-${String(payload.request_id ?? makeId(kind))}`,
    kind: 'request',
    request: {
      kind,
      requestId: String(payload.request_id ?? ''),
      question:
        asText(
          payload.question ??
            payload.prompt ??
            payload.message ??
            payload.reason ??
            payload.description ??
            payload.command,
        ) || `Hermes needs ${kind} input.`,
      choices: rawChoices.map(choice => {
        const row = asRecord(choice)
        return String(row.label ?? row.value ?? choice)
      }),
      multiSelect: Boolean(payload.multi_select),
      answered: false,
    },
  }
}

export function reduceGatewayEvent(
  transcript: TranscriptItem[],
  event: GatewayEvent,
): TranscriptItem[] {
  const payload = asRecord(event.payload)

  if (event.type === 'message.delta') {
    return appendStreaming(
      transcript,
      'assistant',
      asText(payload.text ?? payload.delta),
    )
  }
  if (event.type === 'message.interim') {
    return finalizeInterimAssistant(transcript, payload)
  }
  if (event.type === 'message.complete') {
    return finishAssistant(transcript, payload)
  }
  if (event.type === 'reasoning.delta') {
    return appendStreaming(transcript, 'reasoning', asText(payload.text))
  }
  if (event.type === 'reasoning.available') {
    return finishReasoning(transcript, payload)
  }
  if (event.type === 'thinking.delta') {
    // Hermes uses this event for the transient kawaii spinner/status line.
    // It is not model reasoning and often contains presentation separators.
    return transcript
  }
  if (
    event.type === 'tool.start' ||
    event.type === 'tool.progress' ||
    event.type === 'tool.generating'
  ) {
    return upsertTool(transcript, payload, false)
  }
  if (event.type === 'tool.complete') {
    return upsertTool(transcript, payload, true)
  }
  if (event.type === 'tool.output_risk') {
    return upsertTool(transcript, payload, false)
  }
  if (event.type.endsWith('.request')) {
    const request = requestFromEvent(event.type, payload)
    return request ? [...transcript, request] : transcript
  }
  if (event.type === 'session.error' || event.type === 'error') {
    return [
      ...transcript,
      {
        id: makeId('error'),
        kind: 'event',
        text: asText(payload.message ?? payload.error) || 'Hermes reported an error.',
      },
    ]
  }
  return transcript
}

export function markRequestAnswered(
  transcript: TranscriptItem[],
  requestId: string,
): TranscriptItem[] {
  return transcript.map(item =>
    item.request?.requestId === requestId
      ? {
          ...item,
          request: { ...item.request, answered: true },
        }
      : item,
  )
}
