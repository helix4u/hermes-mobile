export interface MobileThemePreset {
  id: MobileThemePresetId
  label: string
  description: string
  variables: Record<string, string>
}

export type MobileThemePresetId =
  | 'nous'
  | 'midnight'
  | 'ember'
  | 'mono'
  | 'cyberpunk'
  | 'slate'

interface DesktopPalette {
  background: string
  foreground: string
  card: string
  muted: string
  mutedForeground: string
  popover: string
  primary: string
  primaryForeground: string
  border: string
  input: string
  ring: string
  destructive: string
}

function mobileVariables(palette: DesktopPalette): Record<string, string> {
  return {
    '--bg': palette.background,
    '--surface': palette.card,
    '--surface-2': palette.muted,
    '--surface-3': palette.popover,
    '--stroke': palette.border,
    '--stroke-strong': palette.input,
    '--text': palette.foreground,
    '--muted': palette.mutedForeground,
    '--muted-2': palette.mutedForeground,
    '--gold': palette.ring,
    '--gold-light': palette.primary,
    '--gold-ink': palette.primaryForeground,
    '--danger': palette.destructive,
    '--success': '#74c995',
    '--warning': '#e6b85f',
  }
}

// These are the hand-tuned dark palettes from Hermes Desktop's built-in
// themes, projected onto the smaller token set owned by the mobile client.
export const MOBILE_THEME_PRESETS: Record<
  MobileThemePresetId,
  MobileThemePreset
> = {
  nous: {
    id: 'nous',
    label: 'Nous',
    description: 'Glass neutrals with Nous blue accents',
    variables: mobileVariables({
      background: '#0D2F86',
      foreground: '#FFE6CB',
      card: '#12378F',
      muted: '#183F9A',
      mutedForeground: '#B5C7F3',
      popover: '#123A96',
      primary: '#FFE6CB',
      primaryForeground: '#0D2F86',
      border: '#3158AD',
      input: '#0B2566',
      ring: '#FFE6CB',
      destructive: '#C0473A',
    }),
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep blue-violet with cool accents',
    variables: mobileVariables({
      background: '#08081c',
      foreground: '#ddd6ff',
      card: '#0d0d28',
      muted: '#13133a',
      mutedForeground: '#7c7ab0',
      popover: '#0f0f2e',
      primary: '#ddd6ff',
      primaryForeground: '#08081c',
      border: '#1e1e52',
      input: '#1e1e52',
      ring: '#8b80e8',
      destructive: '#b03060',
    }),
  },
  ember: {
    id: 'ember',
    label: 'Ember',
    description: 'Warm crimson and bronze',
    variables: mobileVariables({
      background: '#160800',
      foreground: '#ffd8b0',
      card: '#1e0e04',
      muted: '#2a1408',
      mutedForeground: '#aa7a56',
      popover: '#221008',
      primary: '#ffd8b0',
      primaryForeground: '#160800',
      border: '#3a1c08',
      input: '#3a1c08',
      ring: '#d97316',
      destructive: '#c43010',
    }),
  },
  mono: {
    id: 'mono',
    label: 'Mono',
    description: 'Clean grayscale, minimal and focused',
    variables: mobileVariables({
      background: '#0e0e0e',
      foreground: '#eaeaea',
      card: '#141414',
      muted: '#1e1e1e',
      mutedForeground: '#808080',
      popover: '#181818',
      primary: '#eaeaea',
      primaryForeground: '#0e0e0e',
      border: '#2a2a2a',
      input: '#2a2a2a',
      ring: '#9a9a9a',
      destructive: '#a84040',
    }),
  },
  cyberpunk: {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Neon green on black',
    variables: mobileVariables({
      background: '#000a00',
      foreground: '#00ff41',
      card: '#001200',
      muted: '#001a00',
      mutedForeground: '#1a8a30',
      popover: '#001000',
      primary: '#00ff41',
      primaryForeground: '#000a00',
      border: '#003000',
      input: '#003000',
      ring: '#00ff41',
      destructive: '#ff003c',
    }),
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    description: 'Cool slate blue for focused work',
    variables: mobileVariables({
      background: '#0d1117',
      foreground: '#c9d1d9',
      card: '#161b22',
      muted: '#21262d',
      mutedForeground: '#8b949e',
      popover: '#1c2128',
      primary: '#c9d1d9',
      primaryForeground: '#0d1117',
      border: '#30363d',
      input: '#30363d',
      ring: '#58a6ff',
      destructive: '#cf4848',
    }),
  },
}

export const MOBILE_THEME_PRESET_LIST = Object.values(MOBILE_THEME_PRESETS)
