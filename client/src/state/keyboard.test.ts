import { describe, expect, it } from 'vitest'
import { installKeyboardState, isEditable, keyboardState } from './keyboard'

function element(tag: string, attrs: Record<string, string> = {}) {
  return {
    tagName: tag.toUpperCase(),
    getAttribute: (name: string) => attrs[name] ?? null,
  } as unknown as Element
}

function harness() {
  const listeners = new Map<string, () => void>()
  const win = {
    innerWidth: 390,
    innerHeight: 844,
    visualViewport: null,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  }
  const doc = {
    activeElement: null as Element | null,
    documentElement: { dataset: {} as Record<string, string | undefined> },
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  }
  return { win, doc, listeners }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 30))

describe('soft keyboard state', () => {
  it('treats text fields as editable and buttons or checkboxes as not', () => {
    expect(isEditable(element('textarea'))).toBe(true)
    expect(isEditable(element('input'))).toBe(true)
    expect(isEditable(element('input', { type: 'search' }))).toBe(true)
    expect(isEditable(element('input', { type: 'checkbox' }))).toBe(false)
    expect(isEditable(element('button'))).toBe(false)
    expect(isEditable(element('div', { contenteditable: 'true' }))).toBe(true)
    expect(isEditable(null)).toBe(false)
  })

  it('needs both focus and a keyboard-sized height loss', () => {
    expect(keyboardState(true, 470, 844)).toBe('open')
    expect(keyboardState(false, 470, 844)).toBe('closed')
    expect(keyboardState(true, 800, 844)).toBe('closed')
  })

  it('tracks a baseline per width so rotation is not mistaken for a keyboard', async () => {
    const { win, doc, listeners } = harness()
    const dispose = installKeyboardState(win, doc)
    expect(doc.documentElement.dataset.keyboard).toBe('closed')

    doc.activeElement = element('textarea')
    win.innerHeight = 470
    listeners.get('resize')?.()
    await flush()
    expect(doc.documentElement.dataset.keyboard).toBe('open')

    // Rotate with the field still focused: a new width has its own baseline.
    win.innerWidth = 844
    win.innerHeight = 390
    listeners.get('resize')?.()
    await flush()
    expect(doc.documentElement.dataset.keyboard).toBe('closed')

    win.innerHeight = 230
    listeners.get('resize')?.()
    await flush()
    expect(doc.documentElement.dataset.keyboard).toBe('open')

    doc.activeElement = null
    listeners.get('focusout')?.()
    await flush()
    expect(doc.documentElement.dataset.keyboard).toBe('closed')

    dispose()
    expect(listeners.size).toBe(0)
  })
})
