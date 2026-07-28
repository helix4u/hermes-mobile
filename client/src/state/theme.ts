import {
  MOBILE_THEME_PRESETS,
  type MobileThemePresetId,
} from './theme-presets'

export interface HermesSkin {
  name?: string
  colors?: Record<string, unknown>
  dark_colors?: Record<string, unknown>
  light_colors?: Record<string, unknown>
}

export type MobileThemeSelection =
  | 'mobile'
  | 'host'
  | MobileThemePresetId

export interface BoundHermesSkin {
  connectionId: string
  skin: HermesSkin
}

const HEX = /^#[0-9a-f]{6}$/i
const THEME_SELECTION_KEY = 'hermes-mobile.theme-selection.v2'
const LEGACY_THEME_MODE_KEY = 'hermes-mobile.theme-mode.v1'

export const MOBILE_DEFAULT_VARIABLES: Record<string, string> = {
  '--bg': '#090b0f',
  '--surface': '#101319',
  '--surface-2': '#161a22',
  '--surface-3': '#1d222c',
  '--stroke': '#282e39',
  '--stroke-strong': '#3b4452',
  '--text': '#f4f1e9',
  '--muted': '#a2a6ad',
  '--muted-2': '#707782',
  '--gold': '#d8ad52',
  '--gold-light': '#f0cc76',
  '--gold-ink': '#171208',
  '--danger': '#f07f7a',
  '--success': '#74c995',
  '--warning': '#e6b85f',
}

export const MOBILE_THEME_OPTIONS = [
  {
    id: 'mobile' as const,
    label: 'Hermes Mobile',
    description: 'Polished neutral mobile palette',
  },
  ...Object.values(MOBILE_THEME_PRESETS).map(
    ({ id, label, description }) => ({ id, label, description }),
  ),
]

function color(
  palette: Record<string, unknown>,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = palette[key]
    if (typeof value === 'string' && HEX.test(value)) return value
  }
  return fallback
}

function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function mix(from: string, to: string, amount: number): string {
  const a = rgb(from)
  const b = rgb(to)
  const channel = (index: number) =>
    Math.round(a[index] * (1 - amount) + b[index] * amount)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

function luminance(hex: string): number {
  const values = rgb(hex).map(value => {
    const normalized = value / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

export function skinVariables(skin: HermesSkin): Record<string, string> {
  const palette =
    skin.colors && typeof skin.colors === 'object' ? skin.colors : {}
  const bg = color(palette, ['background', 'status_bar_bg'], '#0b0c0b')
  const text = color(
    palette,
    ['ui_text', 'banner_text', 'status_bar_text'],
    luminance(bg) < 0.4 ? '#f3f0e8' : '#171713',
  )
  const accent = color(
    palette,
    ['ui_accent', 'banner_accent', 'banner_title'],
    '#d9ad4a',
  )
  const muted = color(
    palette,
    ['banner_dim', 'session_label', 'status_bar_text'],
    mix(text, bg, 0.48),
  )
  const border = color(
    palette,
    ['ui_border', 'banner_border', 'session_border'],
    mix(bg, text, 0.17),
  )

  return {
    '--bg': bg,
    '--surface': mix(bg, text, 0.04),
    '--surface-2': mix(bg, text, 0.075),
    '--surface-3': mix(bg, text, 0.11),
    '--stroke': border,
    '--stroke-strong': mix(bg, text, 0.27),
    '--text': text,
    '--muted': muted,
    '--muted-2': mix(muted, bg, 0.27),
    '--gold': accent,
    '--gold-light': color(
      palette,
      ['banner_title', 'ui_accent', 'banner_accent'],
      accent,
    ),
    '--gold-ink': luminance(accent) > 0.44 ? '#15120b' : '#ffffff',
    '--danger': color(palette, ['ui_error'], '#f08078'),
    '--success': color(palette, ['ui_ok'], '#75c892'),
    '--warning': color(palette, ['ui_warn'], '#e4b65d'),
  }
}

export function applyHermesSkin(
  skin: HermesSkin,
  target: CSSStyleDeclaration | null =
    typeof document === 'undefined' ? null : document.documentElement.style,
): string {
  if (!target) return String(skin.name ?? '')
  for (const [key, value] of Object.entries(skinVariables(skin))) {
    target.setProperty(key, value)
  }
  return String(skin.name ?? '')
}

export function applyMobileDefault(
  target: CSSStyleDeclaration | null =
    typeof document === 'undefined' ? null : document.documentElement.style,
): void {
  if (!target) return
  for (const [key, value] of Object.entries(MOBILE_DEFAULT_VARIABLES)) {
    target.setProperty(key, value)
  }
}

function applyVariables(
  variables: Record<string, string>,
  target: CSSStyleDeclaration | null,
): void {
  if (!target) return
  for (const [key, value] of Object.entries(variables)) {
    target.setProperty(key, value)
  }
}

export function isMobileThemeSelection(
  value: unknown,
): value is MobileThemeSelection {
  return (
    value === 'mobile' ||
    value === 'host' ||
    (typeof value === 'string' &&
      Object.prototype.hasOwnProperty.call(MOBILE_THEME_PRESETS, value))
  )
}

export function applyThemeSelection(
  selection: MobileThemeSelection,
  hostSkin: HermesSkin | null,
  target: CSSStyleDeclaration | null =
    typeof document === 'undefined' ? null : document.documentElement.style,
): void {
  if (selection === 'host') {
    if (hostSkin) {
      applyHermesSkin(hostSkin, target)
    } else {
      applyVariables(MOBILE_DEFAULT_VARIABLES, target)
    }
    return
  }

  if (selection === 'mobile') {
    applyVariables(MOBILE_DEFAULT_VARIABLES, target)
    return
  }

  applyVariables(MOBILE_THEME_PRESETS[selection].variables, target)
}

export function bindHermesSkin(
  connectionId: string,
  value: unknown,
): BoundHermesSkin | null {
  if (!value || typeof value !== 'object') return null
  const skin = value as HermesSkin
  if (
    typeof skin.name !== 'string' ||
    !skin.name.trim() ||
    !skin.colors ||
    typeof skin.colors !== 'object'
  ) {
    return null
  }
  return { connectionId, skin }
}

export function hostSkinForConnection(
  bound: BoundHermesSkin | null,
  connectionId: string,
): HermesSkin | null {
  return bound?.connectionId === connectionId ? bound.skin : null
}

function themeStorageKey(base: string, connectionId: string): string {
  return `${base}:${connectionId || 'default'}`
}

export function loadThemeSelection(
  connectionId: string,
): MobileThemeSelection {
  if (typeof localStorage === 'undefined') return 'mobile'
  const current = localStorage.getItem(
    themeStorageKey(THEME_SELECTION_KEY, connectionId),
  )
  if (isMobileThemeSelection(current)) return current

  const legacy = localStorage.getItem(
    themeStorageKey(LEGACY_THEME_MODE_KEY, connectionId),
  )
  return legacy === 'host' ? 'host' : 'mobile'
}

export function persistThemeSelection(
  connectionId: string,
  selection: MobileThemeSelection,
): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    themeStorageKey(THEME_SELECTION_KEY, connectionId),
    selection,
  )
}
