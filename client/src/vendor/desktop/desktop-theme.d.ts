// Types for the generated ESM bundle next to this file (scripts/desktop-theme/sync.mjs).
export type DesktopThemeMode = 'light' | 'dark'

export interface DesktopSkinInput {
  name?: string
  colors?: Record<string, unknown>
  dark_colors?: Record<string, unknown>
  light_colors?: Record<string, unknown>
}

export interface AppliedDesktopTheme {
  name: string
  label: string
  mode: 'light' | 'dark'
  chromeBackground: string
}

export const DEFAULT_SKIN_NAME: string
export function apply(
  input: string | DesktopSkinInput | null | undefined,
  mode: DesktopThemeMode,
  doc?: Document,
): AppliedDesktopTheme
export function listThemes(): Array<{ name: string; label: string; description?: string }>
export function resolveTheme(input: string | DesktopSkinInput | null | undefined): {
  name: string
  label: string
}
export function themeVariables(
  theme: unknown,
  mode: DesktopThemeMode,
): { vars: Record<string, string>; rendered: 'light' | 'dark'; chromeBackground: string; fontUrl?: string }
