import { previewMediaInfo, previewName } from './preview'

export const HERMES_MEDIA_HREF_PREFIX = '#hermes-media:'

const MEDIA_LINE_RE =
  /(^|\n)[\t ]*[`"']?MEDIA:\s*(?<line>`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)[`"']?[\t ]*(\n|$)/g
const MEDIA_TAG_RE =
  /[`"']?MEDIA:\s*(?<inline>`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)[`"']?/g

function cleanSpacing(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function unquoteMediaPath(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]
  return quote &&
    quote === trimmed.at(-1) &&
    ['"', "'", '`'].includes(quote)
    ? trimmed.slice(1, -1)
    : trimmed
}

export function mediaMarkerLabel(path: string): string {
  const kind = previewMediaInfo(path)?.kind
  const prefix =
    kind === 'image'
      ? 'Image'
      : kind === 'audio'
        ? 'Audio'
        : kind === 'video'
          ? 'Video'
          : 'File'
  return `${prefix}: ${previewName(path)}`
}

export function mediaMarkerHref(path: string): string {
  return `${HERMES_MEDIA_HREF_PREFIX}${encodeURIComponent(path)}`
}

export function mediaPathFromHref(value: string | undefined): string {
  if (!value?.startsWith(HERMES_MEDIA_HREF_PREFIX)) return ''
  try {
    return decodeURIComponent(value.slice(HERMES_MEDIA_HREF_PREFIX.length))
  } catch {
    return ''
  }
}

function mediaLink(value: string): string {
  const path = unquoteMediaPath(value)
  return `[${mediaMarkerLabel(path)}](${mediaMarkerHref(path)})`
}

export function renderMediaMarkers(text: string): string {
  return text
    .replace(
      MEDIA_LINE_RE,
      (_match, lead: string, value: string, trailer: string) =>
        `${lead}${mediaLink(value)}${trailer}`,
    )
    .replace(MEDIA_TAG_RE, (_match, value: string) => mediaLink(value))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

export function displayTextForMediaMarkers(text: string): string {
  return text
    .replace(
      MEDIA_LINE_RE,
      (_match, lead: string, value: string, trailer: string) => {
        const path = unquoteMediaPath(value)
        return `${lead}[${mediaMarkerLabel(path)}]${trailer}`
      },
    )
    .replace(MEDIA_TAG_RE, (_match, value: string) => {
      const path = unquoteMediaPath(value)
      return `[${mediaMarkerLabel(path)}]`
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

export function stripMediaMarkers(text: string): string {
  return cleanSpacing(
    text
      .replace(
        MEDIA_LINE_RE,
        (_match, lead: string, _value: string, trailer: string) =>
          `${lead}${trailer}`,
      )
      .replace(MEDIA_TAG_RE, ''),
  )
}
