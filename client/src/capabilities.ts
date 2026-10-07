import type { HermesTransport } from './transport/hermes-transport'

export interface PluginSetting {
  key: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'secret' | 'json'
  label: string
  description: string
  required: boolean
  value?: unknown
  choices?: string[]
  env?: string
  has_value?: boolean
}

export interface AgentPlugin {
  key: string
  name: string
  description: string
  version: string
  status: string
  settings_schema?: PluginSetting[]
}

export interface McpServer {
  name: string
  enabled: boolean
  transport: string
  source: 'config' | 'plugin'
  plugin?: string
}

export function pluginSettingValue(field: PluginSetting, raw: string | boolean): unknown {
  if (field.type === 'secret') throw new Error('Secrets must use the host credential route')
  if (field.type === 'boolean') {
    if (typeof raw !== 'boolean') throw new Error(`${field.label} must be a boolean`)
    return raw
  }
  const text = String(raw)
  if (field.required && !text.trim()) throw new Error(`${field.label} is required`)
  if (field.type === 'number') {
    if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${field.label} must be a number`)
    return Number(text)
  }
  if (field.type === 'json') return JSON.parse(text)
  if (field.type === 'enum' && !field.choices?.includes(text)) throw new Error(`${field.label} has an invalid choice`)
  return text
}

export function capabilityPath(path: string, profile: string): string {
  const url = new URL(path, 'https://hermes.invalid')
  url.searchParams.set('profile', profile || 'default')
  return `${url.pathname}${url.search}`
}

/** Only the canonical enable route updates config. Never round-trip a redacted server. */
export async function setMcpEnabled(transport: HermesTransport, server: McpServer, enabled: boolean): Promise<void> {
  if (server.source === 'plugin') throw new Error('Configure this server through its owning plugin')
  await transport.requestJson(capabilityPath(`/api/mcp/servers/${encodeURIComponent(server.name)}/enabled`, transport.connection.profile),
    { enabled }, { method: 'PUT' })
}
