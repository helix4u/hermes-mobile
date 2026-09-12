import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionVoiceControls } from '../src/components/SessionVoiceControls'
import { LiveVoiceMicrophoneButton } from '../src/components/LiveVoiceMicrophoneButton'
import { WorkStatus } from '../src/components/WorkStatus'
import { ChevronDownIcon } from '../src/components/UiIcons'
import { PetSidechatSheet } from '../src/components/PetSidechatSheet'
import type { PetSidechatMessage } from '../src/pet'
import { usePetRealtime } from '../src/usePetRealtime'
import { supportVoiceContext, supportReviewSnapshot, type SupportVoiceReview } from '../src/support-voice'
import '../src/styles.css'

const sent: any[] = []
const tracks: any[] = []
const peers: any[] = []
const constraints: any[] = []
let sessionRequests = 0
let contextResolve: ((value: any) => void) | null = null
let holdContext = false
let contextRequests = 0
let sessionContext: Record<string, unknown> = { context: [] }
const approved: any[] = []
const histories: any[] = []
const gatewayCalls: Array<{method:string;params:unknown}> = []
let knowledgeResult: unknown = {}
let credentialsResolve: ((value: any) => void) | null = null
let holdCredentials = false
let connectionFails = false
let recordMode = 'hold'
let supportReview: SupportVoiceReview | null = null
const supportApprovals: SupportVoiceReview[] = []
const pendingRecords: Array<{ params: any; resolve: (value: unknown) => void }> = []
const savedMessages: PetSidechatMessage[] = []
function releaseRecord() {
  const pending = pendingRecords.shift()
  if (!pending) throw new Error('No pending synthetic record')
  const { turnId, userText, petText } = pending.params
  savedMessages.push({ id: `${turnId}:user`, role: 'user', text: userText },
    { id: `${turnId}:pet`, role: 'assistant', text: petText })
  // The real record RPC acknowledges only the newly appended turn.
  pending.resolve({ messages: savedMessages.slice(-2) })
}
let contextsClosed = 0
class LocalAudioContext {
  state = 'running'
  resume() { return Promise.resolve() }
  close() { this.state = 'closed'; contextsClosed++; return Promise.resolve() }
  createAnalyser() { return { fftSize: 32, getFloatTimeDomainData: (values: Float32Array) => values.fill(0.1) } }
  createMediaStreamSource() { return { connect() {} } }
}
Object.defineProperty(window, 'AudioContext', { configurable: true, value: LocalAudioContext })
let playbackFails = false
let microphoneFails = false
HTMLMediaElement.prototype.play = () => playbackFails ? Promise.reject(new Error('Synthetic playback failure')) : Promise.resolve()
let channel: any
class Peer {
  constructor() { peers.push(this) }
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription: any = null
  createDataChannel() { channel = { readyState: 'open', send: (data: string) => sent.push(JSON.parse(data)), close() {} }; return channel }
  addEventListener() {}
  removeEventListener() {}
  addTrack() {}
  getStats() { return Promise.resolve(new Map()) }
  createOffer() { return Promise.resolve({ sdp: 'synthetic' }) }
  setLocalDescription(value: any) { this.localDescription = value; return Promise.resolve() }
  setRemoteDescription() { queueMicrotask(() => channel.onopen()); return Promise.resolve() }
  close() {}
}
// Configurable because a live fixture edit can replace the mocks through HMR.
Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: Peer })
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async (request: any) => {
  constraints.push(request)
  if (microphoneFails) throw new DOMException('', 'OverconstrainedError')
  const track = { enabled: true, label: 'Synthetic microphone', readyState: 'live', getSettings: () => ({ deviceId: 'synthetic-input' }), stop() { this.readyState = 'ended' } }
  tracks.push(track)
  return { getAudioTracks: () => [track], getTracks: () => [track] }
}})
window.fetch = async () => { if (connectionFails) throw new Error('Synthetic connection failure'); return new Response('synthetic-answer') }
const credentials = { initialContextEvents: [1, 2].map(index => ({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Synthetic complete context part ${index}/2` }] } })), requestDelegationLimit: true, endpoint: '/synthetic', clientSecret: 'synthetic', openingInstruction: 'Hey.', model: 'gpt-realtime', contextStats: { messages: 1, characters: 20 } }
const gateway = { request: async (method: string, params:unknown) => {
  gatewayCalls.push({method,params})
  if (method === 'pet.realtime.record') {
    if (recordMode === 'fail') throw new Error('Synthetic save failure')
    if (recordMode === 'empty') return {}
    return new Promise(resolve => { pendingRecords.push({ params, resolve }) })
  }
  if (method === 'pet.sidechat.history') return { messages: [...savedMessages] }
  if (method === 'pet.realtime.knowledge') return knowledgeResult
  if (method === 'delegation.status') return {active:[{subagent_id:'worker-a'}]}
  if (method === 'subagent.steer') return {status:'queued'}
  if (method === 'pet.realtime.context') {
    contextRequests++
    if (holdContext) return new Promise(resolve => { contextResolve = resolve })
    return sessionContext
  }
  if (method !== 'pet.realtime.session') return {}
  sessionRequests++
  if (holdCredentials) return new Promise(resolve => { credentialsResolve = resolve })
  if ((params as any)?.voiceEngine === 'live') return { voiceEngine: 'live', sdpAnswer: 'synthetic-live-answer',
    liveSessionId: 'live_synthetic', model: 'gpt-live-1', requestDelegationLimit: true,
    initialContext: null, liveDelegation: 'responses', contextStats: { messages: 1, characters: 34 } }
  return credentials
} }

function Fixture() {
  const [messages, setMessages] = useState<PetSidechatMessage[]>([])
  const [view, setView] = useState({page:'chat',focusedSessionId:'synthetic-session'})
  const [wake, setWake] = useState<'off' | 'review' | 'send'>('review')
  const [auto, setAuto] = useState(true)
  const [mode, setMode] = useState<'steer' | 'interrupt'>('steer')
  const [menu, setMenu] = useState(false)
  const realtime = usePetRealtime({ connectionId: 'synthetic-fixture', gateway: gateway as any,
    uiContext:view, sessionTitle:'Synthetic task',
    context: [], ensureSession: async () => 'synthetic-session', runtimeSessionId: 'synthetic-session',
    onAskHermes: async request => { approved.push(request) }, onMessages: messages => { histories.push(messages); setMessages(messages) }, onMicrophoneOwnershipChange: () => {},
    onReply: () => {}, personalityId: 'synthetic', personalityName: 'Companion', prompt: 'Synthetic test.' })
  ;(window as any).qa = { realtime, sent, tracks, peers, failPlayback: () => { playbackFails = true; peers.at(-1).ontrack({ streams: [new MediaStream()] }) }, disconnect: () => { const peer = peers.at(-1); peer.connectionState = 'disconnected'; peer.onconnectionstatechange() }, frame: (data: any) => channel.onmessage({ data: JSON.stringify(data) }) }
  Object.assign((window as any).qa, { constraints, get sessionRequests() { return sessionRequests }, get contextsClosed() { return contextsClosed },
    startLive: async () => { realtime.setSettings({ ...realtime.settings, engine: 'live' }); await realtime.start() },
    useRealtime: () => { realtime.stop(); realtime.setSettings({ ...realtime.settings, engine: 'realtime' }) },
    supportApprovals, supportSnapshot: () => supportReviewSnapshot(supportReview),
    editSupport: (patch: Partial<SupportVoiceReview>) => { if (supportReview) supportReview = { ...supportReview, ...patch } },
    cancelSupport: () => { supportReview = null },
    startSupport: async () => {
      realtime.setSettings({ ...realtime.settings, approval: 'on' })
      await realtime.startContext(supportVoiceContext('synthetic-fixture', undefined,
        async (path, body) => path === '/voice/propose'
          ? { id: 'review-one', targetId: '100000000000000001', title: 'Synthetic issue', action: 'investigate', text: 'Inspect the failure. Do not change files.', status: 'pending_approval' }
          : { threads: [], matching: 0 },
        review => { supportReview = review }))
    },
    releaseRecord, setRecordMode: (mode: string) => { recordMode = mode },
    setSessionContext: (value: Record<string, unknown>) => { sessionContext = value },
    approved, histories, gatewayCalls, setView, setKnowledgeResult: (value: unknown) => { knowledgeResult = value }, get contextRequests() { return contextRequests }, holdContext: () => { holdContext = true }, releaseContext: () => contextResolve?.({ context: [] }),
    hold: () => { holdCredentials = true }, release: () => credentialsResolve?.(credentials), failConnection: () => { connectionFails = true }, failMicrophone: () => { microphoneFails = true } })
  if (new URLSearchParams(location.search).has('voicePage')) return <PetSidechatSheet
    busy={false} error="" messages={messages} name="Companion" open
    onClose={() => {}} onLoad={() => {}} onPersonalityChange={() => {}} onReset={() => {}}
    onSend={async () => true} onSendToHermes={() => {}} onTranscriptTarget={() => {}}
    onToggleRecording={() => {}} personalities={[]} personalitySlug="synthetic"
    realtime={realtime} voicePhase="idle" voiceRecordingAvailable={false} />
  return <main className="app-shell">
    <header className="topbar"><button className="brand-button"><span className="brand-mark-shell"><img className="brand-mark" src="/nous-sidecar-128.png"/><span className="brand-exp-badge">EXP</span></span><span><small>Hermes</small><strong>Mobile</strong></span></button>
      <div className="topbar-statuses"><LiveVoiceMicrophoneButton muted={!!realtime.snapshot.microphoneMuted} onChange={realtime.setMicrophoneMuted}/><button aria-label="Connection: Workstation. Profile: default" className="host-pill" title="Workstation · default"><span className="host-dot"/><span className="host-pill-copy"><strong>Workstation</strong><small>default</small></span><span className="host-chevron"><ChevronDownIcon/></span></button></div></header>
    <div className="mobile-workspace"><section className="app-view chat-view active">
      <div className="thread-heading"><div className="thread-heading-copy"><p className="eyebrow">Live</p><h1>A long synthetic session title that must never wrap</h1></div><div className="thread-actions"><button className="thread-actions-trigger quiet-button" onClick={() => setMenu(!menu)}>Options</button>{menu && <div className="thread-actions-popover"><button className="thread-menu-action" onClick={() => void realtime.start()}>Start test voice</button><SessionVoiceControls nativeClient wakeWordMode={wake} autoSpeak={auto} activeTurnInputMode={mode} onWakeChange={setWake} onAutoSpeakChange={setAuto} onInputModeChange={setMode}/></div>}</div></div>
      <div className="session-workspace-button">Session workspace</div>
      <div className="transcript"><p>Completed message stays visible.</p><p>{realtime.snapshot.error}</p></div>
      <form className="composer" onSubmit={event => event.preventDefault()}><WorkStatus status={{ todos: [{id:'task',content:'Verify the current turn',status:'in_progress'}],subagents:[],todoRevision:1 }}/><div className="composer-box"><button className="voice-button" type="button">Mic</button><textarea placeholder="Message Hermes"/><button type="button" className="send-button stop-turn-button" aria-label="Stop running turn"><span className="stop-square"/></button></div></form>
    </section></div><nav className="bottom-nav"><button>Chat</button><button>Sessions</button><button>Control</button></nav>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
