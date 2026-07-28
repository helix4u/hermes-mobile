import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Transcript } from './Transcript'

const commonProps = {
  activeSpeechId: '',
  toolDetailMode: 'expanded' as const,
  voicePhase: 'idle' as const,
  onSpeak: vi.fn(),
  onRespond: vi.fn(async () => {}),
}

describe('Transcript tool rows', () => {
  it('renders a durable summary as visible static content', () => {
    const html = renderToStaticMarkup(
      <Transcript
        {...commonProps}
        items={[
          {
            id: 'tool-1',
            kind: 'tool',
            tool: {
              toolId: 'tool-1',
              name: 'web_search',
              context: 'today news',
              status: 'complete',
            },
          },
        ]}
      />,
    )

    expect(html).toContain('tool-summary-static')
    expect(html).toContain('web_search')
    expect(html).toContain('today news')
    expect(html).toContain('historical tool row did not retain')
  })

  it('shows live tool input and output by default', () => {
    const html = renderToStaticMarkup(
      <Transcript
        {...commonProps}
        items={[
          {
            id: 'tool-2',
            kind: 'tool',
            tool: {
              toolId: 'tool-2',
              name: 'terminal',
              status: 'complete',
              args: { command: 'pwd' },
              result: { output: '/workspace' },
            },
          },
        ]}
      />,
    )

    expect(html).toContain('Input')
    expect(html).toContain('pwd')
    expect(html).toContain('Output')
    expect(html).toContain('/workspace')
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('keeps collapsed tool details readable and inspectable on demand', () => {
    const html = renderToStaticMarkup(
      <Transcript
        {...commonProps}
        toolDetailMode="collapsed"
        items={[
          {
            id: 'tool-collapsed',
            kind: 'tool',
            tool: {
              toolId: 'tool-collapsed',
              name: 'terminal',
              status: 'complete',
              args: { command: 'pwd' },
              result: { output: '/workspace' },
            },
          },
        ]}
      />,
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('<h4>Input</h4>')
    expect(html).toContain('disclosure-glyph')
    expect(html).toContain('tool-card-collapsed')
    expect(html).toContain('tool-collapsed-preview')
    expect(html).toContain('Completed')
    expect(html).toContain('Input')
    expect(html).toContain('pwd')
    expect(html).toContain('Output')
    expect(html).toContain('/workspace')
    expect(html).toContain('inspect the full tool call')
  })

  it('keeps hidden tool calls as cards without exposing their payload', () => {
    const html = renderToStaticMarkup(
      <Transcript
        {...commonProps}
        toolDetailMode="hidden"
        items={[
          {
            id: 'tool-hidden',
            kind: 'tool',
            tool: {
              toolId: 'tool-hidden',
              name: 'terminal',
              context: 'ran pwd',
              status: 'complete',
              args: { command: 'pwd' },
              result: { output: '/workspace' },
            },
          },
        ]}
      />,
    )

    expect(html).toContain('tool-summary-static')
    expect(html).toContain('terminal')
    expect(html).toContain('ran pwd')
    expect(html).not.toContain('disclosure-glyph')
    expect(html).not.toContain('<h4>Input</h4>')
  })

  it('opens live reasoning so actual content is visible while it streams', () => {
    const html = renderToStaticMarkup(
      <Transcript
        {...commonProps}
        items={[
          {
            id: 'reasoning-streaming',
            kind: 'reasoning',
            text: 'Checking the current state.',
            streaming: true,
          },
        ]}
      />,
    )

    expect(html).toContain('<details class="reasoning-block" open="">')
    expect(html).toContain('Checking the current state.')
  })
})

describe('Transcript message actions', () => {
  it('adds a copy button to every completed chat message', () => {
    const html = renderToStaticMarkup(
      <Transcript
        {...commonProps}
        items={[
          { id: 'user-1', kind: 'user', text: 'Question' },
          { id: 'assistant-1', kind: 'assistant', text: 'Answer' },
          { id: 'event-1', kind: 'event', text: 'Status' },
        ]}
      />,
    )

    expect(html.match(/aria-label="Copy response"/g)).toHaveLength(3)
    expect(html).toContain('Listen')
  })

  it('waits for a streaming response to finish before exposing copy', () => {
    const html = renderToStaticMarkup(
      <Transcript
        {...commonProps}
        items={[
          {
            id: 'assistant-streaming',
            kind: 'assistant',
            text: 'Partial',
            streaming: true,
          },
        ]}
      />,
    )

    expect(html).not.toContain('copy-message-button')
  })
})
