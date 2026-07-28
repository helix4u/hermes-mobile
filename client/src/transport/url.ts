export interface ParsedHermesUrl {
  baseUrl: string
  basePath: string
  host: string
  httpProtocol: 'http:' | 'https:'
  wsProtocol: 'ws:' | 'wss:'
}

export function parseHermesUrl(value: string): ParsedHermesUrl {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Connection URL is required')
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const url = new URL(withProtocol)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Connection URL must use HTTP or HTTPS')
  }

  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''

  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
  const baseUrl = `${url.protocol}//${url.host}${basePath}`

  return {
    baseUrl,
    basePath,
    host: url.host,
    httpProtocol: url.protocol,
    wsProtocol: url.protocol === 'https:' ? 'wss:' : 'ws:',
  }
}

export function buildPluginHttpUrl(baseUrl: string, path: string): string {
  const parsed = parseHermesUrl(baseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${parsed.baseUrl}${normalizedPath}`
}

export function buildPluginWsUrl(
  baseUrl: string,
  auth: readonly [name: string, value: string],
): string {
  const gatewayUrl = buildPluginGatewayUrl(baseUrl)
  const query = new URLSearchParams([[auth[0], auth[1]]])
  return `${gatewayUrl}?${query}`
}

export function buildPluginGatewayUrl(baseUrl: string): string {
  const parsed = parseHermesUrl(baseUrl)
  return `${parsed.wsProtocol}//${parsed.host}${parsed.basePath}/api/plugins/hermes-mobile/v1/gateway`
}

export function buildCoreWsUrl(
  baseUrl: string,
  auth: readonly [name: string, value: string],
): string {
  const parsed = parseHermesUrl(baseUrl)
  const query = new URLSearchParams([[auth[0], auth[1]]])
  return `${parsed.wsProtocol}//${parsed.host}${parsed.basePath}/api/ws?${query}`
}
