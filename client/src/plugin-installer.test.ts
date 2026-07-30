import { describe, expect, test, vi } from 'vitest'
import {
  assertSafePluginFile,
  installBundledMobilePlugin,
  joinManagedPath,
  resolveManagedPluginTarget,
} from './plugin-installer'
import type { HermesTransport } from './transport/hermes-transport'

describe('mobile plugin upload installer', () => {
  test('resolves hosted and Windows managed plugin targets without guessing', () => {
    expect(
      resolveManagedPluginTarget({
        path: '/opt/data',
        locked_root: '/opt/data',
        can_change_path: false,
      }),
    ).toEqual({
      managedRoot: '/opt/data',
      targetPath: '/opt/data/plugins/hermes-mobile',
    })
    expect(joinManagedPath('C:\\Hermes', 'plugins', 'hermes-mobile')).toBe(
      'C:\\Hermes\\plugins\\hermes-mobile',
    )
    expect(() =>
      resolveManagedPluginTarget({
        path: '/home/user',
        root: '/home/user',
        locked_root: null,
        can_change_path: true,
      }),
    ).toThrow(/will not guess/i)
  })

  test('rejects traversal and absolute paths from a bundled package', () => {
    expect(() =>
      assertSafePluginFile({ relativePath: '../plugin.yaml', content: 'x' }),
    ).toThrow(/unsafe/i)
    expect(() =>
      assertSafePluginFile({ relativePath: '/plugin.yaml', content: 'x' }),
    ).toThrow(/unsafe/i)
    expect(() =>
      assertSafePluginFile({
        relativePath: 'mobile_server/api.py',
        content: 'x',
      }),
    ).not.toThrow()
  })

  test('uploads every verified file before enabling the plugin', async () => {
    const calls: Array<{ path: string; body?: Record<string, unknown> }> = []
    const requestJson = vi.fn(
      async (path: string, body?: Record<string, unknown>) => {
        calls.push({ path, body })
        if (path === '/api/files/upload') {
          return {
            ok: true,
            entry: { path: String(body?.path || '') },
          }
        }
        return { ok: true }
      },
    )
    const transport = {
      requestJson,
    } as unknown as HermesTransport
    const files = [
      { relativePath: 'mobile_server/api.py', content: 'api = True\n' },
      { relativePath: 'plugin.yaml', content: 'name: hermes-mobile\n' },
    ]

    const result = await installBundledMobilePlugin(
      transport,
      '/opt/data/plugins/hermes-mobile',
      undefined,
      files,
    )

    expect(calls.map(call => call.path)).toEqual([
      '/api/files/upload',
      '/api/files/upload',
      '/api/dashboard/agent-plugins/hermes-mobile/enable',
    ])
    expect(calls[0].body?.path).toBe(
      '/opt/data/plugins/hermes-mobile/mobile_server/api.py',
    )
    expect(String(calls[0].body?.data_url)).toMatch(
      /^data:text\/plain;charset=utf-8;base64,/,
    )
    expect(result).toMatchObject({
      fileCount: 2,
      restartRequired: true,
      targetPath: '/opt/data/plugins/hermes-mobile',
    })
  })

  test('does not enable after an unverified upload response', async () => {
    const requestJson = vi.fn().mockResolvedValue({ ok: true })
    const transport = {
      requestJson,
    } as unknown as HermesTransport

    await expect(
      installBundledMobilePlugin(
        transport,
        '/opt/data/plugins/hermes-mobile',
        undefined,
        [{ relativePath: 'plugin.yaml', content: 'name: hermes-mobile\n' }],
      ),
    ).rejects.toThrow(/did not verify/i)
    expect(requestJson).toHaveBeenCalledTimes(1)
  })

  test('refuses to write outside the exact plugin directory', async () => {
    const requestJson = vi.fn()
    const transport = {
      requestJson,
    } as unknown as HermesTransport

    await expect(
      installBundledMobilePlugin(
        transport,
        '/opt/data',
        undefined,
        [{ relativePath: 'plugin.yaml', content: 'name: hermes-mobile\n' }],
      ),
    ).rejects.toThrow(/plugins\/hermes-mobile/i)
    expect(requestJson).not.toHaveBeenCalled()
  })
})
