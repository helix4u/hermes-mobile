/** Only ordinary web addresses can be offered to the user's browser. */
export function voiceWebpageUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A webpage URL is required.')
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials.')
  return url.href
}
