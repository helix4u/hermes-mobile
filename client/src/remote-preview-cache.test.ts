import { afterEach, describe, expect, test, vi } from 'vitest'
import type { HermesTransport } from './transport/hermes-transport'
import {
  clearRemotePreviewCacheForTests,
  loadRemotePreview,
  peekRemotePreview,
} from './remote-preview-cache'

function transport(
  connectionId: string,
  requestJson: HermesTransport['requestJson'],
): HermesTransport {
  return {
    connection: { id: connectionId },
    requestJson,
  } as unknown as HermesTransport
}

afterEach(() => clearRemotePreviewCacheForTests())

describe('remote preview cache', () => {
  test('coalesces remounted attachment loads for one connection and path', async () => {
    const requestJson = vi.fn(async () => ({
      mimeType: 'text/markdown',
      text: '# Cached once',
    })) as HermesTransport['requestJson']
    const client = transport('workstation', requestJson)

    const [first, second] = await Promise.all([
      loadRemotePreview(client, 'workstation', '/work/report.md'),
      loadRemotePreview(client, 'workstation', '/work/report.md'),
    ])

    expect(requestJson).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    expect(peekRemotePreview('workstation', '/work/report.md')?.text).toBe(
      '# Cached once',
    )
  })

  test('never shares attachment contents across connections', async () => {
    const firstRequest = vi.fn(async () => ({
      text: 'private A',
    })) as HermesTransport['requestJson']
    const secondRequest = vi.fn(async () => ({
      text: 'private B',
    })) as HermesTransport['requestJson']

    await loadRemotePreview(
      transport('host-a', firstRequest),
      'host-a',
      '/work/report.md',
    )
    await loadRemotePreview(
      transport('host-b', secondRequest),
      'host-b',
      '/work/report.md',
    )

    expect(peekRemotePreview('host-a', '/work/report.md')?.text).toBe(
      'private A',
    )
    expect(peekRemotePreview('host-b', '/work/report.md')?.text).toBe(
      'private B',
    )
  })

  test('explicit refresh replaces the cached document', async () => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({ text: 'version one' })
      .mockResolvedValueOnce({ text: 'version two' }) as HermesTransport['requestJson']
    const client = transport('workstation', requestJson)

    await loadRemotePreview(client, 'workstation', '/work/report.md')
    await loadRemotePreview(client, 'workstation', '/work/report.md', true)

    expect(requestJson).toHaveBeenCalledTimes(2)
    expect(peekRemotePreview('workstation', '/work/report.md')?.text).toBe(
      'version two',
    )
  })
})
