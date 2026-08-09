import { describe, expect, test } from 'vitest'
import {
  buildCoreWsUrl,
  buildPluginGatewayUrl,
  buildPluginHttpUrl,
  buildPluginWsUrl,
  parseHermesUrl,
} from './url'

describe('Hermes connection URL handling', () => {
  test('preserves a reverse-proxy path prefix', () => {
    const parsed = parseHermesUrl(
      'https://example.test/hermes/',
    )

    expect(parsed.baseUrl).toBe('https://example.test/hermes')
    expect(
      buildPluginHttpUrl(parsed.baseUrl, '/api/plugins/hermes-mobile/v1/health'),
    ).toBe(
      'https://example.test/hermes/api/plugins/hermes-mobile/v1/health',
    )
    expect(
      buildPluginWsUrl(parsed.baseUrl, ['ticket', 'one use']),
    ).toBe(
      'wss://example.test/hermes/api/plugins/hermes-mobile/v1/gateway?ticket=one+use',
    )
    expect(buildPluginGatewayUrl(parsed.baseUrl)).toBe(
      'wss://example.test/hermes/api/plugins/hermes-mobile/v1/gateway',
    )
    expect(
      buildCoreWsUrl(parsed.baseUrl, ['ticket', 'one use']),
    ).toBe('wss://example.test/hermes/api/ws?ticket=one+use')
  })

  test('defaults a bare host to HTTPS', () => {
    expect(parseHermesUrl('workstation.example.ts.net').baseUrl).toBe(
      'https://workstation.example.ts.net',
    )
  })

  test('allows same-device Termux loopback HTTP and WebSocket URLs', () => {
    expect(parseHermesUrl('127.0.0.1:9129').baseUrl).toBe(
      'http://127.0.0.1:9129',
    )
    expect(parseHermesUrl('http://localhost:9129/').baseUrl).toBe(
      'http://localhost:9129',
    )
    expect(buildPluginGatewayUrl('http://127.0.0.1:9129')).toBe(
      'ws://127.0.0.1:9129/api/plugins/hermes-mobile/v1/gateway',
    )
  })

  test('rejects cleartext connections outside the same device', () => {
    expect(() => parseHermesUrl('http://192.168.1.50:9129')).toThrow(
      'HTTP is allowed only for a same-device loopback Hermes server',
    )
    expect(() => parseHermesUrl('http://example.test')).toThrow(
      'HTTP is allowed only for a same-device loopback Hermes server',
    )
  })

  test('rejects non-HTTP protocols', () => {
    expect(() => parseHermesUrl('file:///tmp/hermes')).toThrow(
      'must use HTTP or HTTPS',
    )
  })
})
