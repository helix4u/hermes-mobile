import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PetSidechatSheet } from './PetSidechatSheet'

function renderSidechat(
  overrides: Partial<Parameters<typeof PetSidechatSheet>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(PetSidechatSheet, {
      busy: false,
      error: '',
      messages: [],
      name: 'Alien Child',
      open: true,
      onClose: vi.fn(),
      onLoad: vi.fn(),
      onPersonalityChange: vi.fn(),
      onReset: vi.fn(),
      onSend: vi.fn(async () => true),
      onSendToHermes: vi.fn(),
      onToggleRecording: vi.fn(),
      onTranscriptTarget: vi.fn(),
      personalities: [
        {
          description: 'Blunt but useful.',
          displayName: 'Alien Child',
          path: 'personalities/alien-child',
          revision: 'test',
          slug: 'alien-child',
          source: 'host',
          valid: true,
        },
      ],
      personalitySlug: 'alien-child',
      realtime: {
        approveHermesDraft: vi.fn(async () => true),
        cancelHermesDraft: vi.fn(),
        snapshot: {
          active: false,
          activity: [],
          attachedContextId: '',
          commentary: [],
          contextPreview: [],
          contextStats: null,
          error: '',
          hermesDraft: '',
          hermesDraftStatus: 'idle',
          status: 'idle',
          transcript: '',
        },
        start: vi.fn(async () => true),
        stop: vi.fn(),
        updateHermesDraft: vi.fn(),
        voice: 'marin',
        setVoice: vi.fn(),
        settings: { model: 'gpt-realtime-2.1', effort: 'medium' },
        setSettings: vi.fn(),
      },
      voicePhase: 'idle',
      voiceRecordingAvailable: true,
      ...overrides,
    }),
  )
}

describe('PetSidechatSheet', () => {
  it('renders a dedicated voice page with explicit return and voice controls', () => {
    const html = renderSidechat()

    expect(html).toContain('pet-sidechat-popout')
    expect(html).toContain('role="region"')
    expect(html).toContain('voice-page')
    expect(html).toContain('Back to session (voice keeps running)')
    expect(html).toContain('Record a pet sidechat message')
    expect(html).toContain('Send message to Alien Child')
    expect(html).toContain('Clear pet sidechat history')
    expect(html).toContain('Pet live voice personality')
    expect(html).toContain('Realtime model')
    expect(html).toContain('Reasoning effort')
    expect(html).toContain('<option value="medium" selected="">')
    expect(html).toContain('<svg')
    expect(html).not.toContain('Pet mic')
    expect(html).not.toContain('Stop mic')
  })

  it('labels an attached session preview, freshness, and saved voice memory', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T23:30:00-06:00'))
    const html = renderSidechat({
      realtime: {
        approveHermesDraft: vi.fn(async () => true),
        cancelHermesDraft: vi.fn(),
        snapshot: {
          active: true,
          activity: [],
          attachedContextId: 'session-1',
          attachedContextTitle: 'Project Phoenix',
          commentary: [],
          contextPreview: [],
          contextStats: null,
          contextStatus: {
            loadState: 'preview',
            loadedMessages: 12,
            memoryRecords: 3,
            memoryState: 'available',
            observedAt: '2026-09-15T23:29:45-06:00',
            totalMessages: 48,
          },
          error: '',
          hermesDraft: '',
          hermesDraftStatus: 'idle',
          status: 'listening',
          transcript: '',
        },
        start: vi.fn(async () => true),
        stop: vi.fn(),
        updateHermesDraft: vi.fn(),
        voice: 'marin',
        setVoice: vi.fn(),
      },
    })

    expect(html).toContain('Attached session')
    expect(html).toContain('Project Phoenix')
    expect(html).toContain('Preview loaded')
    expect(html).toContain('12 of 48 messages')
    expect(html).toContain('Last observed')
    expect(html).toContain('Fresh')
    expect(html).toContain('Saved voice memory')
    expect(html).toContain('3 notes available')
    vi.useRealTimers()
  })

  it('labels a fully loaded stale transcript with no saved voice notes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T23:30:00-06:00'))
    const html = renderSidechat({
      realtime: {
        approveHermesDraft: vi.fn(async () => true),
        cancelHermesDraft: vi.fn(),
        snapshot: {
          active: true,
          activity: [],
          attachedContextId: 'session-2',
          attachedContextTitle: 'Complete Session',
          commentary: [],
          contextPreview: [],
          contextStats: null,
          contextStatus: {
            loadState: 'full',
            loadedMessages: 48,
            memoryRecords: 0,
            memoryState: 'empty',
            observedAt: '2026-09-15T23:20:00-06:00',
            totalMessages: 48,
          },
          error: '',
          hermesDraft: '',
          hermesDraftStatus: 'idle',
          status: 'listening',
          transcript: '',
        },
        start: vi.fn(async () => true),
        stop: vi.fn(),
        updateHermesDraft: vi.fn(),
        voice: 'marin',
        setVoice: vi.fn(),
      },
    })

    expect(html).toContain('Full transcript loaded')
    expect(html).toContain('All 48 messages')
    expect(html).toContain('Stale')
    expect(html).toContain('No saved notes')
    vi.useRealTimers()
  })

  it('keeps full replies and a compact Hermes handoff', () => {
    const reply =
      'A substantial private answer with **Markdown** and attached-session context.'
    const html = renderSidechat({
      messages: [
        { id: 'user-1', role: 'user', text: 'What happened?' },
        { id: 'pet-1', role: 'assistant', text: reply },
      ],
    })

    expect(html).toContain('What happened?')
    expect(html).toContain('A substantial private answer')
    expect(html).toContain('<strong>Markdown</strong>')
    expect(html).toContain('Send this reply to Hermes')
    expect(html).toContain('>Hermes</span>')
  })

  it('stays out of the document when closed', () => {
    expect(renderSidechat({ open: false })).toBe('')
  })

  it('shows an editable approval gate before a voice request reaches Hermes', () => {
    const html = renderSidechat({
      realtime: {
        approveHermesDraft: vi.fn(async () => true),
        cancelHermesDraft: vi.fn(),
        snapshot: {
          active: true,
          activity: [],
          attachedContextId: 'session-1',
          commentary: [],
          contextPreview: [],
          contextStats: null,
          error: '',
          hermesDraft: 'inspect only the current logs',
          hermesDraftStatus: 'pending',
          status: 'listening',
          transcript: '',
        },
        start: vi.fn(async () => true),
        stop: vi.fn(),
        updateHermesDraft: vi.fn(),
        voice: 'marin',
        setVoice: vi.fn(),
      },
    })

    expect(html).toContain('Review Hermes request')
    expect(html).toContain('Nothing is sent until you approve it')
    expect(html).toContain('inspect only the current logs')
    expect(html).toContain('Send to Hermes')
    expect(html).toContain('Cancel')
  })
})
