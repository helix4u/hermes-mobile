import { describe, expect, it } from 'vitest'
import { VoiceUiContextFeed, voiceUiContext } from './voice-ui-context'

const owner = { contextId: 'session-a', sessionId: 'runtime-a', title: 'Attached session' }
describe('voice presentation context', () => {
  it('keeps the viewed page separate from the attached work owner', () => {
    const result = voiceUiContext({ page: 'settings', focusedSessionId: 'runtime-b' }, owner)
    expect(result.viewing.page).toBe('settings')
    expect(result.viewing.focusedSessionId).toBe('runtime-b')
    expect(result.attached.sessionId).toBe('runtime-a')
  })
  it('projects only declared metadata, not extra settings or page content', () => {
    const view = { page: 'settings', secret: 'not-for-voice', content: 'private settings' }
    expect(JSON.stringify(voiceUiContext(view, owner))).not.toContain('not-for-voice')
    expect(JSON.stringify(voiceUiContext(view, owner))).not.toContain('private settings')
  })
  it('appends only changes without response requests or rewriting earlier items', () => {
    const feed = new VoiceUiContextFeed()
    const events: Record<string, unknown>[] = []
    const send = (event: Record<string, unknown>) => { events.push(event); return true }
    expect(feed.publish({ page: 'chat' }, owner, send)).toBe(true)
    expect(feed.publish({ page: 'chat' }, { ...owner }, send)).toBe(false)
    expect(feed.publish({ page: 'settings' }, owner, send)).toBe(true)
    expect(events.map(event => event.type)).toEqual(['conversation.item.create', 'conversation.item.create'])
    const item = events[0].item as { content: Array<{ text: string }> }
    expect(JSON.parse(item.content[0].text.split('\n')[1]).viewing.page).toBe('chat')
  })
  it('retries failed sends and resets the cursor for a new transport', () => {
    const feed = new VoiceUiContextFeed()
    expect(feed.publish({ page: 'chat' }, owner, () => false)).toBe(false)
    expect(feed.publish({ page: 'chat' }, owner, () => true)).toBe(true)
    feed.reset()
    expect(feed.publish({ page: 'chat' }, owner, () => true)).toBe(true)
  })
})
