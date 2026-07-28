import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_READER_BUFFER_AHEAD,
  MAX_READER_BUFFER_AHEAD,
  loadReaderBufferAhead,
  parseReaderScript,
  persistReaderBufferAhead,
  readerFallbackSelections,
  readerSpeakers,
  ttsOverride,
  type VoiceSelection,
} from '../reader'
import type { HermesTransport } from '../transport/hermes-transport'
import type {
  SpeechSequenceItem,
  SpeechSequenceOptions,
  VoicePhase,
} from '../voice'
import { useVoiceCatalog } from './useVoiceCatalog'

interface ReaderViewProps {
  connected: boolean
  connectionId: string
  latestText: string
  normalVoice: VoiceSelection
  phase: VoicePhase
  transport: HermesTransport | null
  onSpeak: (
    items: SpeechSequenceItem[],
    options?: SpeechSequenceOptions,
  ) => Promise<void>
  onStop: () => void
}

interface AssignmentResponse {
  assignments?: Array<{ speaker: string; voice: string }>
  available?: boolean
  error?: string
}

function draftKey(connectionId: string): string {
  return `hermes-mobile.reader.${connectionId}.draft`
}

function assignmentsKey(connectionId: string): string {
  return `hermes-mobile.reader.${connectionId}.assignments`
}

function loadAssignments(connectionId: string): Record<string, string> {
  try {
    return JSON.parse(
      window.localStorage.getItem(assignmentsKey(connectionId)) || '{}',
    ) as Record<string, string>
  } catch {
    return {}
  }
}

