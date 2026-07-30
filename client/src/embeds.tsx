import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type EmbedMode = 'always' | 'ask' | 'off'

interface EmbedPreferences {
  allowedProviders: string[]
  allowProvider: (provider: string) => void
  clearAllowedProviders: () => void
  mode: EmbedMode
  setMode: (mode: EmbedMode) => void
}

export interface EmbedDescriptor {
  aspectRatio?: number
  embedUrl: string
  height?: number
  label: string
  provider: string
  sourceUrl: string
}

const fallbackPreferences: EmbedPreferences = {
  allowedProviders: [],
  allowProvider: () => {},
  clearAllowedProviders: () => {},
  mode: 'ask',
  setMode: () => {},
}

const EmbedPreferencesContext =
  createContext<EmbedPreferences>(fallbackPreferences)

function modeKey(connectionId: string): string {
  return `hermes-mobile.embeds.${connectionId}.mode`
}

function allowedKey(connectionId: string): string {
  return `hermes-mobile.embeds.${connectionId}.allowed`
}

function loadMode(connectionId: string): EmbedMode {
  if (typeof window === 'undefined') return 'ask'
  const stored = window.localStorage.getItem(modeKey(connectionId))
  return stored === 'always' || stored === 'off' ? stored : 'ask'
}

function loadAllowed(connectionId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(allowedKey(connectionId)) || '[]',
    )
    return Array.isArray(stored)
      ? stored.filter(value => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

export function EmbedPreferencesProvider({
  children,
  connectionId,
}: {
  children: ReactNode
  connectionId: string
}) {
  const [mode, setModeState] = useState<EmbedMode>(() => loadMode(connectionId))
  const [allowedProviders, setAllowedProviders] = useState<string[]>(() =>
    loadAllowed(connectionId),
  )

  useEffect(() => {
    setModeState(loadMode(connectionId))
    setAllowedProviders(loadAllowed(connectionId))
  }, [connectionId])

  const value = useMemo<EmbedPreferences>(
    () => ({
      allowedProviders,
      allowProvider(provider) {
        setAllowedProviders(current => {
          if (current.includes(provider)) return current
          const next = [...current, provider]
          window.localStorage.setItem(
            allowedKey(connectionId),
            JSON.stringify(next),
          )
          return next
        })
      },
      clearAllowedProviders() {
        window.localStorage.removeItem(allowedKey(connectionId))
        setAllowedProviders([])
      },
      mode,
      setMode(nextMode) {
        window.localStorage.setItem(modeKey(connectionId), nextMode)
        setModeState(nextMode)
      },
    }),
    [allowedProviders, connectionId, mode],
  )

  return (
    <EmbedPreferencesContext.Provider value={value}>
      {children}
    </EmbedPreferencesContext.Provider>
  )
}

export function useEmbedPreferences(): EmbedPreferences {
  return useContext(EmbedPreferencesContext)
}

function youtubeDescriptor(url: URL): EmbedDescriptor | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  let id = ''
  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || ''
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || ''
    const match = /^\/(?:embed|shorts)\/([^/?#]+)/.exec(url.pathname)
    if (match) id = match[1]
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null
  return {
    aspectRatio: 16 / 9,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    label: 'YouTube',
    provider: 'youtube',
    sourceUrl: url.href,
  }
}

function vimeoDescriptor(url: URL): EmbedDescriptor | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
  const match = /\/(?:video\/)?(\d+)/.exec(url.pathname)
  if (!match) return null
  return {
    aspectRatio: 16 / 9,
    embedUrl: `https://player.vimeo.com/video/${match[1]}`,
    label: 'Vimeo',
    provider: 'vimeo',
    sourceUrl: url.href,
  }
}

function spotifyDescriptor(url: URL): EmbedDescriptor | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (host !== 'open.spotify.com') return null
  const match =
    /^\/(album|artist|episode|playlist|show|track)\/([A-Za-z0-9]+)/.exec(
      url.pathname,
    )
  if (!match) return null
  return {
    embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
    height: match[1] === 'track' || match[1] === 'episode' ? 152 : 352,
    label: 'Spotify',
    provider: 'spotify',
    sourceUrl: url.href,
  }
}

export function detectEmbed(value: string): EmbedDescriptor | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null
  return (
    youtubeDescriptor(url) || vimeoDescriptor(url) || spotifyDescriptor(url)
  )
}

export function RichEmbed({ descriptor }: { descriptor: EmbedDescriptor }) {
  const { allowedProviders, allowProvider, mode } = useEmbedPreferences()
  const [loaded, setLoaded] = useState(false)
  const consented =
    mode === 'always' ||
    loaded ||
    allowedProviders.includes(descriptor.provider)

  if (mode === 'off') {
    return (
      <a href={descriptor.sourceUrl} rel="noopener noreferrer" target="_blank">
        {descriptor.sourceUrl}
      </a>
    )
  }

  const style = descriptor.aspectRatio
    ? { aspectRatio: String(descriptor.aspectRatio) }
    : { minHeight: `${descriptor.height || 320}px` }

  if (!consented) {
    return (
      <span className="embed-facade" style={style}>
        <strong>{descriptor.label} preview</strong>
        <small>
          Loading this contacts {new URL(descriptor.sourceUrl).hostname}.
        </small>
        <span className="embed-actions">
          <button type="button" onClick={() => setLoaded(true)}>
            Load once
          </button>
          <button
            type="button"
            onClick={() => allowProvider(descriptor.provider)}
          >
            Always allow
          </button>
        </span>
      </span>
    )
  }

  return (
    <span className="rich-embed" style={style}>
      <iframe
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-forms allow-presentation allow-popups allow-same-origin allow-scripts"
        src={descriptor.embedUrl}
        title={`${descriptor.label} embed`}
      />
    </span>
  )
}
