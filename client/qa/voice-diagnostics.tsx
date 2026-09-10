// Actual hook/effects and uploader, with no microphone, provider or host access.
import React, { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { usePetRealtime } from '../src/usePetRealtime'
import type { HermesTransport } from '../src/transport/hermes-transport'

const uploads: Array<{ host: string; path: string; body: unknown; options: unknown }> = []
const marker = 'synthetic-private-transcript-and-key-never-upload'
let effectSetups = 0
let effectCleanups = 0
let api: ReturnType<typeof usePetRealtime>
let refresh: () => void
function host(id = 'synthetic-host', profile = 'profile one'): HermesTransport {
  return {
    kind: 'browser', connection: { id, profile, baseUrl: 'https://synthetic.invalid', token: marker },
    requestJson: async (path: string, body: unknown, options: unknown) => {
      uploads.push({ host: id, path, body, options })
      return { accepted: 1 }
    },
  } as unknown as HermesTransport
}
const selected = {
  transport: host(), connectionId: 'synthetic-host', profile: 'profile one',
  uiContext: { page: marker }, sessionTitle: marker,
  context: [{ role: 'user' as const, content: marker }],
  // start() catches this before gateway setup or microphone acquisition. Its
  // fixed start.session_failed trace must not contain the exception message.
  ensureSession: async (): Promise<string> => { throw new Error(marker) },
  gateway: null, onMessages: () => {}, onAskHermes: async () => {},
  onMicrophoneOwnershipChange: () => {}, onReply: () => {},
  personalityName: marker, prompt: marker, runtimeSessionId: '',
}
function Fixture() {
  const [, update] = useState(0)
  refresh = () => update(n => n + 1)
  // Clone options to model the real App's per-render options object.
  api = usePetRealtime({ ...selected })
  useEffect(() => { effectSetups++; return () => { effectCleanups++ } }, [])
  return <div>Offline diagnostics fixture</div>
}
let root = createRoot(document.getElementById('root')!)
const render = () => flushSync(() => root.render(<StrictMode><Fixture /></StrictMode>))
render()
Object.assign(window, { diagnosticsQA: {
  uploads, marker,
  get counts() { return { effectSetups, effectCleanups } },
  start: () => api.start(),
  enabled: (enabled: boolean) => flushSync(() => api.setSettings({ ...api.settings, diagnostics: enabled })),
  optOutAndTraceBeforeRender: async () => {
    // setSettings updates its live ref before React's effects get a chance.
    api.setSettings({ ...api.settings, diagnostics: false })
    await api.start()
  },
  replace: (id: string, profile: string, rerender = true) => {
    selected.connectionId = id
    selected.profile = profile
    selected.transport = host(id, profile)
    if (rerender) flushSync(() => refresh())
  },
  selectedProfile: (profile: string) => {
    selected.profile = profile
    flushSync(() => refresh())
  },
  mutateTransport: (profile: string, rerender = false) => {
    selected.transport.connection.profile = profile
    if (rerender) { selected.profile = profile; flushSync(() => refresh()) }
  },
  omitTransport: () => {
    selected.transport = null as unknown as HermesTransport
    flushSync(() => refresh())
  },
  unmount: () => flushSync(() => root.unmount()),
  remount: () => { root = createRoot(document.getElementById('root')!); render() },
} })
