import { createRoot } from 'react-dom/client'
import { SupportOpsView } from '../src/components/SupportOpsView'
import type { HermesTransport } from '../src/transport/hermes-transport'
import type { SupportJob } from '../src/support-ops'
import { applyThemeSelection } from '../src/state/theme'
import '../src/vendor/desktop/desktop-tokens.css'
import '../src/styles.css'
import '../src/skin/index.css'

applyThemeSelection('host', null, new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark')
const jobs: SupportJob[] = Array.from({ length: 40 }, (_, index) => ({
  id: (index + 1).toString(16).padStart(12, '0'), kind: 'sync_thread',
  status: index === 0 ? 'running' : index === 1 ? 'queued' : 'completed',
  result: { message: 'Synthetic operation completed' }, thread_id: '900000000000000001',
}))
const calls: Array<{ path: string; body?: Record<string, unknown> }> = []
const rows = Array.from({ length: 12 }, (_, index) => ({
  thread_id: String(900000000000000001n + BigInt(index)),
  title: index === 0 ? 'Example support case: connection recovery after switching sessions' : `Example support case ${index + 1}`,
  topic_label: index % 2 ? 'Desktop' : 'Messaging', ticket_status: 'needs-reply',
  has_ticket: true, waiting_on_operator: true, participants: ['Reporter', 'Operator'],
}))
Object.assign(window, { supportLayoutCalls: calls })
const transport = {
  connection: { id: 'support-layout', baseUrl: 'https://synthetic.invalid', profile: 'default' },
  gateway: { request: async () => ({ toolsets: [] }) },
  requestJson: async <T,>(path: string, body?: Record<string, unknown>): Promise<T> => {
    calls.push({ path, body })
    if (path.endsWith('/queue')) return { threads: rows, summary: { open: 12, waiting_on_operator: 12, waiting_on_support: 3, pr_review_pending: 2, stale: 1, without_ticket: 4 } } as T
    if (path.endsWith('/health')) return { ok: true, capabilities: {
      targeted_sync: true, queued_jobs: true, idempotent_requests: true, async_operations: true, backend_control: true,
    }, backend: { running: true, credential_ready: true } } as T
    if (path.endsWith('/stats')) return { totals: { open_now: 12, closed: 34, all_threads: 46 }, daily: [], issue_clusters: { cluster_count: 3 } } as T
    if (path.endsWith('/operator-config')) return { config: { operator_name: 'Operator', team_members: [], categories: ['Desktop', 'Messaging'] } } as T
    if (path.endsWith('/sync') && body) return { jobs, started: 40 } as T
    if (/\/jobs\/[a-f0-9]{12}$/.test(path)) return jobs.find(job => path.endsWith(job.id)) as T
    if (path.includes('/audio/')) return { providers: [], voices: [] } as T
    if (path.includes('/settings')) return { settings: {}, options: {} } as T
    if (/\/threads\/\d+$/.test(path)) return { title: rows[0].title, thread_id: rows[0].thread_id, messages: [], workspace: {}, ticket: null } as T
    if (path.includes('/jobs')) return { jobs } as T
    throw new Error(`Unexpected fixture read ${path}`)
  },
} as unknown as HermesTransport

createRoot(document.getElementById('root')!).render(<div className="app-shell">
  <header className="topbar"><h1>Support</h1></header>
  <div className="mobile-workspace"><section className="app-view support-view active">
    <SupportOpsView active connected connectionId="support-layout" transport={transport} />
  </section></div>
</div>)
