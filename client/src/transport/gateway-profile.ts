export function gatewayProfileUrl(value: string, profile: string): string {
  if (!profile || profile === 'default') return value
  const url = new URL(value)
  url.searchParams.set('profile', profile)
  return url.toString()
}
