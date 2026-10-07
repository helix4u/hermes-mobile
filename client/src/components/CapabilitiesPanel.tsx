import { useEffect, useRef, useState } from 'react'
import type { HermesTransport } from '../transport/hermes-transport'
import { capabilityPath, pluginSettingValue, setMcpEnabled, type AgentPlugin, type McpServer, type PluginSetting } from '../capabilities'

interface Connector { connector: string; enabled: boolean; connected: boolean; status_reason?: string }
interface Policy { layers: Array<{ kind: string; revision: string }> }

interface Props {
  connected: boolean
  transport: HermesTransport
  onNotice: (message: string) => void
}

function PluginField({ field, disabled, onSave }: {
  field: PluginSetting
  disabled: boolean
  onSave: (field: PluginSetting, value: string | boolean) => Promise<boolean>
}) {
  const initial = field.type === 'secret' ? '' : field.type === 'json'
    ? JSON.stringify(field.value ?? {}, null, 2) : String(field.value ?? '')
  const [value, setValue] = useState(initial)
  const [checked, setChecked] = useState(Boolean(field.value))
  return <form className="capability-field" onSubmit={event => {
    event.preventDefault()
    void onSave(field, field.type === 'boolean' ? checked : value).then(saved => {
      if (saved && field.type === 'secret') setValue('')
    })
  }}>
    <label>
      <span>{field.label}</span>
      {field.type === 'boolean' ? <input aria-label={field.label} type="checkbox" checked={checked} disabled={disabled} onChange={event => setChecked(event.target.checked)} />
        : field.type === 'enum' ? <select aria-label={field.label} value={value} disabled={disabled} onChange={event => setValue(event.target.value)}>
          {field.choices?.map(choice => <option key={choice}>{choice}</option>)}
        </select> : field.type === 'json' ? <textarea aria-label={field.label} value={value} disabled={disabled} onChange={event => setValue(event.target.value)} />
          : <input aria-label={field.label} type={field.type === 'secret' ? 'password' : field.type === 'number' ? 'number' : 'text'}
            step={field.type === 'number' ? 'any' : undefined} autoComplete="off" value={value} disabled={disabled}
            onChange={event => setValue(event.target.value)} />}
    </label>
    {field.description && <small>{field.description}</small>}
    {field.type === 'secret' && <small>{field.has_value ? 'Credential saved on host' : 'No credential saved'}</small>}
    <button type="submit" disabled={disabled}>Save</button>
  </form>
}

