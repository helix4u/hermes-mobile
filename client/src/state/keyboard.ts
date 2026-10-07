// Soft-keyboard state for layout. Android resizes the WebView (adjustResize)
// when the IME opens, so the app sees a short viewport but cannot tell a
// keyboard from a genuinely small window. This marks <html data-keyboard>
// only when an editable field is focused AND the viewport lost a keyboard's
// worth of height against the tallest height seen for the same width, so CSS
// can drop static chrome (bottom nav, workspace row) while typing.

export type KeyboardState = 'open' | 'closed'

export interface KeyboardWindow {
  innerWidth: number
  innerHeight: number
  visualViewport?: { height: number } | null
  addEventListener(type: string, listener: () => void, options?: unknown): void
  removeEventListener(type: string, listener: () => void, options?: unknown): void
}

export interface KeyboardDocument {
  activeElement: Element | null
  documentElement: { dataset: Record<string, string | undefined> }
  addEventListener(type: string, listener: () => void, options?: unknown): void
  removeEventListener(type: string, listener: () => void, options?: unknown): void
}

/** A keyboard takes far more than this; toolbars and URL bars take less. */
export const KEYBOARD_MIN_INSET = 120

export function isEditable(element: Element | null): boolean {
  if (!element) return false
  const tag = element.tagName?.toLowerCase()
  if (tag === 'textarea') return true
  if (tag === 'input') {
    const type = (element.getAttribute('type') || 'text').toLowerCase()
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type)
  }
  return element.getAttribute('contenteditable') === 'true'
}

export function keyboardState(
  editable: boolean,
  height: number,
  baseline: number,
): KeyboardState {
  return editable && baseline - height >= KEYBOARD_MIN_INSET ? 'open' : 'closed'
}

export function installKeyboardState(
  win: KeyboardWindow,
  doc: KeyboardDocument,
): () => void {
  // Tallest height per viewport width: rotation changes the width, so each
  // orientation keeps its own keyboard-free baseline.
  const baselines = new Map<number, number>()
  let frame = 0

  const update = () => {
    frame = 0
    const height = Math.round(win.visualViewport?.height ?? win.innerHeight)
    const width = Math.round(win.innerWidth)
    const editable = isEditable(doc.activeElement)
    const known = baselines.get(width) ?? 0
    // Only learn a baseline while no field is focused, or when the view grew.
    if (!editable || height > known) baselines.set(width, Math.max(known, height))
    const state = keyboardState(editable, height, baselines.get(width) ?? height)
    if (doc.documentElement.dataset.keyboard !== state) {
      doc.documentElement.dataset.keyboard = state
    }
  }

  const schedule = () => {
    if (frame) return
    frame =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(update)
        : (setTimeout(update, 16) as unknown as number)
  }

  update()
  win.addEventListener('resize', schedule, { passive: true })
  doc.addEventListener('focusin', schedule)
  doc.addEventListener('focusout', schedule)
  return () => {
    win.removeEventListener('resize', schedule)
    doc.removeEventListener('focusin', schedule)
    doc.removeEventListener('focusout', schedule)
  }
}
