import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemeSelection,
  bindHermesSkin,
  DESKTOP_DEFAULT_THEME,
  hostSkinForConnection,
  loadThemeMode,
  loadThemeSelection,
  MOBILE_THEME_OPTIONS,
  persistThemeMode,
  persistThemeSelection,
  resolveThemeMode,
} from './theme'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
    clear() {
      values.clear()
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    get length() {
      return values.size
    },
  } satisfies Storage
}

// The vendored Desktop engine writes to documentElement exactly as Desktop's
// ThemeProvider does. A small fake records that without a DOM environment.
function fakeDocument() {
  const vars = new Map<string, string>()
  const classes = new Set<string>()
  const dataset: Record<string, string> = {}
  const meta = { content: '', setAttribute(_: string, value: string) { this.content = value } }
  const doc = {
    documentElement: {
      style: { setProperty: (key: string, value: string) => vars.set(key, value) },
      dataset,
      classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) },
    },
    head: { appendChild: () => {} },
    createElement: () => ({ dataset: {} }),
    querySelector: (selector: string) => (selector.includes('theme-color') ? meta : null),
  }
  return { doc: doc as unknown as Document, vars, classes, dataset, meta }
}

describe('Desktop theme engine on mobile', () => {
  beforeEach(() => {
    vi.stubGlobal('CSS', { escape: (value: string) => value })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers exactly the Desktop built-in themes', () => {
    const ids = MOBILE_THEME_OPTIONS.map(option => option.id)
    expect(ids).toContain(DESKTOP_DEFAULT_THEME)
    expect(ids).toEqual(expect.arrayContaining(['nous', 'midnight', 'slate', 'mono']))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('applies a named theme with Desktop tokens and the dark class', () => {
    const { doc, vars, classes, dataset, meta } = fakeDocument()
    const applied = applyThemeSelection('slate', null, 'dark', doc)
    expect(applied?.name).toBe('slate')
    expect(applied?.mode).toBe('dark')
    expect(dataset.hermesTheme).toBe('slate')
    expect(classes.has('dark')).toBe(true)
    expect(vars.get('--theme-primary')).toMatch(/^#|rgb|color-mix/)
    expect(meta.content).toBe(applied?.chromeBackground)
  })

  it('renders light mode without the dark class', () => {
    const { doc, classes } = fakeDocument()
    expect(applyThemeSelection('nous', null, 'light', doc)?.mode).toBe('light')
    expect(classes.has('dark')).toBe(false)
  })

  it('follows a host skin through Desktop skin conversion and falls back while it is unknown', () => {
    const host = {
      name: 'custom-host',
      colors: { background: '#112233', banner_text: '#f0f0f0', ui_accent: '#abcdef' },
    }
    const followed = fakeDocument()
    applyThemeSelection('host', host, 'dark', followed.doc)
    expect(followed.dataset.hermesTheme).toBe('custom-host')

    const waiting = fakeDocument()
    applyThemeSelection('host', null, 'dark', waiting.doc)
    expect(waiting.dataset.hermesTheme).toBe(DESKTOP_DEFAULT_THEME)
  })

  it('never applies an unknown stored name', () => {
    const { doc, dataset } = fakeDocument()
    applyThemeSelection('not-a-theme', null, 'dark', doc)
    expect(dataset.hermesTheme).toBe(DESKTOP_DEFAULT_THEME)
  })

  it('resolves system mode from the phone setting', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(resolveThemeMode('system')).toBe('light')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(resolveThemeMode('system')).toBe('dark')
    expect(resolveThemeMode('light')).toBe('light')
  })

  it('binds host skin data to the connection that emitted it', () => {
    const bound = bindHermesSkin('tailnet-a', { name: 'slate', colors: { background: '#0d1117' } })
    expect(hostSkinForConnection(bound, 'tailnet-a')?.name).toBe('slate')
    expect(hostSkinForConnection(bound, 'cloud-b')).toBeNull()
    expect(bindHermesSkin('tailnet-a', {})).toBeNull()
  })

  it('persists theme and mode independently for each saved connection', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    persistThemeSelection('tailnet-a', 'midnight')
    persistThemeSelection('cloud-b', 'host')
    persistThemeMode('tailnet-a', 'light')
    expect(loadThemeSelection('tailnet-a')).toBe('midnight')
    expect(loadThemeSelection('cloud-b')).toBe('host')
    expect(loadThemeSelection('new-host')).toBe('host')
    expect(loadThemeMode('tailnet-a')).toBe('light')
    expect(loadThemeMode('cloud-b')).toBe('system')
  })

  it('moves the retired Hermes Mobile palette to following the host', () => {
    const storage = memoryStorage()
    storage.setItem('hermes-mobile.theme-selection.v2:tailnet-a', 'mobile')
    vi.stubGlobal('localStorage', storage)
    expect(loadThemeSelection('tailnet-a')).toBe('host')
  })
})
