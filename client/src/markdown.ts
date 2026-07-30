import { stripMediaMarkers } from './media-markers'

export function safeMarkdownUrl(
  value: string | undefined,
  image = false,
): string {
  const url = String(value ?? '').trim()
  if (!url) return ''
  if (/^(#|\/(?!\/)|\.{1,2}\/)/.test(url)) return url
  if (
    image &&
    /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)
  ) {
    return url
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url
    if (!image && parsed.protocol === 'mailto:') return url
  } catch {
    return ''
  }
  return ''
}

export function markdownToSpeechText(markdown: string): string {
  return stripMediaMarkers(markdown)
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/([*_])([^*_]+)\1/g, '$2')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
