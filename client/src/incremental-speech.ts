export const DEFAULT_SPEECH_SYNTHESIS_CONCURRENCY = 2
export const MAX_SPEECH_SYNTHESIS_CONCURRENCY = 3

export function normalizeSpeechSynthesisConcurrency(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_SPEECH_SYNTHESIS_CONCURRENCY
  return Math.max(
    1,
    Math.min(MAX_SPEECH_SYNTHESIS_CONCURRENCY, Math.round(parsed)),
  )
}

export interface AsyncTaskLimiter {
  run<T>(task: () => Promise<T>): Promise<T>
}

export function createAsyncTaskLimiter(
  concurrency = DEFAULT_SPEECH_SYNTHESIS_CONCURRENCY,
): AsyncTaskLimiter {
  const limit = normalizeSpeechSynthesisConcurrency(concurrency)
  let active = 0
  const pending: Array<() => void> = []

  const release = () => {
    active = Math.max(0, active - 1)
    pending.shift()?.()
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        await new Promise<void>(resolve => pending.push(resolve))
      }
      active += 1
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}

export interface NaturalSpeechSegmenter {
  append(delta: string): string[]
  finish(): string[]
}

const SENTENCE_BATCHES = [1, 3, 5] as const
const MIN_FIRST_SEGMENT_CHARS = 96

function nextNaturalBoundary(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1] ?? ''
    if (character === '\n' && next === '\n') return index + 2
    if ('.!?…'.includes(character) && (!next || /\s/.test(next))) {
      if (next === '\n' && text[index + 2] === '\n') return index + 3
      return index + 1
    }
  }
  return -1
}

function boundedWordBoundary(text: string, maxChars: number): number {
  if (text.length < maxChars) return -1
  const candidate = text.slice(0, maxChars + 1)
  const whitespace = Math.max(
    candidate.lastIndexOf(' '),
    candidate.lastIndexOf('\n'),
  )
  return whitespace >= Math.floor(maxChars * 0.6) ? whitespace + 1 : maxChars
}

export function createNaturalSpeechSegmenter(
  maxChars = 1_200,
): NaturalSpeechSegmenter {
  const safeMaxChars = Math.max(240, Math.floor(maxChars))
  let buffer = ''
  let pending: string[] = []
  let batchIndex = 0

  const flushPending = () => {
    const text = pending.join(' ').replace(/\s+/g, ' ').trim()
    pending = []
    if (text) batchIndex += 1
    return text
  }

  const drain = (final: boolean) => {
    const emitted: string[] = []
    while (buffer) {
      const naturalBoundary = nextNaturalBoundary(buffer)
      const boundedBoundary = boundedWordBoundary(buffer, safeMaxChars)
      const boundary =
        naturalBoundary >= 0 &&
        (boundedBoundary < 0 || naturalBoundary <= safeMaxChars)
          ? naturalBoundary
          : boundedBoundary
      if (boundary < 0 && !final) break
      const raw = boundary < 0 ? buffer : buffer.slice(0, boundary)
      buffer = boundary < 0 ? '' : buffer.slice(boundary).trimStart()
      const piece = raw.trim()
      if (!piece) continue
      pending.push(piece)

      const target = SENTENCE_BATCHES[Math.min(batchIndex, SENTENCE_BATCHES.length - 1)]
      const pendingLength = pending.reduce(
        (total, value) => total + value.length + 1,
        0,
      )
      const paragraphBoundary = /\n\s*\n\s*$/.test(raw)
      const shortOpening =
        batchIndex === 0 &&
        pending.length === 1 &&
        pendingLength < MIN_FIRST_SEGMENT_CHARS
      if (
        final ||
        pendingLength >= safeMaxChars ||
        (!shortOpening &&
          (paragraphBoundary || pending.length >= target))
      ) {
        const segment = flushPending()
        if (segment) emitted.push(segment)
      }
    }
    return emitted
  }

  return {
    append(delta: string) {
      buffer += delta
      return drain(false)
    },
    finish() {
      const emitted = drain(true)
      const tail = flushPending()
      if (tail) emitted.push(tail)
      return emitted
    },
  }
}

interface PreparedSpeech<T> {
  text: string
  value: T
}

export interface PreparedSpeechStream<T> {
  append(delta: string): void
  cancel(): void
  finish(): void
  next(): Promise<PreparedSpeech<T> | null>
}

export function createPreparedSpeechStream<T>({
  concurrency,
  maxSegmentChars,
  synthesize,
  transform = text => text,
}: {
  concurrency?: number
  maxSegmentChars?: number
  synthesize: (text: string, index: number) => Promise<T>
  transform?: (text: string) => string
}): PreparedSpeechStream<T> {
  const limiter = createAsyncTaskLimiter(concurrency)
  const segmenter = createNaturalSpeechSegmenter(maxSegmentChars)
  const prepared: Array<Promise<PreparedSpeech<T>>> = []
  const waiters = new Set<() => void>()
  let cancelled = false
  let finished = false
  let nextIndex = 0

  const signal = () => {
    for (const waiter of waiters) waiter()
    waiters.clear()
  }
  const prepare = (segments: string[]) => {
    for (const rawText of segments) {
      const text = transform(rawText).trim()
      if (!text) continue
      const index = prepared.length
      prepared.push(
        limiter
          .run(() => synthesize(text, index))
          .then(value => ({ text, value })),
      )
    }
    signal()
  }

  return {
    append(delta: string) {
      if (!cancelled && !finished && delta) prepare(segmenter.append(delta))
    },
    cancel() {
      cancelled = true
      signal()
    },
    finish() {
      if (cancelled || finished) return
      prepare(segmenter.finish())
      finished = true
      signal()
    },
    async next() {
      while (!cancelled && nextIndex >= prepared.length && !finished) {
        await new Promise<void>(resolve => waiters.add(resolve))
      }
      if (cancelled || (finished && nextIndex >= prepared.length)) return null
      const value = await prepared[nextIndex]
      nextIndex += 1
      return cancelled ? null : value
    },
  }
}

export function streamedCompletionSuffix(
  streamedText: string,
  completedText: string,
): string {
  if (!completedText) return ''
  if (!streamedText) return completedText
  if (completedText.startsWith(streamedText)) {
    return completedText.slice(streamedText.length)
  }
  return ''
}

export interface PreparedSpeechInput {
  append(delta: string): void
  cancel(): void
  finish(completedText?: string): void
}

export function createPreparedSpeechInput<T>(
  stream: PreparedSpeechStream<T>,
): PreparedSpeechInput {
  let cancelled = false
  let finished = false
  let streamedText = ''

  return {
    append(delta: string) {
      if (cancelled || finished || !delta) return
      streamedText += delta
      stream.append(delta)
    },
    cancel() {
      if (cancelled) return
      cancelled = true
      stream.cancel()
    },
    finish(completedText = '') {
      if (cancelled || finished) return
      const suffix = streamedCompletionSuffix(streamedText, completedText)
      if (suffix) {
        streamedText += suffix
        stream.append(suffix)
      }
      finished = true
      stream.finish()
    },
  }
}