/** Lazy, host/profile-keyed configuration. Opening Settings does not start auth or install. */
export function CapabilitiesPanel({ connected, transport, onNotice }: Props) {
  const [plugins, setPlugins] = useState<AgentPlugin[]>([])
  const [servers, setServers] = useState<McpServer[]>([])
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const owner = useRef(0)
  const flight = useRef(false)
  useEffect(() => {
    owner.current += 1
    return () => { owner.current += 1 }
  }, [transport, connected])

  async function load() {
    if (!connected || flight.current) return
    const epoch = owner.current
    flight.current = true
    setBusy(true)
    setError('')
    const failures: string[] = []
    const request = async <T,>(method: string, params: Record<string, unknown>, apply: (value: T) => void) => {
      if (owner.current !== epoch) return;
      try {
        const value = await transport.gateway.request<T>(method, params)
        if (owner.current === epoch) apply(value)
      } catch (failure) {
        failures.push(`${method}: ${failure instanceof Error ? failure.message : String(failure)}`)
      }
    }
    await request<{ plugins?: AgentPlugin[] }>('plugins.manage', { action: 'list' }, value => setPlugins(value.plugins ?? []))
    await request<{ servers: McpServer[] }>('mcp.servers.list', {}, value => setServers(value.servers))
    await request<{ connectors: Connector[] }>('connectors.list', { owner: { type: 'account' } }, value => setConnectors(value.connectors))
    await request<Policy>('connectors.policy.get', {}, setPolicy)
    flight.current = false
    if (owner.current === epoch) {
      setBusy(false)
      setError(failures.join('\n'))
    }
  }

  async function change(action: () => Promise<unknown>, notice: string) {
    if (!connected || flight.current) return false
    const epoch = owner.current
    flight.current = true
    setBusy(true)
    setError('')
    try {
      const result = await action()
      if (owner.current === epoch) {
        const needsRestart = Boolean(result && typeof result === 'object' && 'restart_required' in result && result.restart_required)
        onNotice(needsRestart ? 'Plugin changed. The host reports a restart is required.' : notice)
      }
      return owner.current === epoch
    } catch (failure) {
      if (owner.current === epoch) setError(failure instanceof Error ? failure.message : String(failure))
      throw failure
    } finally {
      flight.current = false
      if (owner.current === epoch) setBusy(false)
    }
  }

  async function saveSetting(plugin: AgentPlugin, field: PluginSetting, value: string | boolean) {
    try {
      const saved = await change(async () => {
        if (field.type === 'secret') {
          if (!field.env || !String(value).trim()) throw new Error('A credential value and declared environment key are required')
          await transport.requestJson(capabilityPath('/api/env', transport.connection.profile), { key: field.env, value }, { method: 'PUT' })
        } else {
          const result = await transport.gateway.request<{ ok?: boolean; error?: string }>('plugins.manage', {
            action: 'settings', key: plugin.key, values: { [field.key]: pluginSettingValue(field, value) },
          })
          if (!result.ok) throw new Error(result.error || 'Plugin settings were not saved')
        }
      }, 'Plugin setting saved on host')
      if (saved) await load()
      return saved
    } catch {
      // The visible panel error owns the failure. Preserve the input for retry.
      return false
    }
  }

  const member = policy?.layers.find(layer => layer.kind === 'member')
  return <details className="control-section" open={open} onToggle={event => {
    const next = event.currentTarget.open
    setOpen(next)
    if (next && !open) void load()
  }}>
    <summary><span><strong>Capabilities</strong><small>Plugins, MCP servers and connectors</small></span><span className="disclosure-glyph">+</span></summary>
    <div className="control-body capabilities-panel">
      <button disabled={!connected || busy} onClick={() => void load()} type="button">Refresh capabilities</button>
      {error && <p role="alert" className="error-text">{error}</p>}
      <p className="settings-note">Changes are scoped to this host and profile. MCP changes apply to new sessions. Nothing installs or authorizes automatically.</p>
      <h3>Plugins</h3>
      {plugins.map(plugin => <details key={plugin.key} className="capability-entry">
        <summary>{plugin.name} <small>{plugin.status}</small></summary>
        <p>{plugin.description}</p>
        <button disabled={!connected || busy} type="button" onClick={() => {
          void change(async () => {
            const result = await transport.gateway.request<{ ok?: boolean; restart_required?: boolean; error?: string }>('plugins.manage', {
              action: 'toggle', key: plugin.key, enable: plugin.status !== 'enabled',
            })
            if (!result.ok) throw new Error(result.error || 'Plugin activation failed')
            return result
          }, 'Plugin activation updated').then(async saved => { if (saved) await load() }).catch(() => {})
        }}>{plugin.status === 'enabled' ? 'Disable' : 'Enable'}</button>
        {plugin.settings_schema?.map(field => <PluginField key={`${field.key}:${JSON.stringify(field.value)}`} field={field}
          disabled={!connected || busy} onSave={(setting, value) => saveSetting(plugin, setting, value)} />)}
      </details>)}
      <h3>MCP servers</h3>
      {servers.map(server => <div className="toolset-row" key={server.name}>
        <div><strong>{server.name}</strong><small>{server.transport}{server.plugin ? ` · ${server.plugin}` : ''}</small></div>
        <button disabled={!connected || busy || server.source === 'plugin'} aria-pressed={server.enabled} type="button"
          onClick={() => void change(() => setMcpEnabled(transport, server, !server.enabled), 'MCP change saved for new sessions').then(async saved => { if (saved) await load() }).catch(() => {})}>
          {server.enabled ? 'On' : 'Off'}
        </button>
      </div>)}
      <h3>Connectors</h3>
      {connectors.map(connector => <div className="toolset-row" key={connector.connector}>
        <div><strong>{connector.connector}</strong><small>{connector.connected ? 'Connected' : 'Not connected'}{connector.status_reason ? ` · ${connector.status_reason}` : ''}</small></div>
        <button disabled={!connected || busy || !member} aria-pressed={connector.enabled} type="button"
          onClick={() => void change(() => transport.gateway.request('connectors.policy.set', {
            expected_revision: member?.revision, change: { type: 'connector', connector: connector.connector, enabled: !connector.enabled },
          }), 'Connector policy saved').then(async saved => { if (saved) await load() }).catch(() => {})}>{connector.enabled ? 'On' : 'Off'}</button>
      </div>)}
    </div>
  </details>
}
