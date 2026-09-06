import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmbedPreferencesProvider } from './embeds'
import { Transcript } from './components/Transcript'

function renderSession(url: string, mode = 'always') {
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key.endsWith('.mode') ? mode : '[]' } })
  return renderToStaticMarkup(
    <EmbedPreferencesProvider connectionId="synthetic">
      <Transcript
        activeSpeechId="" connectionId="synthetic" toolDetailMode="expanded"
        voicePhase="idle" onSpeak={() => {}} onRespond={async () => {}}
        items={[{ id: 'synthetic-message', kind: 'assistant', text: url }]}
      />
    </EmbedPreferencesProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('YouTube inside the Mobile session transcript', () => {
  it('permits an origin-only cross-site referrer for a consented YouTube player', () => {
    const html = renderSession('https://youtu.be/abcdefghijk')
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/abcdefghijk"')
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"')
    expect(html).toContain('sandbox="allow-forms allow-presentation allow-popups allow-same-origin allow-scripts"')
  })

  it.each(['https://vimeo.com/123456', 'https://open.spotify.com/track/abc123'])(
    'retains no-referrer for other providers: %s', url => {
      expect(renderSession(url)).toContain('referrerPolicy="no-referrer"')
    },
  )

  it.each(['ask', 'off'])('does not load a player without consent in %s mode', mode => {
    expect(renderSession('https://youtu.be/abcdefghijk', mode)).not.toContain('<iframe')
  })
})
