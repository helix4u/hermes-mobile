import { describe, expect, test } from 'vitest'
import { detectEmbed } from './embeds'

describe('mobile rich embeds', () => {
  test('detects supported bare media links using privacy-preserving players', () => {
    expect(detectEmbed('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
    expect(detectEmbed('https://open.spotify.com/track/abc123')).toMatchObject({
      provider: 'spotify',
      embedUrl: 'https://open.spotify.com/embed/track/abc123',
    })
  })

  test('leaves arbitrary and active-scheme links unembedded', () => {
    expect(detectEmbed('https://example.com/watch?v=1')).toBeNull()
    expect(detectEmbed('javascript:alert(1)')).toBeNull()
  })
})
