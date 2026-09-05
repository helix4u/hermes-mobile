import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PetSidechatSheet } from '../src/components/PetSidechatSheet'
import { VoiceReviewNotice } from '../src/components/VoiceReviewNotice'
import { VoiceSettings } from '../src/components/VoiceSettings'
import { usePetCompanion } from '../src/usePetCompanion'
import '../src/styles.css'

const calls: string[] = []
let resolveGeneration: (value: any) => void = () => {}
let spoken = 0
let resolveCatalog: (value:any) => void = () => {}
const catalogChanges: any[] = []
const catalogTransport = { requestJson: () => new Promise(resolve => { resolveCatalog = resolve }) }
const gateway = { onEvent: () => () => {}, request: async (method: string) => {
  calls.push(method)
  if (method === 'pet.commentary.generate') return new Promise(resolve => { resolveGeneration = resolve })
  return {}
} }
const empty: any[] = []
const speak = async () => { spoken++ }
function Fixture() {
  const [catalogMode, setCatalogMode] = useState(false)
  const [active, setActive] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [open, setOpen] = useState(true)
  const [pending, setPending] = useState(false)
  const [settingsRequest, setSettingsRequest] = useState(0)
  const pet = usePetCompanion({ connected: true, connectionId: 'synthetic', profile: 'default', gateway: gateway as any,
    ensureSession: async () => 'synthetic', runtimeSessionId: 'synthetic', prepareSpeechSequence: () => null,
    speakSequence: speak, transcript: empty, transport: null, turnActive: false })
  ;(window as any).petQa = { pet, calls, get spoken() { return spoken }, finish: () => resolveGeneration({ok:true,text:'late generated text'}),
    showCatalog: () => setCatalogMode(true), catalogChanges, finishCatalog: () => resolveCatalog({providers:[{id:'other-provider',voices:[]}]}),
    requestReview: () => { setPending(true); setOpen(false) },
    buildKeywords: () => import('../src/sherpa-keywords').then(module => module.buildSherpaKeywordDefinitions(['hey hermes', 'hey pet', 'hey companion'])),
    fill: () => setMessages(Array.from({length:20}, (_,i) => ({id:`message-${i}`,role:'assistant',text:`Synthetic message ${i} with **formatting** and enough text to scroll. `.repeat(6)}))),
    append: () => setMessages(previous => [...previous, {id:`message-${previous.length}`,role:'assistant',text:'New synthetic update.'}]) }
  if (catalogMode) return <VoiceSettings connected transport={catalogTransport as any} selection={{provider:'saved-provider',voice:'saved-voice',speed:1,instruct:'Keep my instruction',language:'en'} as any} onChange={value => catalogChanges.push(value)} />
  return <main className="app-shell"><header><button aria-label="Open voice conversation" onClick={() => setOpen(true)}>Voice</button><button aria-label="Live voice settings" onClick={() => { setOpen(true); setSettingsRequest(v => v + 1) }}>Settings</button></header>
    <div className="mobile-workspace" style={{minHeight:0,overflow:'auto'}}>Synthetic attached session</div>
    <VoiceReviewNotice pending={pending && !open} supportPending={false} onReview={() => setOpen(true)} onSupportReview={() => {}} />
    <PetSidechatSheet busy={false} error="" name="A companion with a very long name" open={open} messages={messages} settingsRequest={settingsRequest}
    onClose={() => setOpen(false)} onLoad={() => {}} onPersonalityChange={() => {}} onReset={() => {}}
    onSend={async () => true} onSendToHermes={() => {}} onToggleRecording={() => {}} onTranscriptTarget={() => {}}
    personalities={pet.catalog} personalitySlug="alien-child" voicePhase="idle" voiceRecordingAvailable
    realtime={{ approveHermesDraft: async () => true, cancelHermesDraft: () => {}, updateHermesDraft: () => {},
      start: async () => { setActive(true); return true }, stop: () => setActive(false), voice:'shimmer', setVoice: () => {},
      settings:{model:'gpt-realtime-2.1-mini',effort:'default'},setSettings:()=>{},setMicrophoneMuted:()=>{},
      snapshot:{ active, status:active?'listening':'idle', activity:[], attachedContextId:'synthetic', commentary:[], contextPreview:[],
        contextStats:active ? {activityItems:0,cacheHit:false,characters:20,commentaryItems:0,estimatedTokens:5,inputTokens:100,liveUpdateBytes:0,liveUpdateCount:0,messages:1,omittedCharacters:0,outputTokens:20,payloadBytes:20,totalTokens:120,truncatedItems:0,
          billing:{model:'gpt-realtime',input:100,output:20,total:120,cached:0,usd:.00168,pricedResponses:1,unpricedResponses:0,transcriptions:1}} : null,
        error:'',hermesDraft:pending?'Synthetic reviewed request':'',hermesDraftStatus:pending?'pending':'idle',transcript:'A live synthetic spoken response.',inputStatus:'Listening for speech',
        inputWarning:'No microphone signal detected yet. Check the selected input.'} }} /><nav className="bottom-nav">Chat</nav></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
