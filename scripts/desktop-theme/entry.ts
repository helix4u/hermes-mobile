/**
 * Hermes Mobile build entry: Hermes Desktop's theme engine, unchanged where
 * possible, bundled to `client/src/vendor/desktop/desktop-theme.js` (ESM) by
 * `scripts/desktop-theme/sync.mjs`.
 *
 * Imported verbatim from the Desktop source tree:
 *   apps/desktop/src/themes/presets.ts   BUILTIN_THEMES, DEFAULT_SKIN_NAME, typography
 *   apps/desktop/src/themes/skin.ts      skinToDesktopTheme (backend skin -> palette)
 *   apps/desktop/src/themes/color.ts     readableInk, harmonize
 *   apps/shared/src/color.ts             mix, ensureContrast, parseColor
 *
 * Ported from apps/desktop/src/themes/context.tsx (React/nanostores-free copy;
 * keep in sync when that file changes): synthLightColors, getBaseColors,
 * renderedModeFor, mixesFor, applyTheme's variable mapping.
 */

import { ensureContrast, mix, parseColor } from '@hermes/shared/color'
import type { HermesSkin } from '@hermes/shared/skin'

import { harmonize, readableInk } from '@desktop/themes/color'
import { BUILTIN_THEMES, DEFAULT_SKIN_NAME, DEFAULT_TYPOGRAPHY, nousTheme, RETIRED_SKINS } from '@desktop/themes/presets'
import { skinToDesktopTheme } from '@desktop/themes/skin'
import type { DesktopTheme, DesktopThemeColors } from '@desktop/themes/types'

type Mode = 'light' | 'dark'

const NEUTRAL_CHROME = { light: '#f3f3f3', dark: '#0d0d0e' } as const
const PRIMARY_SOLID_FOREGROUND = '#fcfcfc'

function synthLightColors(seed: DesktopTheme): DesktopThemeColors {
  const accent = seed.colors.ring || seed.colors.primary
  const soft = mix('#ffffff', accent, 0.1)
  const softer = mix('#ffffff', accent, 0.06)
  const border = mix('#ececef', accent, 0.14)
  const midground = seed.colors.midground ?? accent

  return {
    background: '#ffffff',
    foreground: '#161616',
    card: '#ffffff',
    cardForeground: '#161616',
    muted: softer,
    mutedForeground: mix('#6b6b70', accent, 0.16),
    popover: '#ffffff',
    popoverForeground: '#161616',
    primary: accent,
    primaryForeground: readableInk(accent),
    secondary: soft,
    secondaryForeground: mix('#2a2a2a', accent, 0.34),
    accent: soft,
    accentForeground: mix('#2a2a2a', accent, 0.34),
    border,
    input: mix('#e2e2e6', accent, 0.18),
    ring: accent,
    midground,
    midgroundForeground: readableInk(midground),
    destructive: '#b94a3a',
    destructiveForeground: '#ffffff',
    sidebarBackground: mix('#fafafa', accent, 0.05),
    sidebarBorder: border,
    userBubble: soft,
    userBubbleBorder: border
  }
}

function baseColors(seed: DesktopTheme, mode: Mode): DesktopThemeColors {
  if (mode === 'dark') {
    return seed.darkColors ?? seed.colors
  }

  return seed.darkColors ? seed.colors : synthLightColors(seed)
}

function renderedModeFor(colors: DesktopThemeColors, mode: Mode): Mode {
  const rgb = parseColor(colors.background)

  if (!rgb) {
    return mode
  }

  const [r, g, b] = rgb.map(v => v / 255)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? 'light' : 'dark'
}

const mixesFor = (isDark: boolean): Record<string, string> => ({
  '--theme-mix-chrome': isDark ? '74%' : '92%',
  '--theme-mix-sidebar': '100%',
  '--theme-mix-card': isDark ? '38%' : '22%',
  '--theme-mix-elevated': isDark ? '46%' : '28%',
  '--theme-mix-bubble': isDark ? '46%' : '0%'
})

const chromeBackground = (background: string, isDark: boolean) =>
  mix(background, NEUTRAL_CHROME[isDark ? 'dark' : 'light'], isDark ? 0.26 : 0.08)

/**
 * Resolve a theme the way Desktop's backend-sync does: a built-in name keeps
 * Desktop's own palette; any other backend skin payload is converted.
 */