export function ReaderView({
  connected,
  connectionId,
  latestText,
  normalVoice,
  onSpeak,
  onStop,
  phase,
  transport,
}: ReaderViewProps) {
  const [text, setText] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(draftKey(connectionId)) || '',
  )
  const [selectedProviders, setSelectedProviders] = useState<string[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    typeof window === 'undefined' ? {} : loadAssignments(connectionId),
  )
  const [activeBlock, setActiveBlock] = useState<string | null>(null)
  const [followPlayback, setFollowPlayback] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')
  const [bufferAhead, setBufferAhead] = useState(() =>
    typeof window === 'undefined'
      ? DEFAULT_READER_BUFFER_AHEAD
      : loadReaderBufferAhead(connectionId),
  )
  const blockNodes = useRef(new Map<string, HTMLElement>())
  const readerRun = useRef(0)
  const { choices, error: catalogError, providers } = useVoiceCatalog(
    transport,
    connected,
  )
  const blocks = useMemo(() => parseReaderScript(text), [text])
  const speakers = useMemo(() => readerSpeakers(blocks), [blocks])
  const availableChoices = choices.filter(
    choice =>
      selectedProviders.length === 0 ||
      selectedProviders.includes(choice.provider),
  )

  useEffect(() => {
    const stored =
      window.localStorage.getItem(draftKey(connectionId)) || ''
    setText(stored)
    setAssignments(loadAssignments(connectionId))
    setBufferAhead(loadReaderBufferAhead(connectionId))
  }, [connectionId])

  useEffect(() => {
    window.localStorage.setItem(draftKey(connectionId), text)
  }, [connectionId, text])

  useEffect(() => {
    window.localStorage.setItem(
      assignmentsKey(connectionId),
      JSON.stringify(assignments),
    )
  }, [assignments, connectionId])

  useEffect(() => {
    persistReaderBufferAhead(connectionId, bufferAhead)
  }, [bufferAhead, connectionId])

  useEffect(() => {
    if (!activeBlock || !followPlayback) return
    blockNodes.current.get(activeBlock)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [activeBlock, followPlayback])

  useEffect(() => {
    if (selectedProviders.length > 0 || providers.length === 0) return
    setSelectedProviders([
      normalVoice.provider && providers.includes(normalVoice.provider)
        ? normalVoice.provider
        : providers[0],
    ])
  }, [normalVoice.provider, providers, selectedProviders.length])

  useEffect(() => {
    if (availableChoices.length === 0) return
    setAssignments(current => {
      const next = { ...current }
      let changed = false
      speakers.forEach((speaker, index) => {
        if (availableChoices.some(choice =>
          `${choice.provider}:${choice.voice}` === current[speaker.name],
        )) {
          return
        }
        const choice = availableChoices[index % availableChoices.length]
        next[speaker.name] = `${choice.provider}:${choice.voice}`
        changed = true
      })
      return changed ? next : current
    })
  }, [availableChoices, speakers])

  async function autoAssign() {
    if (!transport || !speakers.length || !availableChoices.length) return
    setAssigning(true)
    setError('')
    try {
      const result = await transport.requestJson<AssignmentResponse>(
        '/api/audio/reader/assign-voices',
        {
          speakers,
          voices: availableChoices.map(choice => ({
            id: `${choice.provider}:${choice.voice}`,
            label: choice.label,
            presentation: 'unknown',
            provider: choice.provider,
          })),
          force: true,
        },
      )
      if (!result.available || !result.assignments?.length) {
        throw new Error(result.error || 'Hermes could not assign reader voices')
      }
      setAssignments(current => ({
        ...current,
        ...Object.fromEntries(
          result.assignments!.map(row => [row.speaker, row.voice]),
        ),
      }))
    } catch (assignError) {
      setError(
        assignError instanceof Error ? assignError.message : String(assignError),
      )
    } finally {
      setAssigning(false)
    }
  }

  function sequence(): SpeechSequenceItem[] {
    return blocks.map(block => {
      const key = assignments[block.speaker] || ''
      const choice = availableChoices.find(
        row => `${row.provider}:${row.voice}` === key,
      )
      const selection = choice
        ? { provider: choice.provider, voice: choice.voice, speed: normalVoice.speed }
        : normalVoice
      return {
        id: block.id,
        text: block.text,
        ttsConfig: ttsOverride(selection),
        fallbackTtsConfigs: [
          ...readerFallbackSelections(
            selection,
            availableChoices,
            normalVoice.speed,
          ).map(ttsOverride),
          undefined,
        ],
      }
    })
  }

  const reading = phase === 'speaking' || phase === 'synthesizing'

  function readFrom(index: number) {
    const items = sequence().slice(index)
    if (!items.length) return
    readerRun.current += 1
    const run = readerRun.current
    setFollowPlayback(true)
    setActiveBlock(items[0].id)
    void onSpeak(items, {
      speechId: 'reader',
      bufferAhead,
      onActive: itemId => {
        if (readerRun.current === run) setActiveBlock(itemId)
      },
    })
  }

  function stopReading() {
    readerRun.current += 1
    setActiveBlock(null)
    setFollowPlayback(true)
    onStop()
  }

  return (
    <div
      className="reader-screen"
      onTouchMove={() => {
        if (reading) setFollowPlayback(false)
      }}
      onWheel={() => {
        if (reading) setFollowPlayback(false)
      }}
    >
      <div className="page-heading">
        <div>
          <span className="eyebrow">Multi-voice</span>
          <h1>Reader</h1>
        </div>
        <button
          className="quiet-button"
          disabled={!latestText}
          onClick={() => setText(latestText)}
        >
          Use latest reply
        </button>
      </div>

      <section className="reader-source">
        <label>
          Script
          <textarea
            onChange={event => setText(event.target.value)}
            placeholder={'Paste text, or mark speakers as (Narrator), [Ada], or Lin:'}
            value={text}
          />
        </label>
      </section>

      <section className="reader-controls">
        <div className="reader-provider-row">
          {providers.map(provider => (
            <label className="provider-chip" key={provider}>
              <input
                checked={selectedProviders.includes(provider)}
                type="checkbox"
                onChange={event =>
                  setSelectedProviders(current =>
                    event.target.checked
                      ? [...current, provider]
                      : current.filter(value => value !== provider),
                  )
                }
              />
              {provider === 'xai' ? 'xAI' : provider}
            </label>
          ))}
        </div>
        <div className="reader-playback-settings">
          <label className="reader-buffer-field">
            <span>
              Buffer ahead <output>{bufferAhead}</output>
            </span>
            <input
              aria-label="Buffer ahead"
              disabled={reading}
              max={MAX_READER_BUFFER_AHEAD}
              min="0"
              step="1"
              type="range"
              value={bufferAhead}
              onChange={event => setBufferAhead(Number(event.target.value))}
            />
          </label>
          <span className="state-chip">Voice fallback · automatic</span>
        </div>
        <p className="section-help reader-buffer-help">
          Prepares {bufferAhead} upcoming {bufferAhead === 1 ? 'block' : 'blocks'}.
          Failed voices try another selected voice, then the host default.
        </p>
        <div className="reader-action-row">
          {reading && !followPlayback && (
            <button
              className="quiet-button"
              onClick={() => setFollowPlayback(true)}
            >
              Resume follow
            </button>
          )}
          <button
            className="quiet-button"
            disabled={!connected || assigning || !speakers.length}
            onClick={() => void autoAssign()}
          >
            {assigning ? 'Assigning…' : 'Smart assign'}
          </button>
          {reading ? (
            <button className="danger-button" onClick={stopReading}>
              Stop
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={!connected || !blocks.length}
              onClick={() => readFrom(0)}
            >
              Read
            </button>
          )}
        </div>
      </section>

      {(error || catalogError) && (
        <p className="inline-error">{error || catalogError}</p>
      )}

      <div className="reader-blocks">
        {blocks.length === 0 ? (
          <div className="empty-panel">
            <h2>No readable text yet</h2>
            <p>Use the latest reply or paste a script above.</p>
          </div>
        ) : (
          blocks.map((block, index) => (
            <article
              className={`reader-block ${
                activeBlock === block.id ? 'active' : ''
              }`}
              key={block.id}
              ref={node => {
                if (node) blockNodes.current.set(block.id, node)
                else blockNodes.current.delete(block.id)
              }}
            >
              <div className="reader-block-heading">
                <strong>{block.speaker}</strong>
                <select
                  aria-label={`${block.speaker} voice`}
                  value={assignments[block.speaker] || ''}
                  onChange={event =>
                    setAssignments(current => ({
                      ...current,
                      [block.speaker]: event.target.value,
                    }))
                  }
                >
                  {availableChoices.map(choice => (
                    <option
                      key={`${choice.provider}:${choice.voice}`}
                      value={`${choice.provider}:${choice.voice}`}
                    >
                      {choice.provider === 'xai' ? 'xAI' : choice.provider} ·{' '}
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
              <p>{block.text}</p>
              <button
                className="reader-block-start quiet-button"
                disabled={!connected}
                onClick={() => readFrom(index)}
              >
                {activeBlock === block.id ? 'Restart here' : 'Start here'}
              </button>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
