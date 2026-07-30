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
      onReset: vi.fn(),
      onSend: vi.fn(async () => true),
      onSendToHermes: vi.fn(),
      onToggleRecording: vi.fn(),
      onTranscriptTarget: vi.fn(),
      voicePhase: 'idle',
      ...overrides,
    }),
  )
}

describe('PetSidechatSheet', () => {
  it('renders a compact floating conversation with icon controls', () => {
    const html = renderSidechat()

    expect(html).toContain('pet-sidechat-popout')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Record a pet sidechat message')
    expect(html).toContain('Send message to Alien Child')
    expect(html).toContain('Clear pet sidechat history')
    expect(html).toContain('<svg')
    expect(html).not.toContain('Pet mic')
    expect(html).not.toContain('Stop mic')
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
})