function resolveTheme(input: string | HermesSkin | null | undefined): DesktopTheme {
  if (!input) {
    return BUILTIN_THEMES[DEFAULT_SKIN_NAME] ?? nousTheme
  }

  if (typeof input === 'string') {
    const name = RETIRED_SKINS.has(input) ? DEFAULT_SKIN_NAME : input

    return BUILTIN_THEMES[name] ?? BUILTIN_THEMES[DEFAULT_SKIN_NAME] ?? nousTheme
  }

  const name = String(input.name ?? '').trim()

  if (name && (BUILTIN_THEMES[name] || RETIRED_SKINS.has(name))) {
    return resolveTheme(name)
  }

  return skinToDesktopTheme(input) ?? BUILTIN_THEMES[DEFAULT_SKIN_NAME] ?? nousTheme
}

/** CSS variables Desktop's applyTheme writes for `theme` in `mode`. */
function themeVariables(theme: DesktopTheme, mode: Mode) {
  const c = baseColors(theme, mode)
  const typo = { ...DEFAULT_TYPOGRAPHY, ...nousTheme.typography, ...theme.typography }
  const rendered = renderedModeFor(c, mode)
  const isDark = rendered === 'dark'
  const midground = c.midground ?? c.ring

  const vars: Record<string, string> = {
    '--theme-foreground': c.foreground,
    '--theme-primary': c.primary,
    '--theme-secondary': c.secondary,
    '--theme-accent-soft': c.accent,
    '--theme-midground': midground,
    '--theme-warm': c.primary,
    '--theme-background-seed': c.background,
    '--theme-sidebar-seed': c.sidebarBackground ?? c.background,
    '--theme-card-seed': c.card,
    '--theme-elevated-seed': c.popover,
    '--theme-bubble-seed': c.userBubble ?? c.popover,
    ...mixesFor(isDark),
    '--dt-primary-foreground': c.primaryForeground,
    '--dt-secondary-foreground': c.secondaryForeground,
    '--dt-accent-foreground': c.accentForeground,
    '--dt-border': c.border,
    '--dt-input': c.input,
    '--dt-ring': c.ring,
    '--dt-muted': c.muted,
    '--dt-midground-foreground': c.midgroundForeground ?? readableInk(midground),
    '--dt-primary-solid': ensureContrast(c.primary, PRIMARY_SOLID_FOREGROUND, 4.5),
    '--dt-primary-solid-foreground': PRIMARY_SOLID_FOREGROUND,
    '--dt-composer-ring': c.composerRing ?? midground,
    '--dt-destructive': c.destructive,
    '--dt-destructive-foreground': c.destructiveForeground,
    '--dt-sidebar-border': c.sidebarBorder ?? c.border,
    '--dt-user-bubble-border': c.userBubbleBorder ?? c.border,
    '--ui-success': harmonize('#10b981', midground, 0.25),
    '--dt-font-sans': typo.fontSans,
    '--dt-font-mono': typo.fontMono,
    '--noise-opacity-mul': isDark ? 'calc(0.04 / 0.21)' : 'calc(0.34 / 0.21)'
  }

  return { vars, rendered, chromeBackground: chromeBackground(c.background, isDark), fontUrl: typo.fontUrl ?? '' }
}

function apply(input: string | HermesSkin | null | undefined, mode: Mode, doc: Document = document) {
  const theme = resolveTheme(input)
  const { vars, rendered, chromeBackground: chromeBg, fontUrl } = themeVariables(theme, mode)
  const root = doc.documentElement

  root.style.setProperty('color-scheme', rendered)
  root.dataset.hermesTheme = theme.name
  root.dataset.hermesMode = rendered
  root.classList.toggle('dark', rendered === 'dark')

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }

  if (fontUrl && !doc.querySelector(`link[data-hermes-theme-font="${CSS.escape(fontUrl)}"]`)) {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontUrl
    link.dataset.hermesThemeFont = fontUrl
    doc.head.appendChild(link)
  }

  return { name: theme.name, label: theme.label, mode: rendered, chromeBackground: chromeBg }
}

const listThemes = () =>
  Object.values(BUILTIN_THEMES).map(theme => ({ name: theme.name, label: theme.label, description: theme.description }))

export { apply, DEFAULT_SKIN_NAME, listThemes, resolveTheme, themeVariables }
