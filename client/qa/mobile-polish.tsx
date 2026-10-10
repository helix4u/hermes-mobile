import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionsView } from '../src/components/SessionsView'
import { CapabilitiesPanel } from '../src/components/CapabilitiesPanel'
import { SupportOpsView } from '../src/components/SupportOpsView'
import { ContextMeter } from '../src/components/ContextMeter'
import type { JsonRpcGatewayClient, GatewayEventListener } from '../src/protocol/json-rpc-client'
import type { HermesTransport } from '../src/transport/hermes-transport'
import type { SessionSummary } from '../src/protocol/types'
import '../src/styles.css'
import '../src/vendor/desktop/desktop-tokens.css'
import '../src/skin/index.css'
import { applyThemeSelection } from '../src/state/theme'

applyThemeSelection('host', null, 'dark')

const calls: Array<{ method: string; params: unknown }> = []
let setting = 'careful'
let mcpEnabled = true
const transport = {
  connection: { id: 'synthetic', profile: 'qa-profile' },
  gateway: { request: async <T,>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    calls.push({ method, params })
    if (method === 'plugins.manage') {
      if (params.action === 'settings') { setting = String((params.values as Record<string, unknown>).mode); return { ok: true } as T }
      return { plugins: [{ name: 'Sample plugin', key: 'sample', status: 'enabled', version: '1', description: 'Synthetic plugin settings',
        settings_schema: [{ key: 'mode', type: 'enum', label: 'Mode', description: 'Execution style', required: true, value: setting, choices: ['careful', 'fast'] }] }] } as T
    }
    if (method === 'mcp.servers.list') return { servers: [
      { name: 'sample-server', transport: 'stdio', source: 'config', enabled: mcpEnabled },
      { name: 'owned-server', transport: 'stdio', source: 'plugin', plugin: 'Sample plugin', enabled: true },
    ] } as T
    if (method === 'connectors.list') return { connectors: [{ connector: 'sample-connector', connected: true, enabled: true }] } as T
    if (method === 'connectors.policy.get') return { layers: [{ kind: 'member', revision: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }] } as T
    if (method === 'connectors.policy.set') return { revision: '01ARZ3NDEKTSV4RRFFQ69G5FAW' } as T
    throw new Error(`Unexpected synthetic request ${method}`)
  } },
  requestJson: async <T,>(path: string, body?: Record<string, unknown>): Promise<T> => {
    calls.push({ method: path, params: body })
    if (path.includes('/mcp/servers/')) { mcpEnabled = Boolean(body?.enabled); return { ok: true } as T }
    if (path.endsWith('/queue')) return { threads: [{ thread_id: 'synthetic-1', title: 'Connection recovery while changing sessions', has_ticket: true,
      participants: ['Reporter', 'Operator'], waiting_on_support: true, waiting_on_operator: true }], summary: { open: 1, needs_reply: 1 } } as T
    if (path.endsWith('/health')) return { ok: true, capabilities: { targeted_sync: false }, backend: { running: false } } as T
    if (path.endsWith('/stats')) return { totals: { open_now: 1 } } as T
    if (path.endsWith('/operator-config')) return { config: { operator_name: 'Operator' } } as T
    if (path.includes('/audio/')) return { voices: [], providers: [] } as T
    throw new Error(`Unexpected synthetic HTTP ${path}`)
  },
} as unknown as HermesTransport
Object.assign(window, { polishCalls: calls })
const surface = new URLSearchParams(location.search).get('surface') || 'sessions'
const sessions: SessionSummary[] = [
  { id: 'one', title: 'Zeta notes', preview: '', source: 'desktop', message_count: 3, started_at: 100, last_active: 100 },
  { id: 'two', title: 'Alpha plan', preview: '', source: 'mobile', message_count: 5, started_at: 200, last_active: 200 },
]
const contextListeners = new Set<GatewayEventListener>()
let contextUsed = 45000
const contextGateway = {
  request: async () => ({ context_used: contextUsed, context_max: 100000, context_estimated: false, compression_threshold_tokens: 60000 }),
  onEvent: (listener: GatewayEventListener) => { contextListeners.add(listener); return () => { contextListeners.delete(listener) } },
} as unknown as JsonRpcGatewayClient
Object.assign(window, { compressContext: () => {
  contextUsed = 20000
  for (const listener of contextListeners) listener({ type: 'status.update', session_id: 'context-session', payload: { kind: 'compacting' } })
}, finishCompression: () => {
  for (const listener of contextListeners) listener({ type: 'session.usage', session_id: 'context-session', payload: { usage: { compressions: 1 } } })
} })
function Fixture() {
  const [selected, setSelected] = useState('')
  return <div className="app-shell"><header className="topbar"><h1>Mobile polish fixture</h1></header>
    <div className="mobile-workspace"><section className={`app-view ${surface === 'support' ? 'support' : surface === 'capabilities' ? 'control' : surface === 'context' ? 'chat' : 'sessions'}-view active`}>
      {surface === 'sessions' ? <><SessionsView connected profile="qa-profile" sessions={sessions}
        activeSessions={[{ id: 'runtime', session_key: 'one', title: 'Zeta notes', status: 'working', started_at: 300 }]}
        selectedSessionId="one" selectedRuntimeSessionId="runtime" activeProjectId="" projectDetail={null} projectLoading={false} projects={[]}
        onNewSession={() => setSelected('new')} onActiveSession={async row => { setSelected(`live:${row.id}`) }}
        onSession={async row => { setSelected(`stored:${row.id}`) }} onProject={async () => {}} onRefresh={async () => {}} />
        <output aria-label="Selected entry">{selected}</output></>
        : surface === 'context' ? <><div className="transcript" style={{ flex: 1 }} /><form className="composer"><div className="composer-meta">
          <button className="session-workspace-button"><strong>C:\synthetic\long-workspace-name\project</strong></button>
          <span className="composer-hint">Attached</span>
          <ContextMeter sessionId="context-session" gateway={contextGateway} active />
        </div></form></>
        : surface === 'support' ? <SupportOpsView active connected connectionId="synthetic" transport={transport} />
          : <CapabilitiesPanel connected transport={transport} onNotice={message => { calls.push({ method: 'notice', params: message }) }} />}
    </section></div></div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
