import { describe, expect, it } from 'vitest'

import {
  createAsyncTaskLimiter,
  createNaturalSpeechSegmenter,
  createPreparedSpeechInput,
  createPreparedSpeechStream,
  createSpeechCompletionGuard,
  streamedDeltaSuffix,
  streamedCompletionSuffix,
} from './incremental-speech'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('incremental speech preparation', () => {
  it('grows from one sentence to three and then five sentences', () => {
    const segmenter = createNaturalSpeechSegmenter()
    const opening =
      'This opening sentence is intentionally substantial enough to provide useful playback runway before later speech is needed.'
    expect(segmenter.append(`${opening} Second sentence.`)).toEqual([opening])
    expect(segmenter.append(' Third sentence. Fourth sentence.')).toEqual([
      'Second sentence. Third sentence. Fourth sentence.',
    ])
    expect(
      segmenter.append(
        ' Fifth sentence. Sixth sentence. Seventh sentence. Eighth sentence. Ninth sentence.',
      ),
    ).toEqual([
      'Fifth sentence. Sixth sentence. Seventh sentence. Eighth sentence. Ninth sentence.',
    ])
  })

  it('joins a short opening sentence with the second sentence', () => {
    const segmenter = createNaturalSpeechSegmenter()

    expect(segmenter.append('Sure.')).toEqual([])
    expect(
      segmenter.append(
        ' Here is the useful part that gives playback enough runway while the following speech continues rendering.',
      ),
    ).toEqual([
      'Sure. Here is the useful part that gives playback enough runway while the following speech continues rendering.',
    ])
  })

  it('flushes a paragraph as a natural vocal transition', () => {
    const segmenter = createNaturalSpeechSegmenter()
    const opening =
      'This opening sentence is deliberately long enough to stand on its own before the next paragraph changes vocal direction.'
    expect(segmenter.append(opening)).toEqual([opening])
    expect(segmenter.append('A new thought continues.\n\n')).toEqual([
      'A new thought continues.',
    ])
  })

  it('caps concurrent synthesis while preserving playback order', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()]
    const starts: number[] = []
    const stream = createPreparedSpeechStream({
      concurrency: 2,
      synthesize: async (_text, index) => {
        starts.push(index)
        return gates[index].promise
      },
    })
    stream.append(
      'One. Two. Three. Four. Five. Six. Seven. Eight. Nine.',
    )
    stream.finish()
    await Promise.resolve()
    expect(starts).toEqual([0, 1])

    gates[1].resolve('second')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(starts).toEqual([0, 1, 2])
    gates[2].resolve('third')
    gates[0].resolve('first')

    await expect(stream.next()).resolves.toMatchObject({ value: 'first' })
    await expect(stream.next()).resolves.toMatchObject({ value: 'second' })
    await expect(stream.next()).resolves.toMatchObject({ value: 'third' })
    await expect(stream.next()).resolves.toBeNull()
  })

  it('uses only the unstreamed suffix from the completion event', () => {
    expect(streamedCompletionSuffix('Hello wor', 'Hello world.')).toBe('ld.')
    expect(streamedCompletionSuffix('', 'Whole response.')).toBe(
      'Whole response.',
    )
    expect(streamedCompletionSuffix('old text', 'replacement')).toBe('')
  })

  it('removes cumulative and substantially overlapping replay deltas', () => {
    const streamed = 'The first prepared segment is already safely buffered.'

    expect(
      streamedDeltaSuffix(
        streamed,
        `${streamed} The second segment is new.`,
      ),
    ).toBe(' The second segment is new.')
    expect(
      streamedDeltaSuffix(
        `${streamed} A boundary phrase is already here.`,
        'A boundary phrase is already here. Only this tail is new.',
      ),
    ).toBe(' Only this tail is new.')
    expect(streamedDeltaSuffix('No, ', 'no, ')).toBe('no, ')
  })

  it('makes repeated completion frames idempotent until a new turn begins', () => {
    const guard = createSpeechCompletionGuard()

    expect(guard.accept('auto-response', 'A complete response.')).toBe(true)
    expect(guard.accept('auto-response', 'A complete response.')).toBe(false)
    expect(guard.accept('auto-response', 'A complete\nresponse.')).toBe(false)
    expect(guard.previous('auto-response')).toBe('A complete response.')

    guard.begin('auto-response')
    expect(guard.accept('auto-response', 'A complete response.')).toBe(true)
  })

  it('closes prepared input after playback has already started', () => {
    const appended: string[] = []
    let cancelled = 0
    let finished = 0
    const input = createPreparedSpeechInput({
      append: delta => appended.push(delta),
      cancel: () => {
        cancelled += 1
      },
      finish: () => {
        finished += 1
      },
      next: async () => null,
    })

    input.append('First segment.')
    // The consumer may begin before the completion payload arrives.
    input.finish('First segment. Final segment.')
    input.finish('First segment. Final segment.')

    expect(appended).toEqual(['First segment.', ' Final segment.'])
    expect(finished).toBe(1)
    expect(cancelled).toBe(0)
  })

  it('does not prepare a cumulative replay twice', () => {
    const appended: string[] = []
    const input = createPreparedSpeechInput({
      append: delta => appended.push(delta),
      cancel: () => undefined,
      finish: () => undefined,
      next: async () => null,
    })

    input.append('The first sentence is already buffered.')
    input.append(
      'The first sentence is already buffered. The second sentence is new.',
    )
    input.finish(
      'The first sentence is already buffered. The second sentence is new.',
    )

    expect(appended).toEqual([
      'The first sentence is already buffered.',
      ' The second sentence is new.',
    ])
  })

  it('cuts a long punctuation-free stream at a nearby word boundary', () => {
    const segmenter = createNaturalSpeechSegmenter(240)
    const text = `${'word '.repeat(60)}tail`
    const segments = segmenter.append(text)

    expect(segments).toHaveLength(1)
    expect(segments[0]?.length).toBeLessThanOrEqual(240)
    expect(segmenter.finish().join(' ')).toContain('tail')
  })

  it('never exceeds the limiter concurrency', async () => {
    const limiter = createAsyncTaskLimiter(2)
    const gate = deferred<void>()
    let active = 0
    let peak = 0
    const tasks = Array.from({ length: 5 }, () =>
      limiter.run(async () => {
        active += 1
        peak = Math.max(peak, active)
        await gate.promise
        active -= 1
      }),
    )
    await Promise.resolve()
    expect(peak).toBe(2)
    gate.resolve()
    await Promise.all(tasks)
    expect(peak).toBe(2)
  })
})
