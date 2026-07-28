import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemeSelection,
  bindHermesSkin,
  hostSkinForConnection,
  loadThemeSelection,
  MOBILE_DEFAULT_VARIABLES,
  MOBILE_THEME_OPTIONS,
  persistThemeSelection,
  skinVariables,
} from './theme'
import { MOBILE_THEME_PRESETS } from './theme-presets'

function styleTarget() {
  const values = new Map<string, string>()
  return {
    target: {
      setProperty(name: string, value: string) {
        values.set(name, value)
      },
    } as CSSStyleDeclaration,
    values,
  }
}

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

describe('Hermes skin projection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a deliberate neutral mobile palette by default', () => {
    expect(MOBILE_DEFAULT_VARIABLES).toMatchObject({
      '--bg': '#090b0f',
      '--surface': '#101319',
      '--text': '#f4f1e9',
      '--gold': '#d8ad52',
    })
  })

  it('maps the shared skin palette into mobile surface tokens', () => {
    expect(
      skinVariables({
        name: 'slate',
        colors: {
          background: '#101820',
          banner_text: '#f0f4f8',
          banner_accent: '#55aaff',
          ui_error: '#ff5566',
        },
      }),
    ).toMatchObject({
      '--bg': '#101820',
      '--text': '#f0f4f8',
      '--gold': '#55aaff',
      '--danger': '#ff5566',
    })
  })

  it('ignores non-hex values instead of injecting them into CSS', () => {
    expect(
      skinVariables({
        colors: {
          background: 'url(javascript:bad)',
          banner_accent: 'red',
        },
      })['--bg'],
    ).toBe('#0b0c0b')
  })

  it('projects every Desktop-matched preset into the complete mobile token set', () => {
    const required = Object.keys(MOBILE_DEFAULT_VARIABLES).sort()
    const optionIds = new Set(MOBILE_THEME_OPTIONS.map(option => option.id))

    for (const preset of Object.values(MOBILE_THEME_PRESETS)) {
      expect(Object.keys(preset.variables).sort()).toEqual(required)
      expect(optionIds.has(preset.id)).toBe(true)
    }
  })

  it('applies a mobile-only Desktop preset without needing a gateway request', () => {
    const { target, values } = styleTarget()

    applyThemeSelection('slate', null, target)

    expect(values.get('--bg')).toBe('#0d1117')
    expect(values.get('--surface')).toBe('#161b22')
    expect(values.get('--gold')).toBe('#58a6ff')
  })

  it('follows a valid host skin and falls back safely while host data is unavailable', () => {
    const host = {
      name: 'custom',
      colors: {
        background: '#112233',
        banner_text: '#f0f0f0',
        ui_accent: '#abcdef',
      },
    }
    const followed = styleTarget()
    applyThemeSelection('host', host, followed.target)
    expect(followed.values.get('--bg')).toBe('#112233')
    expect(followed.values.get('--gold')).toBe('#abcdef')

    const waiting = styleTarget()
    applyThemeSelection('host', null, waiting.target)
    expect(waiting.values.get('--bg')).toBe(MOBILE_DEFAULT_VARIABLES['--bg'])
  })

  it('binds host skin data to the connection that emitted it', () => {
    const bound = bindHermesSkin('tailnet-a', {
      name: 'slate',
      colors: { background: '#0d1117' },
    })

    expect(hostSkinForConnection(bound, 'tailnet-a')?.name).toBe('slate')
    expect(hostSkinForConnection(bound, 'cloud-b')).toBeNull()
    expect(bindHermesSkin('tailnet-a', {})).toBeNull()
  })

  it('persists theme choices independently for each saved connection', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)

    persistThemeSelection('tailnet-a', 'midnight')
    persistThemeSelection('cloud-b', 'host')

    expect(loadThemeSelection('tailnet-a')).toBe('midnight')
    expect(loadThemeSelection('cloud-b')).toBe('host')
    expect(loadThemeSelection('new-host')).toBe('mobile')
  })

  it('migrates the old per-connection host-follow choice', () => {
    const storage = memoryStorage()
    storage.setItem('hermes-mobile.theme-mode.v1:tailnet-a', 'host')
    vi.stubGlobal('localStorage', storage)

    expect(loadThemeSelection('tailnet-a')).toBe('host')
  })
})
