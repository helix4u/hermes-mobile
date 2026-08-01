import type { HermesTransport } from './transport/hermes-transport'

export type PreviewKind = 'audio' | 'file' | 'image' | 'text' | 'video'

export interface PreviewDocument {
  binary: boolean
  byteSize?: number
  dataUrl?: string
  kind: PreviewKind
  language?: string
  mimeType: string
  name: string
  path: string
  text: string
  truncated: boolean
}

interface FileTextResponse {
  binary?: boolean
  byteSize?: number
  language?: string
  mimeType?: string
  path?: string
  text?: string
  truncated?: boolean
}

interface FileDataResponse {
  dataUrl?: string
}

interface MediaInfo {
  kind: Exclude<PreviewKind, 'file' | 'text'>
  mimeType: string
}

const MEDIA_BY_EXTENSION: Record<string, MediaInfo> = {
  '3g2': { kind: 'video', mimeType: 'video/3gpp2' },
  '3gp': { kind: 'video', mimeType: 'video/3gpp' },
  '3ga': { kind: 'audio', mimeType: 'audio/3gpp' },
  aac: { kind: 'audio', mimeType: 'audio/aac' },
  ac3: { kind: 'audio', mimeType: 'audio/ac3' },
  aif: { kind: 'audio', mimeType: 'audio/aiff' },
  aiff: { kind: 'audio', mimeType: 'audio/aiff' },
  amr: { kind: 'audio', mimeType: 'audio/amr' },
  avi: { kind: 'video', mimeType: 'video/x-msvideo' },
  bmp: { kind: 'image', mimeType: 'image/bmp' },
  caf: { kind: 'audio', mimeType: 'audio/x-caf' },
  flac: { kind: 'audio', mimeType: 'audio/flac' },
  gif: { kind: 'image', mimeType: 'image/gif' },
  jpeg: { kind: 'image', mimeType: 'image/jpeg' },
  jpg: { kind: 'image', mimeType: 'image/jpeg' },
  m4a: { kind: 'audio', mimeType: 'audio/mp4' },
  m4b: { kind: 'audio', mimeType: 'audio/mp4' },
  m4v: { kind: 'video', mimeType: 'video/x-m4v' },
  mid: { kind: 'audio', mimeType: 'audio/midi' },
  midi: { kind: 'audio', mimeType: 'audio/midi' },
  mkv: { kind: 'video', mimeType: 'video/x-matroska' },
  mov: { kind: 'video', mimeType: 'video/quicktime' },
  mp3: { kind: 'audio', mimeType: 'audio/mpeg' },
  mp4: { kind: 'video', mimeType: 'video/mp4' },
  mpeg: { kind: 'video', mimeType: 'video/mpeg' },
  mpg: { kind: 'video', mimeType: 'video/mpeg' },
  mts: { kind: 'video', mimeType: 'video/mp2t' },
  oga: { kind: 'audio', mimeType: 'audio/ogg' },
  ogg: { kind: 'audio', mimeType: 'audio/ogg' },
  ogv: { kind: 'video', mimeType: 'video/ogg' },
  opus: { kind: 'audio', mimeType: 'audio/ogg; codecs=opus' },
  png: { kind: 'image', mimeType: 'image/png' },
  svg: { kind: 'image', mimeType: 'image/svg+xml' },
  wav: { kind: 'audio', mimeType: 'audio/wav' },
  webm: { kind: 'video', mimeType: 'video/webm' },
  webp: { kind: 'image', mimeType: 'image/webp' },
  wma: { kind: 'audio', mimeType: 'audio/x-ms-wma' },
  wmv: { kind: 'video', mimeType: 'video/x-ms-wmv' },
}

export function previewName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

export function previewMediaInfo(path: string): MediaInfo | null {
  const clean = path.split(/[?#]/, 1)[0] || path
  const extension = clean.includes('.')
    ? clean.split('.').pop()?.toLowerCase() || ''
    : ''
  return MEDIA_BY_EXTENSION[extension] ?? null
}

export function isMarkdownDocument(document: PreviewDocument): boolean {
  return (
    /\.m(?:arkdown|d)$/i.test(document.path) ||
    document.mimeType === 'text/markdown' ||
    document.language === 'markdown'
  )
}

export async function loadPreviewDocument(
  transport: HermesTransport,
  path: string,
): Promise<PreviewDocument> {
  const media = previewMediaInfo(path)
  if (media) {
    const result = await transport.requestJson<FileDataResponse>(
      `/api/fs/read-data-url?path=${encodeURIComponent(path)}`,
    )
    if (!result.dataUrl) throw new Error('Hermes did not return media data')
    const mimeType =
      /^data:([^;,]+)/i.exec(result.dataUrl)?.[1] || media.mimeType
    return {
      binary: true,
      dataUrl: result.dataUrl,
      kind: media.kind,
      mimeType,
      name: previewName(path),
      path,
      text: '',
      truncated: false,
    }
  }

  const result = await transport.requestJson<FileTextResponse>(
    `/api/fs/read-text?path=${encodeURIComponent(path)}`,
  )
  const resolvedPath = result.path || path
  return {
    binary: Boolean(result.binary),
    byteSize: result.byteSize,
    kind: result.binary ? 'file' : 'text',
    language: result.language,
    mimeType: result.mimeType || 'text/plain',
    name: previewName(resolvedPath),
    path: resolvedPath,
    text: result.text ?? '',
    truncated: Boolean(result.truncated),
  }
}
