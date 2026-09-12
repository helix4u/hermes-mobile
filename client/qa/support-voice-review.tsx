// Real SupportOpsView and review dialog. All host routes are synthetic in memory.
import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { SupportOpsView } from '../src/components/SupportOpsView'
import type { HermesTransport } from '../src/transport/hermes-transport'
import type { PetRealtimeContextTarget } from '../src/usePetRealtime'
import '../src/styles.css'

const thread = { thread_id: '100000000000000001', title: 'Synthetic build issue', waiting_on_operator: true, has_ticket: true }
const text = 'Inspect the build. Do not change files.'
const requests: Array<{ host: string; path: string; body: unknown; options: unknown }> = []
const receipts: unknown[] = []
const errors: string[] = []
let target: PetRealtimeContextTarget | null = null
let rerender: () => void
let hold = false
let release: (() => void) | undefined
let reviewNumber = 0
let accepted = false
let failRefresh = false
let failSubmission = false
let failReceipt = false
function makeTransport(id: string): HermesTransport {
  return {
    kind: 'browser', connection: { id, profile: 'default', baseUrl: `https://${id}.invalid` },
    requestJson: async (path: string, body?: Record<string, unknown>, options?: unknown) => {
      requests.push({ host: id, path, body: body ? structuredClone(body) : undefined, options })
      if (path === '/api/audio/tts/providers') return { providers: [] }
      const route = path.replace('/api/plugins/support-ops', '')
      if (route === '/health') return { ok: true, external_posting: false, capabilities: { targeted_sync: false } }
      if (route === '/queue') {
        if (accepted && failRefresh) throw new Error('Synthetic refresh unavailable')
        return { threads: [thread], summary: { open: 1, waiting_operator: 1 } }
      }
      if (route === '/stats') return { totals: { open_now: 1 } }
      if (route === '/operator-config') return { config: {} }
      if (route === '/voice/read') return { status: 'ok', threads: [thread], matching: 1, revision: 'synthetic-revision' }
      if (route === '/voice/propose') return { id: `synthetic-review-${++reviewNumber}`, targetId: thread.thread_id,
        title: thread.title, action: 'investigate', text, status: 'pending_approval' }
      if (/^\/voice\/reviews\/synthetic-review-\d+\/approve$/.test(route)) {
        if (hold) await new Promise<void>(resolve => { release = resolve })
        if (failSubmission) throw new Error('Synthetic submission timed out')
        accepted = true
        return { status: 'submitted' }
      }
      throw new Error(`Unexpected synthetic route: ${route}`)
    },
  } as unknown as HermesTransport
}
const selected = { connected: true, connectionId: 'host-one', transport: makeTransport('host-one') }
const onStartVoiceSession = async (value: PetRealtimeContextTarget) => { target = value }
const onError = (error: string) => errors.push(error)
const onVoiceReceipt = (targetId: string, action: string) => {
  if (failReceipt) throw new Error('Synthetic receipt failure after acceptance')
  receipts.push({ targetId, action })
}
function Fixture() {
  const [, update] = useState(0)
  rerender = () => flushSync(() => update(n => n + 1))
  return <SupportOpsView key={selected.connectionId} active {...selected} onStartVoiceSession={onStartVoiceSession}
    onError={onError} onVoiceReceipt={onVoiceReceipt} />
}
const root = createRoot(document.getElementById('root')!)
flushSync(() => root.render(<StrictMode><Fixture /></StrictMode>))
Object.assign(window, { supportReviewQA: {
  requests, receipts, errors, text,
  get target() { return target },
  propose: () => target!.contextTools!.propose({ targetId: thread.thread_id, action: 'investigate', text }),
  holdApproval: () => { hold = true },
  releaseApproval: () => { hold = false; release?.(); release = undefined },
  failAfterAccept: (failure: string) => { failRefresh = failure === 'refresh'; failReceipt = failure === 'receipt' },
  failSubmission: () => { failSubmission = true },
  disconnect: () => { selected.connected = false; rerender() },
  replaceHost: () => {
    selected.connectionId = 'host-two'
    selected.transport = makeTransport('host-two')
    rerender()
  },
  rerender: () => rerender(),
  unmount: () => flushSync(() => root.unmount()),
} })
