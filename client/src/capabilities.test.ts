import { describe, expect, it, vi } from 'vitest'
import { capabilityPath, pluginSettingValue, setMcpEnabled, type PluginSetting } from './capabilities'
import type { HermesTransport } from './transport/hermes-transport'

const field = (type: PluginSetting['type'], extra: Partial<PluginSetting> = {}): PluginSetting => ({
  key: 'setting', label: 'Setting', description: '', required: false, type, ...extra,
})

describe('host capability configuration', () => {
  it('keeps setting types and rejects invalid or secret schema values', () => {
    expect(pluginSettingValue(field('number'), '2.5')).toBe(2.5)
    expect(pluginSettingValue(field('boolean'), false)).toBe(false)
    expect(() => pluginSettingValue(field('boolean'), 'false')).toThrow('boolean')
    expect(pluginSettingValue(field('json'), '{"mode":"careful"}')).toEqual({ mode: 'careful' })
    expect(() => pluginSettingValue(field('number'), '')).toThrow('number')
    expect(() => pluginSettingValue(field('number'), 'Infinity')).toThrow('number')
    expect(() => pluginSettingValue(field('string', { required: true }), ' ')).toThrow('required')
    expect(() => pluginSettingValue(field('enum', { choices: ['fast', 'careful'] }), 'wrong')).toThrow('choice')
    expect(() => pluginSettingValue(field('secret'), 'password')).toThrow('credential route')
  })

  it('changes one MCP enabled flag without copying or erasing redacted config', async () => {
    const requestJson = vi.fn().mockResolvedValue({ ok: true })
    const transport = { connection: { profile: 'secondary profile' }, requestJson } as unknown as HermesTransport
    await setMcpEnabled(transport, { name: 'server/name', enabled: true, transport: 'stdio', source: 'config' }, false)
    expect(requestJson).toHaveBeenCalledWith('/api/mcp/servers/server%2Fname/enabled?profile=secondary+profile',
      { enabled: false }, { method: 'PUT' })
    await expect(setMcpEnabled(transport, { name: 'owned', enabled: true, transport: 'stdio', source: 'plugin' }, false))
      .rejects.toThrow('owning plugin')
    expect(requestJson).toHaveBeenCalledTimes(1)
  })

  it('always sends an explicit profile, including default', () => {
    expect(capabilityPath('/api/env', 'default')).toBe('/api/env?profile=default')
    expect(capabilityPath('/api/env?other=1', 'support')).toBe('/api/env?other=1&profile=support')
  })
})
